import { logger } from '@/lib/retry';

// Dynamic import for tronweb to avoid build issues
const getTronWeb = async () => {
  const TronWeb = (await import('tronweb')).default;
  return TronWeb;
};

// TRON network configuration
const TRON_CONFIG = {
  fullHost: process.env.TRON_RPC_URL || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY,
};

// USDT token contract on TRON
const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// TRON client singleton
let tronWeb: any = null;

export async function getTronWebInstance(): Promise<any> {
  if (tronWeb) {
    return tronWeb;
  }

  try {
    const TronWeb = await getTronWeb();
    tronWeb = new TronWeb({
      fullHost: TRON_CONFIG.fullHost,
      headers: { "TRON-PRO-API-KEY": process.env.TRON_API_KEY },
      privateKey: TRON_CONFIG.privateKey,
    });

    // Verify connection
    if (!tronWeb.isAddress(process.env.TRON_WALLET_ADDRESS || '')) {
      throw new Error('Invalid TRON wallet address');
    }

    logger.info('TRON client initialized successfully');
    return tronWeb;
  } catch (error) {
    logger.error('Failed to initialize TRON client', error);
    throw new Error('TRON client initialization failed');
  }
}

// Get TRON USDT balance
export async function getTronUSDTBalance(address: string): Promise<number> {
  try {
    const tron = await getTronWebInstance();
    const contract = await tron.contract().at(TRON_USDT_CONTRACT);
    
    const balance = await contract.balanceOf(address).call();
    return Number(balance) / 1_000_000; // USDT has 6 decimals
  } catch (error) {
    logger.error('Failed to get TRON USDT balance', { address, error });
    throw error;
  }
}

// Send TRON USDT
export async function sendTronUSDT(
  toAddress: string,
  amount: number
): Promise<{ txHash: string; success: boolean }> {
  try {
    const tron = await getTronWebInstance();
    const contract = await tron.contract().at(TRON_USDT_CONTRACT);
    
    const amountInSun = Math.floor(amount * 1_000_000); // Convert to smallest unit
    
    const transaction = await contract.transfer(toAddress, amountInSun).send({
      feeLimit: 100_000_000, // 100 TRX fee limit
      callValue: 0,
    });

    logger.info('TRON USDT transfer initiated', { 
      to: toAddress, 
      amount, 
      txHash: transaction 
    });

    return { txHash: transaction, success: true };
  } catch (error) {
    logger.error('Failed to send TRON USDT', { toAddress, amount, error });
    throw error;
  }
}

// Get TRX balance
export async function getTrxBalance(address: string): Promise<number> {
  try {
    const tron = await getTronWebInstance();
    const balance = await tron.trx.getBalance(address);
    return balance / 1_000_000; // Convert from SUN to TRX
  } catch (error) {
    logger.error('Failed to get TRX balance', { address, error });
    throw error;
  }
}

// Create TRON wallet
export async function createTronWallet(): Promise<{ address: string; privateKey: string }> {
  try {
    const tron = await getTronWebInstance();
    const account = tron.createAccount();
    
    return {
      address: account.address,
      privateKey: account.privateKey,
    };
  } catch (error) {
    logger.error('Failed to create TRON wallet', error);
    throw error;
  }
}

// Validate TRON address
export async function isValidTronAddress(address: string): Promise<boolean> {
  try {
    const tron = await getTronWebInstance();
    return tron.isAddress(address);
  } catch {
    return false;
  }
}

// Get transaction status
export async function getTransactionStatus(txHash: string): Promise<{
  confirmed: boolean;
  blockNumber?: number;
  timestamp?: number;
}> {
  try {
    const tron = await getTronWebInstance();
    const transaction = await tron.trx.getTransaction(txHash);
    
    if (!transaction) {
      return { confirmed: false };
    }

    const txInfo = await tron.trx.getTransactionInfo(txHash);
    
    return {
      confirmed: txInfo && txInfo.blockNumber > 0,
      blockNumber: txInfo?.blockNumber,
      timestamp: txInfo?.blockTimeStamp,
    };
  } catch (error) {
    logger.error('Failed to get transaction status', { txHash, error });
    return { confirmed: false };
  }
}

// Convert between TRON and Ethereum addresses (for cross-chain operations)
export async function convertEthToTronAddress(ethAddress: string): Promise<string> {
  try {
    const tron = await getTronWebInstance();
    return tron.address.fromHex(ethAddress);
  } catch (error) {
    logger.error('Failed to convert ETH to TRON address', { ethAddress, error });
    throw error;
  }
}

export async function convertTronToEthAddress(tronAddress: string): Promise<string> {
  try {
    const tron = await getTronWebInstance();
    return tron.address.toHex(tronAddress);
  } catch (error) {
    logger.error('Failed to convert TRON to ETH address', { tronAddress, error });
    throw error;
  }
}
