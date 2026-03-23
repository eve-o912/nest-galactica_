import { NextRequest, NextResponse } from 'next/server';
import { WDKManager, TOKEN_ADDRESSES } from '@/lib/wdk/wdk-integration';
import { decrypt } from '@/lib/wdk/crypto';
import { logger } from '@/lib/retry';
import { query } from '@/lib/db';

const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;

// GET /api/wdk/pure/balance - Get wallet balances
export async function GET(request: NextRequest) {
  // Declare variables at function scope for error handling
  let userId: string | null = null;
  let chain: string | null = null;
  
  try {
    logger.info('Balance API called', { url: request.url });

    // Check if encryption key is available
    if (!WALLET_ENCRYPTION_KEY) {
      logger.error('WALLET_ENCRYPTION_KEY not set', new Error('Missing environment variable'));
      return NextResponse.json(
        { error: 'Server configuration error: WALLET_ENCRYPTION_KEY not set' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    userId = searchParams.get('userId');
    chain = searchParams.get('chain') || 'base';

    logger.info('Balance request parameters', { userId, chain });

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get wallet from database
    const walletRecord = await query(
      'SELECT * FROM wdk_wallets WHERE user_id = $1',
      [userId]
    );

    logger.info('Wallet query result', { 
      userId, 
      walletCount: walletRecord.length,
      hasWallet: walletRecord.length > 0 
    });

    if (!walletRecord.length) {
      logger.info('No wallet found for user', { userId });
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

    // Get native token balance
    const nativeBalance = await wallet.getBalance();
    const nativeBalanceFormatted = Number(nativeBalance) / Math.pow(10, 18);

    // Get token balances
    const chainTokens = TOKEN_ADDRESSES[chain as keyof typeof TOKEN_ADDRESSES];
    const tokenBalances = [];

    for (const [symbol, address] of Object.entries(chainTokens)) {
      try {
        const balance = await wallet.getTokenBalance(address, symbol === 'WETH' || symbol === 'WMATIC' ? 18 : 6);
        tokenBalances.push({
          symbol,
          address,
          balance,
          formatted: balance,
        });
      } catch (error) {
        logger.warn(`Failed to get ${symbol} balance`, { error: error instanceof Error ? error.message : String(error) });
        tokenBalances.push({
          symbol,
          address,
          balance: 0,
          formatted: 0,
        });
      }
    }

    logger.info('Pure WDK balances retrieved', { userId, chain });

    return NextResponse.json({
      success: true,
      address: wallet.address,
      chain,
      native: {
        balance: nativeBalance.toString(),
        formatted: nativeBalanceFormatted,
        symbol: chain === 'polygon' ? 'MATIC' : 'ETH',
      },
      tokens: tokenBalances,
      message: 'Balances retrieved successfully using pure WDK',
    });

  } catch (error: any) {
    logger.error('Failed to get balances with WDK', {
      error: error.message,
      stack: error.stack,
      userId: userId || 'unknown',
      chain: chain || 'unknown'
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to get balances', 
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
