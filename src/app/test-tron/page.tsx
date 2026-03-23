'use client';

import { useState } from 'react';
import { useTronWallet } from '@/hooks/useTronWallet';

export default function TronWalletTest() {
  const { 
    wallet, 
    loading, 
    error, 
    ready, 
    authenticated,
    createWallet,
    sendUSDT,
    hasUSDTBalance,
    formatBalance
  } = useTronWallet();

  const [sendAmount, setSendAmount] = useState('10');
  const [recipientAddress, setRecipientAddress] = useState('TXYZopYOMghyEsLfmwJQoJ2mWJ9BgTZKqp');

  const handleCreateWallet = async () => {
    const address = await createWallet();
    if (address) {
      console.log('TRON wallet created:', address);
    }
  };

  const handleSendUSDT = async () => {
    const result = await sendUSDT({
      toAddress: recipientAddress,
      amount: parseFloat(sendAmount)
    });

    if (result.success) {
      console.log('USDT sent successfully:', result.transaction);
    } else {
      console.error('Failed to send USDT:', result.error);
    }
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
          <h1 className="text-2xl font-bold text-gray-900 mb-4">TRON Wallet Test</h1>
          <p className="text-gray-600">Please connect your wallet to continue</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">TRON Wallet Test</h1>
          
          {/* Wallet Status */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Wallet Status</h2>
            {loading && <p className="text-blue-600">Loading...</p>}
            {error && <p className="text-red-600">Error: {error}</p>}
            {wallet && (
              <div className="space-y-2">
                <p><strong>Address:</strong> {wallet.address}</p>
                <p><strong>Network:</strong> {wallet.network}</p>
                <p><strong>USDT Balance:</strong> {formatBalance(wallet.balances.usdt.formatted, 'USDT')}</p>
                <p><strong>TRX Balance:</strong> {formatBalance(wallet.balances.trx.formatted, 'TRX')}</p>
              </div>
            )}
            {!wallet && !loading && (
              <p className="text-gray-600">No TRON wallet found</p>
            )}
          </div>

          {/* Create Wallet */}
          {!wallet && (
            <div className="mb-6">
              <button
                onClick={handleCreateWallet}
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create TRON Wallet'}
              </button>
            </div>
          )}

          {/* Send USDT */}
          {wallet && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Send USDT</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter TRON address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (USDT)
                </label>
                <input
                  type="number"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  step="0.01"
                  min="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter amount"
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSendUSDT}
                  disabled={loading || !hasUSDTBalance(parseFloat(sendAmount))}
                  className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send USDT'}
                </button>
                
                {!hasUSDTBalance(parseFloat(sendAmount)) && (
                  <span className="text-red-600 text-sm">
                    Insufficient USDT balance
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">TRON Network Info</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• USDT on TRON has the largest supply (47.4% of total)</li>
              <li>• Lower transaction fees compared to Ethereum</li>
              <li>• Faster block confirmations (~3 seconds)</li>
              <li>• Direct integration with Tether's ecosystem</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
