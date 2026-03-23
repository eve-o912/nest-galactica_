'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export interface TronWalletInfo {
  address: string;
  network: 'TRON';
  balances: {
    usdt: {
      balance: string;
      formatted: number;
      symbol: 'USDT';
    };
    trx: {
      balance: string;
      formatted: number;
      symbol: 'TRX';
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TronTransactionRequest {
  toAddress: string;
  amount: number;
}

export interface TronTransactionResult {
  success: boolean;
  transaction?: {
    txHash: string;
    from: string;
    to: string;
    amount: string;
    token: 'USDT';
    network: 'TRON';
  };
  balances?: {
    before: string;
    after: string;
    change: string;
  };
  error?: string;
}

export function useTronWallet() {
  const { ready, authenticated, user } = usePrivy();
  const [wallet, setWallet] = useState<TronWalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get user ID from Privy
  const userId = user?.id;

  // Fetch TRON wallet info
  const fetchWallet = useCallback(async () => {
    if (!userId || !authenticated) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tron/balance?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setWallet({
          address: data.address,
          network: data.network,
          balances: {
            usdt: data.usdt,
            trx: data.trx,
          },
          createdAt: new Date(), // Would come from DB in production
          updatedAt: new Date(),
        });
      } else if (response.status === 404) {
        // Wallet doesn't exist yet
        setWallet(null);
      } else {
        setError(data.error || 'Failed to fetch TRON wallet');
      }
    } catch (err) {
      setError('Network error');
      console.error('Failed to fetch TRON wallet:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, authenticated]);

  // Create new TRON wallet
  const createWallet = useCallback(async () => {
    if (!userId || !authenticated) {
      setError('User not authenticated');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tron/balance', {
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
        setError(data.error || 'Failed to create TRON wallet');
        return null;
      }
    } catch (err) {
      setError('Network error');
      console.error('Failed to create TRON wallet:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, authenticated, fetchWallet]);

  // Send USDT transaction
  const sendUSDT = useCallback(async (request: TronTransactionRequest): Promise<TronTransactionResult> => {
    if (!userId || !authenticated) {
      return { success: false, error: 'User not authenticated' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tron/send', {
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
          transaction: data.transaction,
          balances: data.balances,
        };
      } else {
        return {
          success: false,
          error: data.error || data.details || 'Failed to send USDT',
        };
      }
    } catch (err) {
      const errorMessage = 'Network error';
      setError(errorMessage);
      console.error('Failed to send USDT:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [userId, authenticated, fetchWallet]);

  // Auto-fetch wallet when user is authenticated
  useEffect(() => {
    if (ready && authenticated && userId) {
      fetchWallet();
    } else if (!authenticated) {
      setWallet(null);
    }
  }, [ready, authenticated, userId, fetchWallet]);

  // Check if wallet has sufficient USDT balance
  const hasUSDTBalance = useCallback((amount: number): boolean => {
    if (!wallet) return false;
    
    const balance = wallet.balances.usdt.formatted;
    return balance >= amount;
  }, [wallet]);

  // Check if wallet has sufficient TRX balance (for gas)
  const hasTRXBalance = useCallback((amount: number): boolean => {
    if (!wallet) return false;
    
    const balance = wallet.balances.trx.formatted;
    return balance >= amount;
  }, [wallet]);

  // Format balance for display
  const formatBalance = useCallback((balance: number, token: 'USDT' | 'TRX'): string => {
    if (token === 'USDT') {
      return `$${balance.toFixed(2)} USDT`;
    } else {
      return `${balance.toFixed(4)} TRX`;
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
    sendUSDT,
    
    // Utilities
    hasUSDTBalance,
    hasTRXBalance,
    formatBalance,
    
    // Derived state
    isConnected: !!wallet,
    hasWallet: !!wallet,
  };
}
