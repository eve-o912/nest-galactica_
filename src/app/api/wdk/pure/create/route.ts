import { NextRequest, NextResponse } from 'next/server';
import { WDKManager } from '@/lib/wdk/wdk-integration';
import { encrypt } from '@/lib/wdk/crypto';
import { logger } from '@/lib/retry';
import { query } from '@/lib/db';

const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;

if (!WALLET_ENCRYPTION_KEY) {
  throw new Error('WALLET_ENCRYPTION_KEY is required');
}

// POST /api/wdk/pure/create - Create new wallet
export async function POST(request: NextRequest) {
  try {
    const { userId, chain = 'base' } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if wallet already exists
    const existingWallet = await query(
      'SELECT * FROM wdk_wallets WHERE user_id = $1',
      [userId]
    );

    if (existingWallet.length > 0) {
      return NextResponse.json(
        { error: 'Wallet already exists for this user' },
        { status: 409 }
      );
    }

    // Create new WDK wallet
    const { wallet, mnemonic, privateKey } = WDKManager.createWallet({
      chain: chain as 'base' | 'ethereum' | 'polygon' | 'arbitrum',
    });

    // Encrypt sensitive data
    const encryptedData = await encrypt(
      JSON.stringify({
        address: wallet.address,
        mnemonic,
        privateKey,
        chain,
      }),
      WALLET_ENCRYPTION_KEY
    );

    // Save to database
    await query(
      `INSERT INTO wdk_wallets (user_id, address, public_key, encrypted_data, wallet_type, network, account_abstraction)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        wallet.address,
        wallet.publicKey,
        encryptedData,
        'wdk',
        chain,
        false,
      ]
    );

    logger.info('WDK wallet created successfully', { 
      userId, 
      address: wallet.address, 
      chain,
      walletType: 'WDK-compatible'
    });

    return NextResponse.json({
      success: true,
      address: wallet.address,
      publicKey: wallet.publicKey,
      chain,
      walletType: 'WDK',
      message: 'WDK wallet created successfully',
    });

  } catch (error: any) {
    logger.error('Failed to create WDK wallet', error);
    return NextResponse.json(
      { error: 'Failed to create wallet', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
