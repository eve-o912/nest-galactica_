'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UnifiedWalletManager, UnifiedWallet } from '@/lib/wallet/unified-manager';
import { useWDKWallet } from '@/hooks/useWDKWallet';
import { useTronWallet } from '@/hooks/useTronWallet';

export default function WalletDashboard() {
  const { ready, authenticated, user } = usePrivy();
  const { wallet: wdkWallet, createWallet: createWDKWallet } = useWDKWallet();
  const { wallet: tronWallet, createWallet: createTronWallet } = useTronWallet();
  
  const [unifiedWallets, setUnifiedWallets] = useState<UnifiedWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<UnifiedWallet | null>(null);
  const [portfolio, setPortfolio] = useState<any>(null);

  const userId = user?.id;

  // Initialize unified wallets
  useEffect(() => {
    if (authenticated && userId) {
      initializeWallets();
    }
  }, [authenticated, userId, wdkWallet, tronWallet]);

  const initializeWallets = async () => {
    setLoading(true);
    try {
      // Create unified wallet representations
      const wallets: UnifiedWallet[] = [];

      if (wdkWallet) {
        wallets.push({
          id: 'wdk-wallet',
          type: 'evm',
          chain: 'base',
          address: wdkWallet.address,
          balances: {
            native: {
              balance: wdkWallet.balance.eth,
              formatted: parseFloat(wdkWallet.balance.eth),
              symbol: 'ETH',
            },
            usdt: {
              balance: '0', // Would need to fetch from API
              formatted: 0,
              symbol: 'USDT',
            },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      if (tronWallet) {
        wallets.push({
          id: 'tron-wallet',
          type: 'tron',
          chain: 'tron',
          address: tronWallet.address,
          balances: {
            native: tronWallet.balances.trx,
            usdt: tronWallet.balances.usdt,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      setUnifiedWallets(wallets);
      
      // Calculate portfolio
      const portfolioSummary = UnifiedWalletManager.getPortfolioSummary(
        wallets.map(w => w.id)
      );
      setPortfolio(portfolioSummary);

    } catch (error) {
      console.error('Failed to initialize wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWDKWallet = async () => {
    await createWDKWallet();
  };

  const handleCreateTronWallet = async () => {
    await createTronWallet();
  };

  const getOptimalUSDTWallet = () => {
    return UnifiedWalletManager.getOptimalUSDTWallet();
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Wallet Dashboard</h1>
          <p className="text-gray-600">Please connect your wallet to continue</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Multi-Chain Wallet Dashboard</h1>
          <p className="text-gray-600">Manage your EVM and TRON wallets in one place</p>
        </div>

        {/* Portfolio Summary */}
        {portfolio && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Total Portfolio Value</h3>
              <p className="text-3xl font-bold text-green-600">
                ${portfolio.totalValueUSD.toFixed(2)}
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Network Distribution</h3>
              <div className="space-y-2">
                {Object.entries(portfolio.networkDistribution).map(([network, count]) => (
                  <div key={network} className="flex justify-between">
                    <span className="capitalize">{network}</span>
                    <span className="font-medium">{count} wallet{count > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Asset Distribution</h3>
              <div className="space-y-2">
                {Object.entries(portfolio.assetDistribution).map(([asset, amount]) => (
                  <div key={asset} className="flex justify-between">
                    <span>{asset}</span>
                    <span className="font-medium">{parseFloat(amount.toString()).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Wallet Creation Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New Wallet</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">EVM Wallet (Base)</h3>
              <p className="text-sm text-gray-600 mb-3">
                For Ethereum-compatible chains. Supports gasless transactions.
              </p>
              <button
                onClick={handleCreateWDKWallet}
                disabled={!!wdkWallet}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {wdkWallet ? 'Wallet Created' : 'Create EVM Wallet'}
              </button>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">TRON Wallet</h3>
              <p className="text-sm text-gray-600 mb-3">
                Optimized for USDT operations. Lower fees and faster transactions.
              </p>
              <button
                onClick={handleCreateTronWallet}
                disabled={!!tronWallet}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tronWallet ? 'Wallet Created' : 'Create TRON Wallet'}
              </button>
            </div>
          </div>
        </div>

        {/* Wallet List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Your Wallets</h2>
          </div>
          
          {loading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading wallets...</p>
            </div>
          ) : unifiedWallets.length === 0 ? (
            <div className="p-6 text-center text-gray-600">
              No wallets created yet. Create your first wallet above.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {unifiedWallets.map((wallet) => (
                <div key={wallet.id} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {wallet.type === 'evm' ? 'EVM Wallet' : 'TRON Wallet'}
                      </h3>
                      <p className="text-sm text-gray-600 capitalize">{wallet.chain} Network</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{wallet.address}</p>
                      <p className="text-xs text-gray-500">
                        Created: {wallet.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {wallet.balances.native && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-600">Native Balance</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {wallet.balances.native.formatted.toFixed(4)} {wallet.balances.native.symbol}
                        </p>
                      </div>
                    )}
                    
                    {wallet.balances.usdt && (
                      <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-green-600">USDT Balance</p>
                        <p className="text-lg font-semibold text-green-900">
                          ${wallet.balances.usdt.formatted.toFixed(2)} USDT
                        </p>
                      </div>
                    )}
                  </div>

                  {wallet.type === 'tron' && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <span className="font-semibold">Recommended for USDT:</span> Lower fees, faster confirmations
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* USDT Optimization Info */}
        <div className="mt-8 bg-blue-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">USDT Network Optimization</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-blue-800 mb-2">TRON Network (Recommended)</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 47.4% of USDT total supply</li>
                <li>• ~$1 transaction fees</li>
                <li>• ~3 second block times</li>
                <li>• Direct Tether ecosystem integration</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-800 mb-2">EVM Networks (Base/Ethereum)</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Higher gas fees ($5-50)</li>
                <li>• ~15 second block times</li>
                <li>• Gasless transactions available</li>
                <li>• Better DeFi protocol integration</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
