import { NextRequest, NextResponse } from 'next/server';
import { getTronWeb, getTronUSDTBalance, getTrxBalance, createTronWallet } from '@/lib/tron/client';
import { decrypt } from '@/lib/wdk/crypto';
import { logger } from '@/lib/retry';
import { query } from '@/lib/db';

const TRON_ENCRYPTION_KEY = process.env.TRON_ENCRYPTION_KEY || process.env.WALLET_ENCRYPTION_KEY;

// GET /api/tron/balance - Get TRON wallet balances
export async function GET(request: NextRequest) {
  let userId: string | null = null;
  
  try {
    logger.info('TRON Balance API called', { url: request.url });

    // Check if encryption key is available
    if (!TRON_ENCRYPTION_KEY) {
      logger.error('TRON_ENCRYPTION_KEY not set', new Error('Missing environment variable'));
      return NextResponse.json(
        { error: 'Server configuration error: TRON_ENCRYPTION_KEY not set' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    userId = searchParams.get('userId');

    logger.info('TRON Balance request parameters', { userId });

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get TRON wallet from database
    const walletRecord = await query(
      'SELECT * FROM tron_wallets WHERE user_id = $1',
      [userId]
    );

    logger.info('TRON Wallet query result', { 
      userId, 
      walletCount: walletRecord.length,
      hasWallet: walletRecord.length > 0 
    });

    if (!walletRecord.length) {
      logger.info('No TRON wallet found for user', { userId });
      return NextResponse.json(
        { error: 'TRON wallet not found' },
        { status: 404 }
      );
    }

    // Decrypt wallet data
    const decryptedData: {
      address: string;
      privateKey?: string;
      mnemonic?: string;
    } = JSON.parse(
      await decrypt(walletRecord[0].encrypted_data, TRON_ENCRYPTION_KEY)
    );

    // Get balances
    const [usdtBalance, trxBalance] = await Promise.all([
      getTronUSDTBalance(decryptedData.address),
      getTrxBalance(decryptedData.address)
    ]);

    logger.info('TRON balances retrieved', { 
      userId, 
      address: decryptedData.address,
      usdtBalance,
      trxBalance 
    });

    return NextResponse.json({
      success: true,
      address: decryptedData.address,
      network: 'TRON',
      usdt: {
        balance: usdtBalance.toString(),
        formatted: usdtBalance,
        symbol: 'USDT',
      },
      trx: {
        balance: trxBalance.toString(),
        formatted: trxBalance,
        symbol: 'TRX',
      },
      message: 'TRON balances retrieved successfully',
    });

  } catch (error: any) {
    logger.error('Failed to get TRON balances', {
      error: error.message,
      stack: error.stack,
      userId: userId || 'unknown'
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to get TRON balances', 
        details: error?.message || 'Unknown error',
        debug: {
          hasEncryptionKey: !!TRON_ENCRYPTION_KEY,
          userId: userId || 'missing'
        }
      },
      { status: 500 }
    );
  }
}

// POST /api/tron/balance - Create new TRON wallet
export async function POST(request: NextRequest) {
  let userId: string | null = null;
  
  try {
    logger.info('Create TRON wallet API called');

    // Check if encryption key is available
    if (!TRON_ENCRYPTION_KEY) {
      logger.error('TRON_ENCRYPTION_KEY not set', new Error('Missing environment variable'));
      return NextResponse.json(
        { error: 'Server configuration error: TRON_ENCRYPTION_KEY not set' },
        { status: 500 }
      );
    }

    const body = await request.json();
    userId = body.userId;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if wallet already exists
    const existingWallet = await query(
      'SELECT * FROM tron_wallets WHERE user_id = $1',
      [userId]
    );

    if (existingWallet.length > 0) {
      return NextResponse.json(
        { error: 'TRON wallet already exists for this user' },
        { status: 409 }
      );
    }

    // Create new TRON wallet
    const wallet = await createTronWallet();

    // Encrypt wallet data
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(TRON_ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key, iv);
    
    let encrypted = cipher.update(JSON.stringify({
      address: wallet.address,
      privateKey: wallet.privateKey,
    }), 'utf8', 'hex');
    
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    const encryptedData = JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    });

    // Save to database
    await query(
      'INSERT INTO tron_wallets (user_id, encrypted_data, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
      [userId, encryptedData]
    );

    logger.info('TRON wallet created successfully', { 
      userId, 
      address: wallet.address 
    });

    // Get initial balances
    const [usdtBalance, trxBalance] = await Promise.all([
      getTronUSDTBalance(wallet.address),
      getTrxBalance(wallet.address)
    ]);

    return NextResponse.json({
      success: true,
      address: wallet.address,
      network: 'TRON',
      usdt: {
        balance: usdtBalance.toString(),
        formatted: usdtBalance,
        symbol: 'USDT',
      },
      trx: {
        balance: trxBalance.toString(),
        formatted: trxBalance,
        symbol: 'TRX',
      },
      message: 'TRON wallet created successfully',
    });

  } catch (error: any) {
    logger.error('Failed to create TRON wallet', {
      error: error.message,
      stack: error.stack,
      userId: userId || 'unknown'
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to create TRON wallet', 
        details: error?.message || 'Unknown error',
        debug: {
          hasEncryptionKey: !!TRON_ENCRYPTION_KEY,
          userId: userId || 'missing'
        }
      },
      { status: 500 }
    );
  }
}
