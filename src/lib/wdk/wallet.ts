import { createEVMWallet, restoreEVMWallet, getWalletBalance, getTokenBalance } from './client';
import { encrypt, decrypt, generateEncryptionKey, validateEncryptionKey } from './crypto';
import { withRetry, logger } from '@/lib/retry';
import { query, queryOne } from '@/lib/db';

const USDT_ADDRESS = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as const;
const USDT_DECIMALS = 6;

export interface WalletData {
  address: string;
  privateKey?: string;
  mnemonic?: string;
  publicKey?: string;
  encryptedData?: string;
}

export interface WalletInfo {
  address: string;
  publicKey?: string;
  balance: {
    eth: string;
    usdt: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new WDK wallet for a user
 */
export async function createWalletForUser(
  userId: string,
  options?: {
    mnemonic?: string;
    useAccountAbstraction?: boolean;
  }
): Promise<WalletData> {
  try {
    // Check if wallet already exists
    const existingWallet = await getWalletByUserId(userId);
    if (existingWallet) {
      throw new Error('Wallet already exists for this user');
    }

    // Create new EVM wallet
    const wallet = await createEVMWallet({
      mnemonic: options?.mnemonic,
      useAccountAbstraction: options?.useAccountAbstraction ?? true,
    });

    const walletData: WalletData = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic,
      publicKey: wallet.publicKey,
    };

    // Encrypt sensitive data
    const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
    if (!encryptionKey || !validateEncryptionKey(encryptionKey)) {
      throw new Error('Invalid or missing WALLET_ENCRYPTION_KEY');
    }

    const encryptedData = await encrypt(
      JSON.stringify({
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic,
      }),
      encryptionKey
    );

    // Store in database
    await withRetry(
      async () => {
        return query(
          `INSERT INTO wdk_wallets (user_id, address, public_key, encrypted_data, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [userId, wallet.address, wallet.publicKey, encryptedData]
        );
      },
      { maxAttempts: 3, delay: 1000 }
    );

    logger.info('Wallet created for user', { userId, address: wallet.address });

    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
      encryptedData,
    };
  } catch (error) {
    logger.error('Failed to create wallet for user', { userId, error });
    throw error;
  }
}

/**
 * Get wallet information for a user
 */
export async function getWalletInfo(userId: string): Promise<WalletInfo | null> {
  try {
    const walletRecord = await queryOne(
      'SELECT * FROM wdk_wallets WHERE user_id = $1',
      [userId]
    );

    if (!walletRecord) {
      return null;
    }

    // Get balances
    const ethBalance = await getWalletBalance(walletRecord.address as `0x${string}`);
    const usdtBalance = await getTokenBalance(walletRecord.address as `0x${string}`, USDT_ADDRESS);

    return {
      address: walletRecord.address,
      publicKey: walletRecord.public_key,
      balance: {
        eth: ethBalance.toString(),
        usdt: (usdtBalance / BigInt(10 ** USDT_DECIMALS)).toString(),
      },
      createdAt: walletRecord.created_at,
      updatedAt: walletRecord.updated_at,
    };
  } catch (error) {
    logger.error('Failed to get wallet info', { userId, error });
    throw error;
  }
}

/**
 * Get wallet data for a user (includes private key for signing)
 */
export async function getWalletData(userId: string): Promise<WalletData | null> {
  try {
    const walletRecord = await queryOne(
      'SELECT * FROM wdk_wallets WHERE user_id = $1',
      [userId]
    );

    if (!walletRecord) {
      return null;
    }

    // Decrypt sensitive data
    const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('WALLET_ENCRYPTION_KEY is required');
    }

    const decryptedData = JSON.parse(
      await decrypt(walletRecord.encrypted_data, encryptionKey)
    );

    return {
      address: walletRecord.address,
      privateKey: decryptedData.privateKey,
      mnemonic: decryptedData.mnemonic,
      publicKey: walletRecord.public_key,
    };
  } catch (error) {
    logger.error('Failed to get wallet data', { userId, error });
    throw error;
  }
}

/**
 * Get wallet by user ID (basic info only)
 */
export async function getWalletByUserId(userId: string): Promise<WalletData | null> {
  try {
    const walletRecord = await queryOne(
      'SELECT address, public_key FROM wdk_wallets WHERE user_id = $1',
      [userId]
    );

    if (!walletRecord) {
      return null;
    }

    return {
      address: walletRecord.address,
      publicKey: walletRecord.public_key,
    };
  } catch (error) {
    logger.error('Failed to get wallet by user ID', { userId, error });
    throw error;
  }
}

/**
 * Update wallet encryption key (for key rotation)
 */
export async function updateWalletEncryption(
  userId: string,
  newEncryptionKey: string
): Promise<boolean> {
  try {
    if (!validateEncryptionKey(newEncryptionKey)) {
      throw new Error('Invalid encryption key format');
    }

    const walletData = await getWalletData(userId);
    if (!walletData) {
      throw new Error('Wallet not found');
    }

    // Re-encrypt with new key
    const newEncryptedData = await encrypt(
      JSON.stringify({
        privateKey: walletData.privateKey,
        mnemonic: walletData.mnemonic,
      }),
      newEncryptionKey
    );

    // Update database
    await withRetry(
      async () => {
        return query(
          'UPDATE wdk_wallets SET encrypted_data = $1, updated_at = NOW() WHERE user_id = $2',
          [newEncryptedData, userId]
        );
      },
      { maxAttempts: 3, delay: 1000 }
    );

    logger.info('Wallet encryption updated', { userId });
    return true;
  } catch (error) {
    logger.error('Failed to update wallet encryption', { userId, error });
    throw error;
  }
}

/**
 * Delete wallet for a user
 */
export async function deleteWallet(userId: string): Promise<boolean> {
  try {
    const result = await query(
      'DELETE FROM wdk_wallets WHERE user_id = $1',
      [userId]
    );

    logger.info('Wallet deleted', { userId });
    return true;
  } catch (error) {
    logger.error('Failed to delete wallet', { userId, error });
    throw error;
  }
}

/**
 * Validate wallet address format
 */
export function isValidAddress(address: string): boolean {
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethAddressRegex.test(address);
}

/**
 * Get wallet transaction history (placeholder for future implementation)
 */
export async function getWalletTransactionHistory(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  try {
    // This would integrate with a blockchain explorer API or local indexing
    // For now, return empty array
    logger.info('Transaction history requested', { userId, limit, offset });
    return [];
  } catch (error) {
    logger.error('Failed to get transaction history', { userId, error });
    throw error;
  }
}
