import { WDKManager } from '@/lib/wdk/wdk-integration';
import { createTronWallet, getTronWeb, getTronUSDTBalance, getTrxBalance } from '@/lib/tron/client';
import { logger } from '@/lib/retry';

export type WalletType = 'evm' | 'tron';
export type ChainType = 'base' | 'ethereum' | 'polygon' | 'arbitrum' | 'tron';

export interface UnifiedWallet {
  id: string;
  type: WalletType;
  chain: ChainType;
  address: string;
  balances: {
    native?: {
      balance: string;
      formatted: number;
      symbol: string;
    };
    usdt?: {
      balance: string;
      formatted: number;
      symbol: 'USDT';
    };
    tokens?: Array<{
      symbol: string;
      address: string;
      balance: string;
      formatted: number;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWalletOptions {
  type: WalletType;
  chain?: ChainType;
  userId?: string;
}

export interface SendTransactionOptions {
  type: WalletType;
  chain: ChainType;
  fromAddress: string;
  toAddress: string;
  amount: number;
  token?: string; // For token transfers
  privateKey?: string; // For direct signing
}

export class UnifiedWalletManager {
  private static instances: Map<string, UnifiedWallet> = new Map();

  /**
   * Create a new wallet (EVM or TRON)
   */
  static async createWallet(options: CreateWalletOptions): Promise<UnifiedWallet> {
    const { type, chain = 'base', userId } = options;
    const walletId = userId || `${type}-${Date.now()}`;

    try {
      if (type === 'evm') {
        // Create EVM wallet using WDK
        const result = WDKManager.createWallet({ chain: chain as any });
        const balances = await this.getEVMBalances(result.wallet, chain);

        const wallet: UnifiedWallet = {
          id: walletId,
          type: 'evm',
          chain,
          address: result.wallet.address,
          balances,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        this.instances.set(walletId, wallet);
        return wallet;

      } else if (type === 'tron') {
        // Create TRON wallet
        const tronWallet = await createTronWallet();
        const balances = await this.getTronBalances(tronWallet.address);

        const wallet: UnifiedWallet = {
          id: walletId,
          type: 'tron',
          chain: 'tron',
          address: tronWallet.address,
          balances,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        this.instances.set(walletId, wallet);
        return wallet;

      } else {
        throw new Error(`Unsupported wallet type: ${type}`);
      }
    } catch (error) {
      logger.error('Failed to create wallet', { type, chain, error });
      throw error;
    }
  }

  /**
   * Get wallet by ID
   */
  static getWallet(walletId: string): UnifiedWallet | undefined {
    return this.instances.get(walletId);
  }

  /**
   * Get all wallets
   */
  static getAllWallets(): UnifiedWallet[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get wallets by type
   */
  static getWalletsByType(type: WalletType): UnifiedWallet[] {
    return this.getAllWallets().filter(wallet => wallet.type === type);
  }

  /**
   * Update wallet balances
   */
  static async updateBalances(walletId: string): Promise<UnifiedWallet> {
    const wallet = this.instances.get(walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    try {
      if (wallet.type === 'evm') {
        const wdkWallet = WDKManager.getWallet({
          chain: wallet.chain as any,
          userId: wallet.id,
        });
        wallet.balances = await this.getEVMBalances(wdkWallet, wallet.chain);
      } else if (wallet.type === 'tron') {
        wallet.balances = await this.getTronBalances(wallet.address);
      }

      wallet.updatedAt = new Date();
      this.instances.set(walletId, wallet);
      return wallet;

    } catch (error) {
      logger.error('Failed to update wallet balances', { walletId, error });
      throw error;
    }
  }

  /**
   * Send transaction
   */
  static async sendTransaction(options: SendTransactionOptions): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
    details?: any;
  }> {
    const { type, chain, fromAddress, toAddress, amount, token } = options;

    try {
      if (type === 'evm') {
        // Handle EVM transaction
        const wallet = WDKManager.getWallet({
          chain: chain as any,
          userId: fromAddress, // Using address as userId for lookup
        });

        let result;
        if (token && token !== 'ETH' && token !== 'MATIC') {
          // Token transfer
          const tokenAddress = this.getTokenAddress(token, chain);
          result = await wallet.sendToken({
            tokenAddress,
            to: toAddress as `0x${string}`,
            amount,
          });
        } else {
          // Native transfer
          const value = BigInt(Math.floor(amount * Math.pow(10, 18)));
          result = await wallet.sendTransaction({
            to: toAddress as `0x${string}`,
            value,
          });
        }

        return {
          success: true,
          txHash: result.hash,
          details: result,
        };

      } else if (type === 'tron') {
        // Handle TRON transaction
        if (token === 'USDT' || !token) {
          const { sendTronUSDT } = await import('@/lib/tron/client');
          const result = await sendTronUSDT(toAddress, amount);
          
          return {
            success: result.success,
            txHash: result.txHash,
          };
        } else {
          throw new Error('Only USDT is supported for TRON transactions');
        }

      } else {
        throw new Error(`Unsupported wallet type: ${type}`);
      }

    } catch (error) {
      logger.error('Failed to send transaction', { options, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get optimal wallet for USDT operations
   */
  static getOptimalUSDTWallet(): UnifiedWallet | null {
    const tronWallets = this.getWalletsByType('tron');
    const evmWallets = this.getWalletsByType('evm');

    // Prefer TRON wallet for USDT (lower fees, faster)
    if (tronWallets.length > 0) {
      return tronWallets[0];
    }

    // Fall back to EVM wallet
    if (evmWallets.length > 0) {
      return evmWallets[0];
    }

    return null;
  }

  /**
   * Get wallet portfolio summary
   */
  static getPortfolioSummary(walletIds?: string[]): {
    totalValueUSD: number;
    wallets: UnifiedWallet[];
    networkDistribution: Record<string, number>;
    assetDistribution: Record<string, number>;
  } {
    const wallets = walletIds 
      ? walletIds.map(id => this.instances.get(id)).filter(Boolean) as UnifiedWallet[]
      : this.getAllWallets();

    const totalValueUSD = wallets.reduce((total, wallet) => {
      let walletValue = 0;
      
      // Add USDT value (pegged to $1)
      if (wallet.balances.usdt) {
        walletValue += wallet.balances.usdt.formatted;
      }
      
      // Add native token value (simplified - would need price oracle in production)
      if (wallet.balances.native) {
        // Mock prices: ETH=$3000, MATIC=$0.8, TRX=$0.1
        const priceMap: Record<string, number> = {
          'ETH': 3000,
          'MATIC': 0.8,
          'TRX': 0.1,
        };
        walletValue += wallet.balances.native.formatted * (priceMap[wallet.balances.native.symbol] || 0);
      }
      
      return total + walletValue;
    }, 0);

    const networkDistribution = wallets.reduce((dist, wallet) => {
      dist[wallet.chain] = (dist[wallet.chain] || 0) + 1;
      return dist;
    }, {} as Record<string, number>);

    const assetDistribution = wallets.reduce((dist, wallet) => {
      if (wallet.balances.usdt) {
        dist['USDT'] = (dist['USDT'] || 0) + wallet.balances.usdt.formatted;
      }
      if (wallet.balances.native) {
        dist[wallet.balances.native.symbol] = (dist[wallet.balances.native.symbol] || 0) + wallet.balances.native.formatted;
      }
      return dist;
    }, {} as Record<string, number>);

    return {
      totalValueUSD,
      wallets,
      networkDistribution,
      assetDistribution,
    };
  }

  // Helper methods
  private static async getEVMBalances(wallet: any, chain: string): Promise<UnifiedWallet['balances']> {
    try {
      const [nativeBalance, tokenBalances] = await Promise.all([
        wallet.getBalance(),
        this.getEVMTokenBalances(wallet, chain),
      ]);

      const nativeSymbol = chain === 'polygon' ? 'MATIC' : 'ETH';
      
      return {
        native: {
          balance: nativeBalance.toString(),
          formatted: Number(nativeBalance) / Math.pow(10, 18),
          symbol: nativeSymbol,
        },
        usdt: tokenBalances.find(t => t.symbol === 'USDT'),
        tokens: tokenBalances,
      };
    } catch (error) {
      logger.error('Failed to get EVM balances', { chain, error });
      return {};
    }
  }

  private static async getEVMTokenBalances(wallet: any, chain: string): Promise<UnifiedWallet['balances']['tokens']> {
    try {
      const { TOKEN_ADDRESSES } = await import('@/lib/wdk/wdk-integration');
      const chainTokens = TOKEN_ADDRESSES[chain as keyof typeof TOKEN_ADDRESSES];
      const balances = [];

      for (const [symbol, address] of Object.entries(chainTokens)) {
        try {
          const balance = await wallet.getTokenBalance(address, symbol === 'WETH' || symbol === 'WMATIC' ? 18 : 6);
          balances.push({
            symbol,
            address,
            balance: balance.toString(),
            formatted: balance,
          });
        } catch (error) {
          // Skip tokens that fail
          continue;
        }
      }

      return balances;
    } catch (error) {
      logger.error('Failed to get EVM token balances', { chain, error });
      return [];
    }
  }

  private static async getTronBalances(address: string): Promise<UnifiedWallet['balances']> {
    try {
      const [usdtBalance, trxBalance] = await Promise.all([
        getTronUSDTBalance(address),
        getTrxBalance(address),
      ]);

      return {
        native: {
          balance: trxBalance.toString(),
          formatted: trxBalance,
          symbol: 'TRX',
        },
        usdt: {
          balance: usdtBalance.toString(),
          formatted: usdtBalance,
          symbol: 'USDT',
        },
      };
    } catch (error) {
      logger.error('Failed to get TRON balances', { address, error });
      return {};
    }
  }

  private static getTokenAddress(symbol: string, chain: string): `0x${string}` {
    const tokenMap: Record<string, Record<string, string>> = {
      base: {
        'USDC': '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
        'USDT': '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        'WETH': '0x4200000000000000000000000000000000000006',
      },
      ethereum: {
        'USDC': '0xA0b86a33E6417c4c4c4c4c4c4c4c4c4c4c4c4c4c',
        'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      },
      polygon: {
        'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        'WMATIC': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      },
      arbitrum: {
        'USDC': '0xA0b86a33E6417c4c4c4c4c4c4c4c4c4c4c4c4c4c',
        'USDT': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        'WETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      },
    };

    return (tokenMap[chain]?.[symbol] || tokenMap.base['USDT']) as `0x${string}`;
  }
}
