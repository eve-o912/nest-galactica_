import { NextRequest, NextResponse } from 'next/server';
import { WDKManager } from '@/lib/wdk/wdk-integration';
import { encrypt } from '@/lib/wdk/crypto';
import { logger } from '@/lib/retry';
import { query } from '@/lib/db';

const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;

// POST /api/wdk/pure/create - Create new wallet
export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let chain: string | null = null;
  
  try {
    // Check if encryption key is available FIRST
    if (!WALLET_ENCRYPTION_KEY) {
      logger.error('WALLET_ENCRYPTION_KEY not set');
      return NextResponse.json(
        { 
          error: 'Server configuration error',
          debug: { 
            hasEncryptionKey: false,
            solution: 'Please add WALLET_ENCRYPTION_KEY to environment variables'
          }
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    userId = body.userId;
    chain = body.chain || 'base';

    logger.info('Create wallet request', { userId, chain });

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

    logger.info('Existing wallet check', { 
      userId, 
      exists: existingWallet.length > 0 
    });

    if (existingWallet.length > 0) {
      return NextResponse.json(
        { 
          error: 'Wallet already exists for this user',
          existingAddress: existingWallet[0].address
        },
        { status: 409 }
      );
    }

    // Create new WDK wallet
    const { wallet, mnemonic, privateKey } = WDKManager.createWallet({
      chain: chain as 'base' | 'ethereum' | 'polygon' | 'arbitrum',
    });

    logger.info('WDK wallet created in memory', { 
      userId, 
      address: wallet.address, 
      chain 
    });

    // Encrypt sensitive data
    let encryptedData: string;
    try {
      encryptedData = await encrypt(
        JSON.stringify({
          address: wallet.address,
          mnemonic,
          privateKey,
          publicKey: wallet.publicKey,
          chain,
        }),
        WALLET_ENCRYPTION_KEY
      );
    } catch (encryptError) {
      logger.error('Encryption failed', {
        error: encryptError instanceof Error ? encryptError.message : String(encryptError),
        userId
      });
      return NextResponse.json(
        { error: 'Failed to encrypt wallet data' },
        { status: 500 }
      );
    }

    // Save to database
    try {
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
    } catch (dbError) {
      logger.error('Database insert failed', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
        userId,
        address: wallet.address
      });
      return NextResponse.json(
        { error: 'Failed to save wallet to database' },
        { status: 500 }
      );
    }

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
    logger.error('Failed to create WDK wallet', {
      error: error.message,
      stack: error.stack,
      userId: userId || 'unknown',
      chain: chain || 'unknown'
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to create wallet', 
        details: error?.message || 'Unknown error',
        debug: {
          hasEncryptionKey: !!WALLET_ENCRYPTION_KEY,
          userId: userId || 'missing',
          chain: chain || 'missing'
        }
      },
      { status: 500 }
    );
  }
}
