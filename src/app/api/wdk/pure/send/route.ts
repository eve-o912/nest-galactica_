import { NextRequest, NextResponse } from 'next/server';
import { WDKManager, TOKEN_ADDRESSES } from '@/lib/wdk/wdk-integration';
import { decrypt } from '@/lib/wdk/crypto';
import { logger } from '@/lib/retry';
import { query } from '@/lib/db';

const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;

if (!WALLET_ENCRYPTION_KEY) {
  throw new Error('WALLET_ENCRYPTION_KEY is required');
}

// POST /api/wdk/pure/send - Send transaction or token
export async function POST(request: NextRequest) {
  try {
    const { 
      userId, 
      to, 
      value, 
      tokenType, 
      amount,
      chain = 'base' 
    } = await request.json();

    if (!userId || !to) {
      return NextResponse.json(
        { error: 'User ID and recipient address are required' },
        { status: 400 }
      );
    }

    // Get wallet from database
    const walletRecord = await query(
      'SELECT * FROM wdk_wallets WHERE user_id = $1',
      [userId]
    );

    if (!walletRecord.length) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      );
    }

    // Decrypt wallet data
    const decryptedData: {
      address: string;
      mnemonic?: string;
      privateKey?: string;
      chain: string;
    } = JSON.parse(
      await decrypt(walletRecord[0].encrypted_data, WALLET_ENCRYPTION_KEY)
    );

    // Get WDK wallet instance
    const wallet = WDKManager.getWallet({
      userId,
      mnemonic: decryptedData.mnemonic,
      privateKey: decryptedData.privateKey,
      chain: chain as 'base' | 'ethereum' | 'polygon' | 'arbitrum',
    });

    let result;

    if (tokenType && amount) {
      // Send token
      const chainTokens = TOKEN_ADDRESSES[chain as keyof typeof TOKEN_ADDRESSES];
      const tokenAddress = chainTokens?.[tokenType as keyof typeof chainTokens];
      
      if (!tokenAddress) {
        return NextResponse.json(
          { error: `Token ${tokenType} not supported on ${chain}` },
          { status: 400 }
        );
      }

      result = await wallet.sendToken({
        tokenAddress,
        to: to as `0x${string}`,
        amount: Number(amount),
      });

      logger.info('Token sent using WDK', {
        userId,
        tokenType,
        amount,
        to,
        chain,
        txHash: result.hash,
      });

    } else {
      // Send ETH/native token
      result = await wallet.sendTransaction({
        to: to as `0x${string}`,
        value: value ? BigInt(value) : BigInt(0),
      });

      logger.info('Transaction sent using WDK', {
        userId,
        to,
        value: value || '0',
        chain,
        txHash: result.hash,
      });
    }

    return NextResponse.json({
      success: true,
      txHash: result.hash,
      blockNumber: result.blockNumber.toString(),
      gasUsed: result.gasUsed.toString(),
      chain,
      walletType: 'WDK',
      message: 'Transaction sent successfully using WDK',
    });

  } catch (error: any) {
    logger.error('Failed to send transaction with WDK', error);
    return NextResponse.json(
      { error: 'Failed to send transaction', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
