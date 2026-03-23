import { WDKManager, WDKWallet, TOKEN_ADDRESSES } from '@/lib/wdk/wdk-integration';
import { createPublicClient, http } from 'viem';
import { base, mainnet, polygon, arbitrum } from 'viem/chains';
import { logger } from '@/lib/retry';

// Multi-chain configuration
const CHAIN_CONFIGS = {
  base: {
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    chain: base,
    paymasterUrl: process.env.PAYMASTER_URL,
    bundlerUrl: process.env.BUNDLER_URL,
  },
  ethereum: {
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    chain: mainnet,
    paymasterUrl: process.env.ETHEREUM_PAYMASTER_URL,
    bundlerUrl: process.env.ETHEREUM_BUNDLER_URL,
  },
  polygon: {
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon.llamarpc.com',
    chain: polygon,
    paymasterUrl: process.env.POLYGON_PAYMASTER_URL,
    bundlerUrl: process.env.POLYGON_BUNDLER_URL,
  },
  arbitrum: {
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arbitrum.llamarpc.com',
    chain: arbitrum,
    paymasterUrl: process.env.ARBITRUM_PAYMASTER_URL,
    bundlerUrl: process.env.ARBITRUM_BUNDLER_URL,
  },
};

// Token addresses across different chains
export const MULTI_CHAIN_TOKEN_ADDRESSES = {
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

// Multi-chain public clients
export const publicClients = {
  base: createPublicClient({
    chain: base,
    transport: http(CHAIN_CONFIGS.base.rpcUrl),
  }),
  ethereum: createPublicClient({
    chain: mainnet,
    transport: http(CHAIN_CONFIGS.ethereum.rpcUrl),
  }),
  polygon: createPublicClient({
    chain: polygon,
    transport: http(CHAIN_CONFIGS.polygon.rpcUrl),
  }),
  arbitrum: createPublicClient({
    chain: arbitrum,
    transport: http(CHAIN_CONFIGS.arbitrum.rpcUrl),
  }),
};

// Get public client for specific chain
export function getPublicClient(chainName: keyof typeof CHAIN_CONFIGS) {
  return publicClients[chainName];
}

// WDK client instances for each chain
const wdkClients: Record<string, WDKWallet> = {};

// Create WDK client for specific chain
export async function createWDKClient(chainName: keyof typeof CHAIN_CONFIGS = 'base'): Promise<WDKWallet> {
  if (wdkClients[chainName]) {
    return wdkClients[chainName];
  }

  const config = CHAIN_CONFIGS[chainName];

  try {
    // Create WDK-compatible wallet
    const mockWallet = WDKManager.createWallet({
      chain: chainName as 'base' | 'ethereum' | 'polygon' | 'arbitrum',
      rpcUrl: config.rpcUrl,
    });

    wdkClients[chainName] = mockWallet.wallet;
    logger.info(`WDK-compatible client created for ${chainName}`);
    return mockWallet.wallet;
  } catch (error) {
    logger.error(`Failed to create WDK client for ${chainName}`, error);
    throw new Error(`WDK client creation failed for ${chainName}`);
  }
}

// Get WDK client for specific chain
export async function getWDKClient(chainName: keyof typeof CHAIN_CONFIGS = 'base'): Promise<WDKWallet> {
  if (!wdkClients[chainName]) {
    return await createWDKClient(chainName);
  }
  return wdkClients[chainName];
}

// Get all WDK clients
export async function getAllWDKClients(): Promise<Record<string, WDKWallet>> {
  const chainNames = Object.keys(CHAIN_CONFIGS) as Array<keyof typeof CHAIN_CONFIGS>;
  
  for (const chainName of chainNames) {
    if (!wdkClients[chainName]) {
      await createWDKClient(chainName);
    }
  }
  
  return wdkClients;
}

// Legacy compatibility
export const publicClient = publicClients.base;

// Wallet creation helper using WDK Manager
export async function createEVMWallet(options?: {
  useAccountAbstraction?: boolean;
  mnemonic?: string;
  chain?: 'base' | 'ethereum' | 'polygon' | 'arbitrum';
}) {
  const chain = options?.chain || 'base';
  
  if (options?.mnemonic) {
    // Import from existing mnemonic
    const wallet = WDKManager.importFromMnemonic({
      mnemonic: options.mnemonic,
      chain,
    });
    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
      chain,
      accountAbstraction: options.useAccountAbstraction ?? false,
    };
  } else {
    // Create new wallet
    const { wallet, mnemonic, privateKey } = WDKManager.createWallet({
      chain,
    });
    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
      mnemonic,
      privateKey,
      chain,
      accountAbstraction: options.useAccountAbstraction ?? false,
    };
  }
}

// Wallet restoration helper using WDK Manager
export async function restoreEVMWallet(walletData: {
  address: string;
  privateKey?: string;
  mnemonic?: string;
  useAccountAbstraction?: boolean;
  chain?: 'base' | 'ethereum' | 'polygon' | 'arbitrum';
}) {
  const chain = walletData.chain || 'base';
  
  if (walletData.privateKey) {
    // Import from private key
    const wallet = WDKManager.importWallet({
      privateKey: walletData.privateKey,
      chain,
    });
    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
      chain,
      accountAbstraction: walletData.useAccountAbstraction ?? false,
    };
  } else if (walletData.mnemonic) {
    // Import from mnemonic
    const wallet = WDKManager.importFromMnemonic({
      mnemonic: walletData.mnemonic,
      chain,
    });
    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
      chain,
      accountAbstraction: walletData.useAccountAbstraction ?? false,
    };
  } else {
    throw new Error('Either privateKey or mnemonic is required for wallet restoration');
  }
}

// Get wallet balance
export async function getWalletBalance(address: `0x${string}`) {
  try {
    const balance = await publicClient.getBalance({ address });
    return balance;
  } catch (error) {
    logger.error('Failed to get wallet balance', { address, error });
    throw error;
  }
}

// Get token balance on specific chain
export async function getTokenBalanceOnChain(
  address: `0x${string}`,
  tokenAddress: `0x${string}`,
  chainName: keyof typeof CHAIN_CONFIGS,
  decimals: number = 6
) {
  try {
    const client = getPublicClient(chainName);
    const balance = await client.readContract({
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
      args: [address],
    });
    
    const balanceFormatted = Number(balance) / Math.pow(10, decimals);
    return { balance: balance as bigint, formatted: balanceFormatted, chain: chainName };
  } catch (error) {
    logger.error('Failed to get token balance on chain', { address, tokenAddress, chainName, error });
    throw error;
  }
}

// Get token balances across all chains
export async function getMultiChainTokenBalances(
  address: `0x${string}`,
  tokenSymbol: 'USDC' | 'USDT' | 'WETH'
): Promise<Array<{
  chain: string;
  balance: bigint;
  formatted: number;
  address: `0x${string}`;
}>> {
  const results = [];
  
  for (const [chainName, tokens] of Object.entries(MULTI_CHAIN_TOKEN_ADDRESSES)) {
    if (tokens[tokenSymbol]) {
      try {
        const result = await getTokenBalanceOnChain(
          address,
          tokens[tokenSymbol],
          chainName as keyof typeof CHAIN_CONFIGS,
          tokenSymbol === 'WETH' ? 18 : 6
        );
        results.push({
          chain: chainName,
          balance: result.balance,
          formatted: result.formatted,
          address: tokens[tokenSymbol],
        });
      } catch (error) {
        logger.warn(`Failed to get ${tokenSymbol} balance on ${chainName}`, error);
      }
    }
  }
  
  return results;
}

// Get total token balance across all chains
export async function getTotalTokenBalanceAcrossChains(
  address: `0x${string}`,
  tokenSymbol: 'USDC' | 'USDT' | 'WETH'
): Promise<{
  total: number;
  byChain: Array<{
    chain: string;
    balance: number;
    percentage: number;
  }>;
}> {
  const balances = await getMultiChainTokenBalances(address, tokenSymbol);
  const total = balances.reduce((sum, bal) => sum + bal.formatted, 0);
  
  const byChain = balances.map(bal => ({
    chain: bal.chain,
    balance: bal.formatted,
    percentage: total > 0 ? (bal.formatted / total) * 100 : 0,
  }));
  
  return { total, byChain };
}

// Bridge tokens between chains (simplified)
export async function bridgeTokens(
  fromChain: keyof typeof CHAIN_CONFIGS,
  toChain: keyof typeof CHAIN_CONFIGS,
  tokenAddress: `0x${string}`,
  amount: number,
  recipientAddress: `0x${string}`
): Promise<{
  txHash: string;
  estimatedTime: number;
  fees: number;
}> {
  try {
    // This would integrate with actual bridge protocols like LayerZero, Wormhole, etc.
    // Mock implementation for now
    const bridgeFee = amount * 0.001; // 0.1% bridge fee
    const estimatedTime = Math.random() * 10 + 5; // 5-15 minutes
    
    logger.info('Bridging tokens', {
      fromChain,
      toChain,
      tokenAddress,
      amount,
      recipientAddress,
    });
    
    return {
      txHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      estimatedTime,
      fees: bridgeFee,
    };
  } catch (error) {
    logger.error('Failed to bridge tokens', { fromChain, toChain, amount, error });
    throw error;
  }
}

// Get multiple token balances at once
export async function getMultipleTokenBalances(
  address: `0x${string}`,
  tokens: Array<{ address: `0x${string}`, symbol: string, decimals: number }>
) {
  const balances = await Promise.allSettled(
    tokens.map(token => 
      getTokenBalance(address, token.address, token.decimals)
        .then(result => ({ ...token, ...result }))
    )
  );

  return balances
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map(result => result.value);
}

// Common token addresses on Base
export const TOKEN_ADDRESSES = {
  USDC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' as `0x${string}`,
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as `0x${string}`,
  WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
} as const;

// Estimate gas for transaction
export async function estimateGas(tx: {
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
}) {
  try {
    const gasEstimate = await publicClient.estimateGas({
      to: tx.to,
      value: tx.value || BigInt(0),
      data: tx.data || '0x',
    });
    return gasEstimate;
  } catch (error) {
    logger.error('Failed to estimate gas', { tx, error });
    throw error;
  }
}

// Get current gas price
export async function getGasPrice() {
  try {
    const gasPrice = await publicClient.getGasPrice();
    return gasPrice;
  } catch (error) {
    logger.error('Failed to get gas price', error);
    throw error;
  }
}

// Check if address is a contract
export async function isContract(address: `0x${string}`) {
  try {
    const bytecode = await publicClient.getBytecode({ address });
    return bytecode !== '0x';
  } catch (error) {
    logger.error('Failed to check if address is contract', { address, error });
    return false;
  }
}
