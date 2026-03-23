import { NextRequest, NextResponse } from 'next/server';
import { WDKManager, TOKEN_ADDRESSES } from '@/lib/wdk/wdk-integration';
import { decrypt } from '@/lib/wdk/crypto';
import { logger } from '@/lib/retry';
import { query } from '@/lib/db';

const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;

// GET /api/wdk/pure/balance - Get wallet balances
export async function GET(request: NextRequest) {
  let userId: string | null = null;
  let chain: string | null = null;
  
  try {
    const { searchParams } = new URL(request.url);
    userId = searchParams.get('userId');
    chain = searchParams.get('chain') || 'base';

    logger.info('Balance request received', { userId, chain });

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check encryption key FIRST before any database operations
    if (!WALLET_ENCRYPTION_KEY) {
      logger.error('WALLET_ENCRYPTION_KEY not set', new Error('Missing encryption key'));
      return NextResponse.json(
        { 
          error: 'Server configuration error',
          debug: { hasEncryptionKey: false }
        },
        { status: 500 }
      );
    }

    // Get wallet from database
    const walletRecord = await query(
      'SELECT * FROM wdk_wallets WHERE user_id = $1',
      [userId]
    );

    logger.info('Database query result', { 
      userId, 
      found: walletRecord.length > 0,
      recordCount: walletRecord.length 
    });

    if (!walletRecord || walletRecord.length === 0) {
      logger.info('No wallet found for user', { userId });
      return NextResponse.json(
        { 
          error: 'Wallet not found',
          suggestion: 'Create a wallet first' 
        },
        { status: 404 }
      );
    }

    // Decrypt wallet data
    let decryptedData: any;
    try {
      const decrypted = await decrypt(
        walletRecord[0].encrypted_data, 
        WALLET_ENCRYPTION_KEY
      );
      decryptedData = JSON.parse(decrypted);
    } catch (decryptError) {
      logger.error('Decryption failed', {
        error: decryptError instanceof Error ? decryptError.message : String(decryptError),
        userId
      });
      return NextResponse.json(
        { error: 'Failed to decrypt wallet data' },
        { status: 500 }
      );
    }

    // Validate decrypted data
    if (!decryptedData.address) {
      logger.error('Invalid decrypted wallet data', { userId });
      return NextResponse.json(
        { error: 'Invalid wallet data' },
        { status: 500 }
      );
    }

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

    if (chainTokens) {
      for (const [symbol, address] of Object.entries(chainTokens)) {
        try {
          const decimals = symbol === 'WETH' || symbol === 'WMATIC' ? 18 : 6;
          const balance = await wallet.getTokenBalance(address, decimals);
          tokenBalances.push({
            symbol,
            address,
            balance,
            formatted: balance,
          });
        } catch (error) {
          logger.warn(`Failed to get ${symbol} balance`, { 
            error: error instanceof Error ? error.message : String(error),
            symbol,
            chain
          });
          tokenBalances.push({
            symbol,
            address,
            balance: 0,
            formatted: 0,
          });
        }
      }
    }

    logger.info('Balance check successful', { 
      userId, 
      chain, 
      address: wallet.address,
      nativeBalance: nativeBalanceFormatted 
    });

    return NextResponse.json({
      success: true,
      address: wallet.address,
      publicKey: decryptedData.publicKey,
      chain,
      native: {
        balance: nativeBalance.toString(),
        formatted: nativeBalanceFormatted,
        symbol: chain === 'polygon' ? 'MATIC' : 'ETH',
      },
      tokens: tokenBalances,
      message: 'Balances retrieved successfully',
    });

  } catch (error: any) {
    console.error('Balance API Error Details:', {
      message: error.message,
      stack: error.stack,
      userId: userId || 'unknown',
      chain: chain || 'unknown',
      hasEncryptionKey: !!WALLET_ENCRYPTION_KEY
    });
    
    // Return more specific error messages
    if (error.message?.includes('Wallet not found')) {
      return NextResponse.json(
        { 
          error: 'Wallet not found',
          suggestion: 'Please create a wallet first',
          debug: { userId, chain }
        },
        { status: 404 }
      );
    }
    
    if (error.message?.includes('Failed to decrypt')) {
      return NextResponse.json(
        { 
          error: 'Wallet data corrupted',
          suggestion: 'Please recreate your wallet',
          debug: { userId }
        },
        { status: 500 }
      );
    }
    
    if (error.message?.includes('Invalid wallet data')) {
      return NextResponse.json(
        { 
          error: 'Invalid wallet configuration',
          suggestion: 'Please contact support',
          debug: { userId }
        },
        { status: 500 }
      );
    }
    
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
