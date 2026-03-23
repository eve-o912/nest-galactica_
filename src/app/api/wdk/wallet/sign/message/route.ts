import { NextRequest, NextResponse } from 'next/server';
import { createWDKClient } from '@/lib/wdk/client';
import { decrypt } from '@/lib/wdk/crypto';
import { logger } from '@/lib/retry';

const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;

if (!WALLET_ENCRYPTION_KEY) {
  throw new Error('WALLET_ENCRYPTION_KEY is required');
}

// POST /api/wdk/wallet/sign/message - Sign message
export async function POST(request: NextRequest) {
  try {
    const { userId, message } = await request.json();

    if (!userId || !message) {
      return NextResponse.json(
        { error: 'User ID and message are required' },
        { status: 400 }
      );
    }

    // Get wallet from database
    const { queryOne } = await import('@/lib/db');
    const walletRecord = await queryOne(
      'SELECT * FROM wdk_wallets WHERE user_id = $1',
      [userId]
    );

    if (!walletRecord) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      );
    }

    // Decrypt wallet data
    const decryptedData = JSON.parse(
      await decrypt(walletRecord.encrypted_data, WALLET_ENCRYPTION_KEY)
    );

    // Create WDK client
    const wdkClient = await createWDKClient();
    
    // Create wallet instance
    const wallet = wdkClient.restoreWallet({
      type: 'evm',
      address: decryptedData.address,
      privateKey: decryptedData.privateKey,
      mnemonic: decryptedData.mnemonic,
      network: 'base',
      accountAbstraction: true
    });

    // Sign message
    const signature = await wallet.signMessage(message);

    logger.info('Message signed', { userId, message: message.substring(0, 50) });

    return NextResponse.json({
      success: true,
      signature,
      address: decryptedData.address
    });

  } catch (error) {
    logger.error('Failed to sign message', error);
    return NextResponse.json(
      { error: 'Failed to sign message' },
      { status: 500 }
    );
  }
}
