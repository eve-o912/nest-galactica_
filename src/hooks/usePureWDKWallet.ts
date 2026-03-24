'use client';

import { useState, useEffect, useCallback } from 'react';

export interface WalletInfo {
  address: string;
  publicKey?: string;
  balance: {
    eth: string;
    usdt: string;
    usdc: string;
  };
  chain: string;
  createdAt: Date;
  updatedAt: Date;
}

export function usePureWDKWallet() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Initialize user ID (in real app, this would come from your auth system)
  useEffect(() => {
    // For demo purposes, use a stored user ID or generate one
    const storedUserId = localStorage.getItem('pure_wdk_user_id');
    if (storedUserId) {
      setUserId(storedUserId);
    } else {
      const newUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('pure_wdk_user_id', newUserId);
      setUserId(newUserId);
    }
  }, []);

  // Fetch wallet info
  const fetchWallet = useCallback(async () => {
    if (!userId) {
      console.warn('Cannot fetch wallet: no userId');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Fetching wallet for userId:', userId);
      
      const response = await fetch(`/api/wdk/pure/balance?userId=${userId}&chain=base`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('Fetch response status:', response.status);

      if (!response.ok) {
        if (response.status === 404) {
          console.log('Wallet not found (404), user needs to create one');
          setWallet(null);
          setError(null); // Clear error since 404 is expected state
          return;
        }
        
        const errorData = await response.json().catch(() => ({ 
          error: `HTTP ${response.status}` 
        }));
        
        console.error('API error:', errorData);
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('Wallet data received:', {
        success: data.success,
        hasAddress: !!data.address,
        chain: data.chain,
        tokenCount: data.tokens?.length || 0
      });
      
      if (!data.success || !data.address) {
        throw new Error(data.message || 'Invalid wallet data received');
      }

      const walletInfo = {
        address: data.address,
        publicKey: data.publicKey || '',
        balance: {
          eth: String(data.native?.formatted || 0),
          usdt: String(
            data.tokens?.find((t: any) => t.symbol === 'USDT')?.formatted || 0
          ),
          usdc: String(
            data.tokens?.find((t: any) => t.symbol === 'USDC')?.formatted || 0
          ),
        },
        chain: data.chain || 'base',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      console.log('Setting wallet info:', walletInfo);
      setWallet(walletInfo);
      setError(null);

    } catch (err) {
      let errorMessage = 'Failed to fetch wallet';
      
      if (err instanceof Error) {
        // Handle specific error messages from API
        if (err.message.includes('Wallet not found')) {
          errorMessage = 'No wallet found. Please create a wallet first.';
        } else if (err.message.includes('Wallet data corrupted')) {
          errorMessage = 'Wallet data is corrupted. Please recreate your wallet.';
        } else if (err.message.includes('Invalid wallet configuration')) {
          errorMessage = 'Invalid wallet configuration. Please contact support.';
        } else if (err.message.includes('Server configuration error')) {
          errorMessage = 'Server is not configured properly. Please contact administrator.';
        } else if (err.message.includes('WALLET_ENCRYPTION_KEY')) {
          errorMessage = 'Server security configuration is missing. Please contact support.';
        } else {
          errorMessage = err.message;
        }
      }
      
      console.error('Fetch wallet error:', errorMessage, err);
      setError(errorMessage);
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Create new wallet
  const createWallet = useCallback(async (chain: string = 'base') => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/wdk/pure/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          chain,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create wallet' }));
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // Fetch the newly created wallet details
        await fetchWallet();
        return data;
      } else {
        throw new Error(data.error || 'Failed to create wallet');
      }
    } catch (err) {
      let errorMessage = 'Failed to create wallet';
      
      if (err instanceof Error) {
        if (err.message.includes('Server configuration error')) {
          errorMessage = 'Server is not configured properly. Please contact administrator.';
        } else if (err.message.includes('WALLET_ENCRYPTION_KEY')) {
          errorMessage = 'Server security configuration is missing. Please contact support.';
        } else if (err.message.includes('User ID is required')) {
          errorMessage = 'Invalid user session. Please refresh the page.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [userId, fetchWallet]);

  // Send transaction
  const sendTransaction = useCallback(async (params: {
    to: string;
    amount?: string;
    tokenType?: string;
    chain?: string;
  }) => {
    if (!userId) throw new Error('No user ID');

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/wdk/pure/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          to: params.to,
          value: params.amount,
          tokenType: params.tokenType,
          amount: params.amount,
          chain: params.chain || 'base',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send transaction');
      }

      const data = await response.json();
      
      if (data.success) {
        // Refresh wallet balance
        await fetchWallet();
        return data;
      } else {
        throw new Error(data.error || 'Transaction failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send transaction');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId, fetchWallet]);

  // Check if wallet has sufficient balance
  const hasBalance = useCallback((amount: string, token: 'eth' | 'usdt' | 'usdc' = 'eth'): boolean => {
    if (!wallet) return false;
    
    const balance = parseFloat(wallet.balance[token]);
    return balance >= parseFloat(amount);
  }, [wallet]);

  // Format balance for display
  const formatBalance = useCallback((balance: string, token: 'eth' | 'usdt' | 'usdc' = 'eth'): string => {
    const num = parseFloat(balance);
    
    if (token === 'eth') {
      return `${num.toFixed(4)} ETH`;
    } else if (token === 'usdt') {
      return `$${num.toFixed(2)} USDT`;
    } else {
      return `$${num.toFixed(2)} USDC`;
    }
  }, []);

  // Compute balance from wallet
  const balance = wallet ? parseFloat(wallet.balance.usdc) : 0;

  // Compute authenticated early
  const authenticated = !!wallet;

  // Auto-fetch wallet on mount and when userId changes
  useEffect(() => {
    if (userId && authenticated) {
      fetchWallet();
    }
  }, [userId, authenticated, fetchWallet]);

  return {
    wallet,
    loading,
    error,
    userId,
    authenticated,
    ready: true, // Always ready for pure WDK
    createWallet,
    sendTransaction,
    fetchWallet,
    hasBalance,
    formatBalance,
    balance,
    fetchBalance: fetchWallet,
    // Add compatibility with existing Privy interface
    login: async () => {
      if (!userId) return;
      if (!wallet) {
        await createWallet();
      }
    },
    logout: () => {
      setWallet(null);
      localStorage.removeItem('pure_wdk_user_id');
      setUserId(null);
    },
    user: userId ? { id: userId } : null,
  };
}
