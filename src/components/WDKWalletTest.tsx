'use client';

import { useState } from 'react';
import { usePureWDKWallet } from '@/hooks/usePureWDKWallet';
import { Button } from '@/components/ui';
import { 
  Wallet, 
  Plus, 
  Send, 
  Loader2, 
  CheckCircle, 
  XCircle,
  Copy,
  ExternalLink
} from 'lucide-react';

export function WDKWalletTest() {
  const {
    wallet,
    loading,
    error,
    ready,
    authenticated,
    createWallet,
    sendTransaction,
    hasBalance,
    formatBalance,
  } = usePureWDKWallet();

  const [testTx, setTestTx] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testSignature, setTestSignature] = useState('');

  const handleCreateWallet = async () => {
    const result = await createWallet();
    if (result) {
      console.log('Wallet created successfully');
    }
  };

  const handleSendTestTransaction = async () => {
    // Send 0.001 ETH to self (test transaction)
    const result = await sendTransaction({
      to: wallet?.address || '',
      amount: '0.001',
      tokenType: 'eth',
    });

    if (result.success && result.txHash) {
      setTestTx(result.txHash);
      console.log('Transaction sent:', result);
    } else {
      console.error('Transaction failed:', result.error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const openBasescan = (txHash: string) => {
    window.open(`https://basescan.org/tx/${txHash}`, '_blank');
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">Initializing wallet...</span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="text-center p-8 border rounded-lg">
        <Wallet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-semibold mb-2">Connect Wallet</h3>
        <p className="text-gray-600">Please connect your wallet to use WDK features</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 border rounded-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center">
          <Wallet className="w-5 h-5 mr-2" />
          WDK Wallet Test
        </h2>
        <div className="flex items-center space-x-2">
          {wallet ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500" />
          )}
          <span className="text-sm text-gray-600">
            {wallet ? 'Connected' : 'Not Connected'}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {!wallet ? (
        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
          <Wallet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-semibold mb-2">No WDK Wallet</h3>
          <p className="text-gray-600 mb-4">Create a wallet to test WDK functionality</p>
          <Button onClick={handleCreateWallet} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Create Wallet
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Wallet Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-3">Wallet Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Address:</span>
                <div className="flex items-center space-x-2">
                  <code className="bg-white px-2 py-1 rounded">
                    {wallet?.address.slice(0, 6)}...{wallet?.address.slice(-4)}
                  </code>
                  <button
                    onClick={() => copyToClipboard(wallet?.address || '')}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">USDT Balance:</span>
                <span className="font-medium">
                  {formatBalance(wallet?.balance.usdt || '0', 'usdt')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ETH Balance:</span>
                <span className="font-medium">
                  {formatBalance(wallet?.balance.eth || '0', 'eth')}
                </span>
              </div>
            </div>
          </div>

          {/* Test Actions */}
          <div className="space-y-3">
            <h3 className="font-semibold">Test Actions</h3>
            
            <Button
              onClick={handleSendTestTransaction}
              disabled={loading || !hasBalance('0.001', 'eth')}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Test Transaction (0.001 ETH)
            </Button>
          </div>

          {/* Test Results */}
          {testTx && (
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <h4 className="font-semibold text-green-800 mb-2">Transaction Sent!</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Tx Hash:</span>
                  <div className="flex items-center space-x-2">
                    <code className="bg-white px-2 py-1 rounded text-xs">
                      {testTx.slice(0, 10)}...{testTx.slice(-8)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(testTx)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => openBasescan(testTx)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
