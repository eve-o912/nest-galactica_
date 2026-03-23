import { getMultipleTokenBalances, TOKEN_ADDRESSES } from '@/lib/wdk/client';
import { getTronUSDTBalance, isValidTronAddress } from '@/lib/tron/client';
import { logger } from '@/lib/retry';

export interface PortfolioSnapshot {
  totalValue: number;
  assets: {
    symbol: string;
    balance: number;
    value: number;
    percentage: number;
    network: string;
  }[];
  lastUpdated: Date;
}

export interface RebalanceRecommendation {
  action: 'buy' | 'sell' | 'hold';
  token: string;
  amount: number;
  reason: string;
  targetPercentage: number;
  currentPercentage: number;
}

// Get complete portfolio snapshot across networks
export async function getPortfolioSnapshot(
  ethAddress: `0x${string}`,
  tronAddress?: string
): Promise<PortfolioSnapshot> {
  try {
    // Get Base network balances
    const baseTokens = [
      { address: TOKEN_ADDRESSES.USDC, symbol: 'USDC', decimals: 6 },
      { address: TOKEN_ADDRESSES.USDT, symbol: 'USDT', decimals: 6 },
      { address: TOKEN_ADDRESSES.WETH, symbol: 'WETH', decimals: 18 },
    ];

    const baseBalances = await getMultipleTokenBalances(ethAddress, baseTokens);

    // Get TRON USDT balance if address provided
    let tronUSDTBalance = 0;
    if (tronAddress && isValidTronAddress(tronAddress)) {
      try {
        tronUSDTBalance = await getTronUSDTBalance(tronAddress);
      } catch (error) {
        logger.warn('Failed to get TRON USDT balance', { tronAddress, error });
      }
    }

    // Combine all assets
    const assets = [
      ...baseBalances.map(token => ({
        symbol: token.symbol,
        balance: token.formatted,
        value: token.formatted, // Assuming 1:1 for stablecoins, would need price oracle for others
        percentage: 0, // Will be calculated below
        network: 'Base' as const,
      })),
    ];

    // Add TRON USDT if balance exists
    if (tronUSDTBalance > 0) {
      assets.push({
        symbol: 'USDT',
        balance: tronUSDTBalance,
        value: tronUSDTBalance,
        percentage: 0,
        network: 'TRON' as const,
      });
    }

    // Calculate total value and percentages
    const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);
    
    assets.forEach(asset => {
      asset.percentage = totalValue > 0 ? (asset.value / totalValue) * 100 : 0;
    });

    return {
      totalValue,
      assets,
      lastUpdated: new Date(),
    };
  } catch (error) {
    logger.error('Failed to get portfolio snapshot', { ethAddress, tronAddress, error });
    throw error;
  }
}

// Calculate rebalancing recommendations
export function calculateRebalanceRecommendations(
  currentPortfolio: PortfolioSnapshot,
  targetAllocations: { [key: string]: number }
): RebalanceRecommendation[] {
  const recommendations: RebalanceRecommendation[] = [];

  for (const [symbol, targetPercentage] of Object.entries(targetAllocations)) {
    const currentAsset = currentPortfolio.assets.find(a => a.symbol === symbol);
    const currentPercentage = currentAsset?.percentage || 0;
    const currentValue = currentAsset?.value || 0;

    const difference = targetPercentage - currentPercentage;
    const threshold = 5; // 5% threshold to avoid frequent rebalancing

    if (Math.abs(difference) > threshold) {
      const action = difference > 0 ? 'buy' : 'sell';
      const targetValue = (currentPortfolio.totalValue * targetPercentage) / 100;
      const amount = Math.abs(targetValue - currentValue);

      recommendations.push({
        action,
        token: symbol,
        amount,
        reason: `Current allocation (${currentPercentage.toFixed(1)}%) is ${difference > 0 ? 'below' : 'above'} target (${targetPercentage}%)`,
        targetPercentage,
        currentPercentage,
      });
    }
  }

  return recommendations.sort((a, b) => b.amount - a.amount);
}

// Get yield optimization opportunities
export async function getYieldOptimizationOpportunities(
  portfolio: PortfolioSnapshot
): Promise<{
  protocol: string;
  apy: number;
  tvl: number;
  recommendation: string;
}[]> {
  // Mock data - in production, this would fetch real-time data from protocols
  const mockProtocolData = [
    {
      protocol: 'YO Protocol',
      apy: 8.5,
      tvl: 50000000,
      recommendation: 'High yield with low risk on Base',
    },
    {
      protocol: 'Aave V3',
      apy: 4.2,
      tvl: 100000000,
      recommendation: 'Stable yields with high liquidity',
    },
    {
      protocol: 'Compound',
      apy: 3.8,
      tvl: 80000000,
      recommendation: 'Established protocol with good yields',
    },
  ];

  return mockProtocolData.sort((a, b) => b.apy - a.apy);
}

// Calculate portfolio metrics
export function calculatePortfolioMetrics(portfolio: PortfolioSnapshot): {
  diversificationScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  yieldPotential: number;
} {
  const stablecoinAllocation = portfolio.assets
    .filter(a => ['USDC', 'USDT'].includes(a.symbol))
    .reduce((sum, a) => sum + a.percentage, 0);

  const diversificationScore = Math.min(
    portfolio.assets.length * 10,
    100
  ); // Simple score based on number of assets

  const riskLevel = stablecoinAllocation > 80 ? 'low' : 
                  stablecoinAllocation > 50 ? 'medium' : 'high';

  const yieldPotential = 8.5 * (stablecoinAllocation / 100); // Assuming 8.5% max APY

  return {
    diversificationScore,
    riskLevel,
    yieldPotential,
  };
}

// Suggest optimal portfolio allocation based on user profile
export function suggestOptimalAllocation(userProfile: {
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  timeHorizon: 'short' | 'medium' | 'long';
  goals: string[];
}): { [key: string]: number } {
  const baseAllocation = { USDC: 50, USDT: 30, WETH: 20 };

  switch (userProfile.riskTolerance) {
    case 'conservative':
      return { USDC: 70, USDT: 25, WETH: 5 };
    case 'moderate':
      return baseAllocation;
    case 'aggressive':
      return { USDC: 30, USDT: 20, WETH: 50 };
    default:
      return baseAllocation;
  }
}

// Bridge simulation for cross-chain operations
export function simulateBridgeOperation(
  fromNetwork: string,
  toNetwork: string,
  token: string,
  amount: number
): {
  estimatedFee: number;
  estimatedTime: number;
  successProbability: number;
  risks: string[];
} {
  const baseFee = fromNetwork === 'Base' ? 2 : 5; // Base is cheaper
  const bridgeFee = amount * 0.001; // 0.1% bridge fee
  
  return {
    estimatedFee: baseFee + bridgeFee,
    estimatedTime: fromNetwork === 'Base' ? 5 : 15, // minutes
    successProbability: 0.95,
    risks: [
      'Smart contract risk',
      'Network congestion',
      'Slippage during high volatility',
    ],
  };
}
