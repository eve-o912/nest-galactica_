'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';

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

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  usePaymaster?: boolean;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  blockNumber?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  paymasterUsed?: boolean;
  error?: string;
}

export function useWDKWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get user ID from Privy
  const userId = user?.id;

  // Fetch wallet info
  const fetchWallet = useCallback(async () => {
    if (!userId || !authenticated) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/wdk/wallet?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setWallet({
          address: data.address,
          publicKey: data.publicKey,
          balance: data.balance,
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        });
      } else if (response.status === 404) {
        // Wallet doesn't exist yet
        setWallet(null);
      } else {
        setError(data.error || 'Failed to fetch wallet');
      }
    } catch (err) {
      setError('Network error');
      console.error('Failed to fetch wallet:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, authenticated]);

  // Create new wallet
  const createWallet = useCallback(async () => {
    if (!userId || !authenticated) {
      setError('User not authenticated');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/wdk/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (data.success) {
        // Fetch the newly created wallet
        await fetchWallet();
        return data.address;
      } else {
        setError(data.error || 'Failed to create wallet');
        return null;
      }
    } catch (err) {
      setError('Network error');
      console.error('Failed to create wallet:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, authenticated, fetchWallet]);

  // Send transaction
  const sendTransaction = useCallback(async (request: TransactionRequest): Promise<TransactionResult> => {
    if (!userId || !authenticated) {
      return { success: false, error: 'User not authenticated' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/wdk/wallet/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          ...request,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh wallet balance after transaction
        await fetchWallet();
        return {
          success: true,
          txHash: data.txHash,
          blockNumber: data.blockNumber,
          gasUsed: data.gasUsed,
          effectiveGasPrice: data.effectiveGasPrice,
          paymasterUsed: data.paymasterUsed,
        };
      } else {
        return {
          success: false,
          error: data.error || data.details || 'Failed to send transaction',
        };
      }
    } catch (err) {
      const errorMessage = 'Network error';
      setError(errorMessage);
      console.error('Failed to send transaction:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [userId, authenticated, fetchWallet]);

  // Sign message
  const signMessage = useCallback(async (message: string): Promise<{ success: boolean; signature?: string; error?: string }> => {
    if (!userId || !authenticated) {
      return { success: false, error: 'User not authenticated' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/wdk/wallet/sign/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          message,
        }),
      });

      const data = await response.json();

      if (data.success) {
        return {
          success: true,
          signature: data.signature,
        };
      } else {
        return {
          success: false,
          error: data.error || 'Failed to sign message',
        };
      }
    } catch (err) {
      const errorMessage = 'Network error';
      setError(errorMessage);
      console.error('Failed to sign message:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [userId, authenticated]);

  // Auto-fetch wallet when user is authenticated
  useEffect(() => {
    if (ready && authenticated && userId) {
      fetchWallet();
    } else if (!authenticated) {
      setWallet(null);
    }
  }, [ready, authenticated, userId, fetchWallet]);

  // Check if wallet has sufficient balance
  const hasBalance = useCallback((amount: string, token: 'eth' | 'usdt' = 'eth'): boolean => {
    if (!wallet) return false;
    
    const balance = parseFloat(wallet.balance[token]);
    
    const required = parseFloat(amount);
    
    return balance >= required;
  }, [wallet]);

  // Format balance for display
  const formatBalance = useCallback((balance: string, token: 'eth' | 'usdt' = 'eth'): string => {
    const num = parseFloat(balance);
    
    if (token === 'eth') {
      return `${num.toFixed(4)} ETH`;
    } else {
      return `$${num.toFixed(2)} USDT`;
    }
  }, []);

  return {
    // State
    wallet,
    loading,
    error,
    ready,
    authenticated,
    
    // Actions
    fetchWallet,
    createWallet,
    sendTransaction,
    signMessage,
    
    // Utilities
    hasBalance,
    formatBalance,
    
    // Derived state
    isConnected: !!wallet,
    hasWallet: !!wallet,
  };
}
