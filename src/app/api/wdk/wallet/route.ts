import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, restoreEVMWallet } from '@/lib/wdk/client';
import { encrypt, decrypt } from '@/lib/wdk/crypto';
import { withRetry, logger } from '@/lib/retry';

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;

if (!WALLET_ENCRYPTION_KEY) {
  throw new Error('WALLET_ENCRYPTION_KEY is required');
}

// POST /api/wdk/wallet - Create a new wallet
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Create WDK client
    const wdkClient = await createWalletClient();
    
    // Create EVM wallet with USDT bridge support
    const wallet = await createEVMWallet({
      mnemonic: undefined,
      useAccountAbstraction: false, // Use basic EVM wallet for now
    });

    // Encrypt private key/seed phrase
    const encryptedData = await encrypt(
      JSON.stringify({
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic
      }),
      WALLET_ENCRYPTION_KEY
    );

    // Store in database
    const result = await withRetry(
      async () => {
        const { query } = await import('@/lib/db');
        return query(
          `INSERT INTO wdk_wallets (user_id, address, encrypted_data, created_at) 
           VALUES ($1, $2, $3, NOW()) 
           ON CONFLICT (user_id) 
           DO UPDATE SET 
             address = $2, 
             encrypted_data = $3, 
             updated_at = NOW() 
           RETURNING *`,
          [userId, wallet.address, encryptedData]
        );
      },
      { maxAttempts: 3, delay: 1000 }
    );

    logger.info('WDK wallet created', { userId, address: wallet.address });

    return NextResponse.json({
      success: true,
      address: wallet.address,
      publicKey: wallet.publicKey
    });

  } catch (error) {
    logger.error('Failed to create WDK wallet', error);
    return NextResponse.json(
      { error: 'Failed to create wallet' },
      { status: 500 }
    );
  }
}

// GET /api/wdk/wallet - Get wallet info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
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

    // Restore wallet instance
    const wallet = await restoreEVMWallet({
      address: decryptedData.address,
      privateKey: decryptedData.privateKey,
      mnemonic: decryptedData.mnemonic,
      useAccountAbstraction: false,
    });

    // Create public client to get balance
    const publicClient = createWalletClient({
      chain: base,
      transport: http(BASE_RPC_URL)
    });

    const balance = await publicClient.getBalance({
      address: decryptedData.address as `0x${string}`
    });

    return NextResponse.json({
      success: true,
      address: wallet.address,
      publicKey: wallet.publicKey
    });

  } catch (error) {
    logger.error('Failed to get WDK wallet', error);
    return NextResponse.json(
      { error: 'Failed to get wallet' },
      { status: 500 }
    );
  }
}
