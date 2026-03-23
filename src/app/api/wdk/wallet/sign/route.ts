import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, restoreEVMWallet } from '@/lib/wdk/client';
import { encrypt, decrypt } from '@/lib/wdk/crypto';
import { withRetry, logger } from '@/lib/retry';
import { parseEther } from 'viem';

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const PAYMASTER_URL = process.env.PAYMASTER_URL;
const BUNDLER_URL = process.env.BUNDLER_URL;
const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;

if (!WALLET_ENCRYPTION_KEY) {
  throw new Error('WALLET_ENCRYPTION_KEY is required');
}

// POST /api/wdk/wallet/sign - Sign and send transaction
export async function POST(request: NextRequest) {
  try {
    const { userId, to, value, data, usePaymaster = false } = await request.json();

    if (!userId || !to) {
      return NextResponse.json(
        { error: 'User ID and recipient address are required' },
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

    // Create wallet instance
    const wallet = await restoreEVMWallet({
      address: decryptedData.address,
      privateKey: decryptedData.privateKey,
      mnemonic: decryptedData.mnemonic,
      useAccountAbstraction: false,
    });

    // Prepare transaction
    const tx = {
      to: to as `0x${string}`,
      value: value ? parseEther(value) : BigInt(0),
      data: data || '0x',
    };

    // Sign and send transaction
    const txHash = await wallet.sendTransaction(tx, {
      paymaster: usePaymaster && PAYMASTER_URL ? {
        url: PAYMASTER_URL,
        context: { user: userId }
      } : undefined,
      bundler: usePaymaster && BUNDLER_URL ? {
        url: BUNDLER_URL
      } : undefined
    });

    // Wait for transaction receipt
    const receipt = await wallet.waitForTransaction(txHash);

    logger.info('Transaction sent', { 
      userId, 
      txHash, 
      to, 
      value: value || '0',
      usePaymaster 
    });

    return NextResponse.json({
      success: true,
      txHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
      paymasterUsed: usePaymaster
    });

  } catch (error) {
    logger.error('Failed to send transaction', error);
    return NextResponse.json(
      { error: 'Failed to send transaction', details: error.message },
      { status: 500 }
    );
  }
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
