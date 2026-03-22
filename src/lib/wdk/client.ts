import { WDK } from '@tetherto/wdk';
import { EVMPocket } from '@tetherto/wdk-wallet-evm';
import { ERC4337Pocket } from '@tetherto/wdk-wallet-evm-erc-4337';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { logger } from '@/lib/retry';

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const PAYMASTER_URL = process.env.PAYMASTER_URL;
const BUNDLER_URL = process.env.BUNDLER_URL;

// Create Viem public client for Base
export const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

// WDK client configuration
const wdkConfig = {
  network: 'base',
  rpcUrl: BASE_RPC_URL,
  paymasterUrl: PAYMASTER_URL,
  bundlerUrl: BUNDLER_URL,
  chains: [base],
};

// WDK client singleton
let wdkClient: WDK | null = null;

export async function createWDKClient(): Promise<WDK> {
  if (wdkClient) {
    return wdkClient;
  }

  try {
    // Initialize WDK with EVM and ERC-4337 support
    wdkClient = new WDK({
      ...wdkConfig,
      pockets: [
        new EVMPocket({
          chain: base,
          rpcUrl: BASE_RPC_URL,
        }),
        new ERC4337Pocket({
          chain: base,
          rpcUrl: BASE_RPC_URL,
          paymasterUrl: PAYMASTER_URL,
          bundlerUrl: BUNDLER_URL,
        }),
      ],
    });

    logger.info('WDK client initialized successfully');
    return wdkClient;
  } catch (error) {
    logger.error('Failed to initialize WDK client', error);
    throw new Error('WDK client initialization failed');
  }
}

export async function getWDKClient(): Promise<WDK> {
  if (!wdkClient) {
    return await createWDKClient();
  }
  return wdkClient;
}

// Wallet creation helper
export async function createEVMWallet(options?: {
  useAccountAbstraction?: boolean;
  mnemonic?: string;
}) {
  const client = await getWDKClient();
  
  const walletConfig = {
    type: 'evm' as const,
    network: 'base',
    accountAbstraction: options?.useAccountAbstraction ?? true,
    mnemonic: options?.mnemonic,
  };

  return await client.createWallet(walletConfig);
}

// Wallet restoration helper
export async function restoreEVMWallet(walletData: {
  address: string;
  privateKey?: string;
  mnemonic?: string;
  useAccountAbstraction?: boolean;
}) {
  const client = await getWDKClient();
  
  return client.restoreWallet({
    type: 'evm',
    address: walletData.address as `0x${string}`,
    privateKey: walletData.privateKey,
    mnemonic: walletData.mnemonic,
    network: 'base',
    accountAbstraction: walletData.useAccountAbstraction ?? true,
  });
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

// Get token balance (USDC)
export async function getTokenBalance(
  address: `0x${string}`,
  tokenAddress: `0x${string}`
) {
  try {
    const balance = await publicClient.readContract({
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
    return balance as bigint;
  } catch (error) {
    logger.error('Failed to get token balance', { address, tokenAddress, error });
    throw error;
  }
}

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
