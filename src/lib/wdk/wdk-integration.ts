import { createPublicClient, http, createWalletClient, Chain } from 'viem';
import { base, mainnet, polygon, arbitrum } from 'viem/chains';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { logger } from '@/lib/retry';

// WDK-compatible wallet interface
export interface WDKWallet {
  address: `0x${string}`;
  publicKey: string;
  chain: string;
  network: string;
  
  // Core wallet operations
  sendTransaction(params: TransactionParams): Promise<TransactionResult>;
  sendToken(params: TokenParams): Promise<TransactionResult>;
  signMessage(message: string): Promise<string>;
  signTypedData(domain: any, types: any, value: any): Promise<string>;
  
  // Balance and info
  getBalance(): Promise<bigint>;
  getTokenBalance(tokenAddress: `0x${string}`, decimals?: number): Promise<number>;
  estimateGas(params: GasParams): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
}

export interface TransactionParams {
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  gasLimit?: bigint;
}

export interface TokenParams {
  tokenAddress: `0x${string}`;
  to: `0x${string}`;
  amount: number;
  decimals?: number;
}

export interface TransactionResult {
  hash: `0x${string}`;
  blockNumber: bigint;
  gasUsed: bigint;
}

export interface GasParams {
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
}

// WDK-compatible wallet implementation
export class WDKCompatibleWallet implements WDKWallet {
  private account: any;
  private chain: Chain;
  private publicClient: any;
  private walletClient: any;
  private chainName: string;

  constructor(config: {
    mnemonic?: string;
    privateKey?: string;
    chain: 'base' | 'ethereum' | 'polygon' | 'arbitrum';
    rpcUrl?: string;
  }) {
    const chainMap = {
      base,
      ethereum: mainnet,
      polygon,
      arbitrum,
    };

    this.chainName = config.chain;
    this.chain = chainMap[config.chain];
    
    const rpcUrl = config.rpcUrl || this.getDefaultRpcUrl(config.chain);
    
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl),
    });

    // Create account from mnemonic or private key
    if (config.mnemonic) {
      this.account = mnemonicToAccount(config.mnemonic);
    } else if (config.privateKey) {
      this.account = privateKeyToAccount(config.privateKey as `0x${string}`);
    } else {
      throw new Error('Either mnemonic or privateKey is required');
    }

    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(rpcUrl),
    });
  }

  get address(): `0x${string}` {
    return this.account.address;
  }

  get publicKey(): string {
    return this.account.publicKey;
  }

  get chain(): string {
    return this.chainName;
  }

  get network(): string {
    return this.chain.name;
  }

  async getBalance(): Promise<bigint> {
    try {
      const balance = await this.publicClient.getBalance({
        address: this.account.address,
      });
      return balance;
    } catch (error) {
      logger.error('Failed to get balance', error);
      throw error;
    }
  }

  async getTokenBalance(tokenAddress: `0x${string}`, decimals: number = 6): Promise<number> {
    try {
      const balance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
          },
        ],
        functionName: 'balanceOf',
        args: [this.account.address],
      });
      
      return Number(balance) / Math.pow(10, decimals);
    } catch (error) {
      logger.error('Failed to get token balance', error);
      throw error;
    }
  }

  async sendTransaction(params: TransactionParams): Promise<TransactionResult> {
    try {
      const tx = await this.walletClient.sendTransaction({
        to: params.to,
        value: params.value || BigInt(0),
        data: params.data || '0x',
        gas: params.gasLimit,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      logger.info('Transaction sent successfully', {
        hash: tx,
        from: this.account.address,
        to: params.to,
        value: params.value?.toString(),
      });

      return {
        hash: tx,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      logger.error('Failed to send transaction', error);
      throw error;
    }
  }

  async sendToken(params: TokenParams): Promise<TransactionResult> {
    const decimals = params.decimals || 6;
    const amountInWei = BigInt(Math.floor(params.amount * Math.pow(10, decimals)));

    try {
      const tx = await this.walletClient.writeContract({
        address: params.tokenAddress,
        abi: [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'transfer',
        args: [params.to, amountInWei],
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: tx,
      });

      logger.info('Token transfer successful', {
        hash: tx,
        token: params.tokenAddress,
        from: this.account.address,
        to: params.to,
        amount: params.amount,
      });

      return {
        hash: tx,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      logger.error('Failed to send token', error);
      throw error;
    }
  }

  async signMessage(message: string): Promise<string> {
    try {
      const signature = await this.walletClient.signMessage({
        message,
      });
      
      logger.info('Message signed successfully', {
        address: this.account.address,
        message: message.substring(0, 50),
      });

      return signature;
    } catch (error) {
      logger.error('Failed to sign message', error);
      throw error;
    }
  }

  async signTypedData(domain: any, types: any, value: any): Promise<string> {
    try {
      const signature = await this.walletClient.signTypedData({
        domain,
        types,
        primaryType: Object.keys(types)[0],
        message: value,
      });
      
      logger.info('Typed data signed successfully', {
        address: this.account.address,
        domain,
      });

      return signature;
    } catch (error) {
      logger.error('Failed to sign typed data', error);
      throw error;
    }
  }

  async estimateGas(params: GasParams): Promise<bigint> {
    try {
      const gas = await this.publicClient.estimateGas({
        account: this.account.address,
        to: params.to,
        value: params.value || BigInt(0),
        data: params.data || '0x',
      });
      return gas;
    } catch (error) {
      logger.error('Failed to estimate gas', error);
      throw error;
    }
  }

  async getGasPrice(): Promise<bigint> {
    try {
      const gasPrice = await this.publicClient.getGasPrice();
      return gasPrice;
    } catch (error) {
      logger.error('Failed to get gas price', error);
      throw error;
    }
  }

  private getDefaultRpcUrl(chain: string): string {
    const urls = {
      base: 'https://mainnet.base.org',
      ethereum: 'https://eth.llamarpc.com',
      polygon: 'https://polygon.llamarpc.com',
      arbitrum: 'https://arbitrum.llamarpc.com',
    };
    return urls[chain as keyof typeof urls] || urls.base;
  }
}

// WDK Manager - Main wallet management class
export class WDKManager {
  private static instances: Map<string, WDKWallet> = new Map();

  // Create or get wallet instance
  static getWallet(config: {
    userId?: string;
    mnemonic?: string;
    privateKey?: string;
    chain: 'base' | 'ethereum' | 'polygon' | 'arbitrum';
    rpcUrl?: string;
  }): WDKWallet {
    const instanceKey = config.userId || config.privateKey || config.mnemonic || 'default';
    
    if (this.instances.has(instanceKey)) {
      return this.instances.get(instanceKey)!;
    }

    const wallet = new WDKCompatibleWallet({
      mnemonic: config.mnemonic,
      privateKey: config.privateKey,
      chain: config.chain,
      rpcUrl: config.rpcUrl,
    });

    this.instances.set(instanceKey, wallet);
    return wallet;
  }

  // Create new wallet with random mnemonic
  static createWallet(config: {
    chain: 'base' | 'ethereum' | 'polygon' | 'arbitrum';
    rpcUrl?: string;
  }): {
    wallet: WDKWallet;
    mnemonic: string;
    privateKey: string;
  } {
    const mnemonic = this.generateMnemonic();
    const wallet = this.getWallet({
      mnemonic,
      chain: config.chain,
      rpcUrl: config.rpcUrl,
    });

    const compatibleWallet = wallet as WDKCompatibleWallet;
    
    return {
      wallet,
      mnemonic,
      privateKey: compatibleWallet['account'].privateKey,
    };
  }

  // Generate mnemonic
  static generateMnemonic(): string {
    const { entropyToMnemonic } = require('bip39');
    const crypto = require('crypto');
    const entropy = crypto.randomBytes(16);
    return entropyToMnemonic(entropy);
  }

  // Validate mnemonic
  static validateMnemonic(mnemonic: string): boolean {
    const { validateMnemonic } = require('bip39');
    return validateMnemonic(mnemonic);
  }

  // Clear wallet instance
  static clearWallet(userId: string): void {
    this.instances.delete(userId);
  }

  // Get all wallet instances
  static getAllWallets(): Map<string, WDKWallet> {
    return this.instances;
  }

  // Import wallet from private key
  static importWallet(config: {
    privateKey: string;
    chain: 'base' | 'ethereum' | 'polygon' | 'arbitrum';
    rpcUrl?: string;
  }): WDKWallet {
    return this.getWallet({
      privateKey: config.privateKey,
      chain: config.chain,
      rpcUrl: config.rpcUrl,
    });
  }

  // Import wallet from mnemonic
  static importFromMnemonic(config: {
    mnemonic: string;
    chain: 'base' | 'ethereum' | 'polygon' | 'arbitrum';
    rpcUrl?: string;
  }): WDKWallet {
    return this.getWallet({
      mnemonic: config.mnemonic,
      chain: config.chain,
      rpcUrl: config.rpcUrl,
    });
  }
}

// Token addresses for different chains
export const TOKEN_ADDRESSES = {
  base: {
    USDC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' as `0x${string}`,
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as `0x${string}`,
    WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  },
  ethereum: {
    USDC: '0xA0b86a33E6417c4c4c4c4c4c4c4c4c4c4c4c4c4c' as `0x${string}`,
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as `0x${string}`,
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as `0x${string}`,
  },
  polygon: {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as `0x${string}`,
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as `0x${string}`,
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' as `0x${string}`,
  },
  arbitrum: {
    USDC: '0xA0b86a33E6417c4c4c4c4c4c4c4c4c4c4c4c4c4c' as `0x${string}`,
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as `0x${string}`,
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}`,
  },
} as const;
