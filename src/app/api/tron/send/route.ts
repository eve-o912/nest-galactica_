import { NextRequest, NextResponse } from 'next/server';
import { sendTronUSDT, getTronUSDTBalance } from '@/lib/tron/client';
import { decrypt } from '@/lib/wdk/crypto';
import { logger } from '@/lib/retry';
import { query } from '@/lib/db';

const TRON_ENCRYPTION_KEY = process.env.TRON_ENCRYPTION_KEY || process.env.WALLET_ENCRYPTION_KEY;

// POST /api/tron/send - Send TRON USDT
export async function POST(request: NextRequest) {
  let userId: string | null = null;
  
  try {
    logger.info('TRON Send API called');

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
    const { toAddress, amount } = body;

    if (!userId || !toAddress || !amount) {
      return NextResponse.json(
        { error: 'User ID, recipient address, and amount are required' },
        { status: 400 }
      );
    }

    // Validate amount
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Get TRON wallet from database
    const walletRecord = await query(
      'SELECT * FROM tron_wallets WHERE user_id = $1',
      [userId]
    );

    if (!walletRecord.length) {
      return NextResponse.json(
        { error: 'TRON wallet not found' },
        { status: 404 }
      );
    }

    // Decrypt wallet data
    const decryptedData: {
      address: string;
      privateKey?: string;
    } = JSON.parse(
      await decrypt(walletRecord[0].encrypted_data, TRON_ENCRYPTION_KEY)
    );

    // Check balance before sending
    const currentBalance = await getTronUSDTBalance(decryptedData.address);
    
    if (currentBalance < amount) {
      return NextResponse.json(
        { 
          error: 'Insufficient USDT balance',
          currentBalance: currentBalance.toString(),
          requestedAmount: amount.toString()
        },
        { status: 400 }
      );
    }

    // Send USDT
    const result = await sendTronUSDT(toAddress, amount);

    logger.info('TRON USDT transfer completed', {
      userId,
      from: decryptedData.address,
      to: toAddress,
      amount,
      txHash: result.txHash,
      success: result.success
    });

    // Get updated balance
    const updatedBalance = await getTronUSDTBalance(decryptedData.address);

    return NextResponse.json({
      success: true,
      transaction: {
        txHash: result.txHash,
        from: decryptedData.address,
        to: toAddress,
        amount: amount.toString(),
        token: 'USDT',
        network: 'TRON'
      },
      balances: {
        before: currentBalance.toString(),
        after: updatedBalance.toString(),
        change: (updatedBalance - currentBalance).toString()
      },
      message: 'USDT transfer completed successfully',
    });

  } catch (error: any) {
    logger.error('Failed to send TRON USDT', {
      error: error.message,
      stack: error.stack,
      userId: userId || 'unknown'
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to send USDT', 
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
