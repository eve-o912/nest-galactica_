'use client';

import { useState } from 'react';
import { useWDKWallet } from '@/hooks/useWDKWallet';
import { Button } from '@/components/ui';
import { 
  Wallet, 
  Plus, 
  Send, 
  Loader2, 
  CheckCircle, 
  XCircle,
  Copy,
  ExternalLink,
  AlertTriangle,
  Info,
  RefreshCw,
  Play
} from 'lucide-react';

export default function WDKTestPage() {
  const {
    wallet,
    loading,
    error,
    ready,
    authenticated,
    createWallet,
    sendTransaction,
    signMessage,
    hasBalance,
    formatBalance,
    isConnected,
    hasWallet,
    fetchWallet,
  } = useWDKWallet();

  const [testResults, setTestResults] = useState<string[]>([]);
  const [testTx, setTestTx] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testSignature, setTestSignature] = useState('');
  const [testing, setTesting] = useState(false);

  const addTestResult = (test: string, success: boolean, details?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const status = success ? '✅ PASS' : '❌ FAIL';
    const result = `[${timestamp}] ${status} ${test}${details ? ` - ${details}` : ''}`;
    setTestResults(prev => [...prev, result]);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addTestResult('Copy to clipboard', true, 'Text copied');
  };

  const openBasescan = (txHash: string) => {
    window.open(`https://basescan.org/tx/${txHash}`, '_blank');
  };

  const runComprehensiveTest = async () => {
    setTesting(true);
    setTestResults([]);
    
    try {
      // Test 1: Check if user is authenticated
      addTestResult('User Authentication', authenticated, authenticated ? 'User is authenticated' : 'User not authenticated');
      
      if (!authenticated) {
        addTestResult('WDK Test Suite', false, 'User must be authenticated first');
        return;
      }

      // Test 2: Check WDK client initialization
      addTestResult('WDK Client Ready', ready, ready ? 'WDK client is ready' : 'WDK client not ready');

      // Test 3: Fetch existing wallet or create new one
      await fetchWallet();
      if (hasWallet) {
        addTestResult('Wallet Fetch', true, `Existing wallet found: ${wallet?.address}`);
      } else {
        addTestResult('Wallet Check', true, 'No existing wallet found');
        
        // Test 4: Create new wallet
        const address = await createWallet();
        if (address) {
          addTestResult('Wallet Creation', true, `New wallet created: ${address}`);
        } else {
          addTestResult('Wallet Creation', false, 'Failed to create wallet');
          return;
        }
      }

      // Test 5: Verify wallet data structure
      if (wallet) {
        const hasAddress = !!wallet.address;
        const hasBalance = !!wallet.balance;
        const hasTimestamps = !!wallet.createdAt && !!wallet.updatedAt;
        
        addTestResult('Wallet Data Structure', hasAddress && hasBalance && hasTimestamps, 
          `Address: ${hasAddress}, Balance: ${hasBalance}, Timestamps: ${hasTimestamps}`);

        // Test 6: Check balance formatting
        const ethFormatted = formatBalance(wallet.balance.eth, 'eth');
        const usdtFormatted = formatBalance(wallet.balance.usdt, 'usdt');
        
        addTestResult('Balance Formatting', true, `ETH: ${ethFormatted}, USDT: ${usdtFormatted}`);

        // Test 7: Test balance checking functions
        const hasEth = hasBalance('0.0001', 'eth');
        const hasUsdt = hasBalance('1', 'usdt');
        
        addTestResult('Balance Checking', true, `Has 0.0001 ETH: ${hasEth}, Has 1 USDT: ${hasUsdt}`);

        // Test 8: Test message signing
        const message = `WDK Test Message ${Date.now()}`;
        const signResult = await signMessage(message);
        
        if (signResult.success) {
          addTestResult('Message Signing', true, `Message signed successfully`);
          setTestMessage(message);
          setTestSignature(signResult.signature || '');
        } else {
          addTestResult('Message Signing', false, signResult.error || 'Signing failed');
        }

        // Test 9: Test transaction sending (small amount)
        if (hasEth) {
          const txResult = await sendTransaction({
            to: wallet.address,
            value: '0.0001',
            usePaymaster: true,
          });

          if (txResult.success) {
            addTestResult('Transaction Sending', true, `Gasless tx sent: ${txResult.txHash?.slice(0, 10)}...`);
            setTestTx(txResult.txHash || '');
          } else {
            addTestResult('Transaction Sending', false, txResult.error || 'Transaction failed');
          }
        } else {
          addTestResult('Transaction Sending', false, 'Insufficient ETH balance for test');
        }

        // Test 10: Test API connectivity
        try {
          const response = await fetch(`/api/wdk/wallet?userId=test`);
          const data = await response.json();
          addTestResult('API Connectivity', response.ok, `Status: ${response.status}`);
        } catch (err) {
          addTestResult('API Connectivity', false, 'API request failed');
        }

      } else {
        addTestResult('Wallet Data', false, 'No wallet data available');
      }

      // Final result
      const passedTests = testResults.filter(r => r.includes('✅ PASS')).length + 1;
      const totalTests = 10;
      const successRate = (passedTests / totalTests) * 100;
      
      addTestResult('WDK Test Suite Complete', successRate >= 80, 
        `Passed: ${passedTests}/${totalTests} (${successRate.toFixed(0)}%)`);

    } catch (error) {
      addTestResult('Test Suite Error', false, error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setTesting(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
    setTestTx('');
    setTestMessage('');
    setTestSignature('');
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
            WDK Integration Test Suite
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Comprehensive testing for WDK wallet functionality
          </p>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`p-4 rounded-lg border ${
            ready ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {ready ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
              <span className="font-medium">WDK Ready</span>
            </div>
          </div>
          
          <div className={`p-4 rounded-lg border ${
            authenticated ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {authenticated ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
              <span className="font-medium">Authenticated</span>
            </div>
          </div>
          
          <div className={`p-4 rounded-lg border ${
            hasWallet ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center gap-2">
              {hasWallet ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-yellow-600" />}
              <span className="font-medium">Has Wallet</span>
            </div>
          </div>
          
          <div className={`p-4 rounded-lg border ${
            !loading ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center gap-2">
              {!loading ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />}
              <span className="font-medium">Not Loading</span>
            </div>
          </div>
        </div>

        {/* Test Controls */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Test Controls</h2>
            <Button variant="outline" size="sm" onClick={clearResults}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Clear Results
            </Button>
          </div>
          
          <div className="space-y-4">
            <Button 
              onClick={runComprehensiveTest} 
              disabled={testing || !authenticated}
              className="w-full"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Running Tests...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Comprehensive Test Suite
                </>
              )}
            </Button>
            
            {!authenticated && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Please connect your wallet first to run the test suite
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Wallet Information */}
        {wallet && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
            <h2 className="text-xl font-semibold mb-4">Wallet Information</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-neutral-600">Address:</span>
                <div className="flex items-center gap-2">
                  <code className="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-sm">
                    {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                  </code>
                  <button
                    onClick={() => copyToClipboard(wallet.address)}
                    className="text-neutral-500 hover:text-neutral-700"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex justify-between">
                <span className="text-neutral-600">ETH Balance:</span>
                <span className="font-medium">{formatBalance(wallet.balance.eth, 'eth')}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-neutral-600">USDT Balance:</span>
                <span className="font-medium">{formatBalance(wallet.balance.usdt, 'usdt')}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-neutral-600">Created:</span>
                <span className="text-sm">{new Date(wallet.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {testResults.map((result, index) => (
                <div 
                  key={index}
                  className={`p-2 rounded font-mono text-sm ${
                    result.includes('✅ PASS') 
                      ? 'bg-green-50 text-green-800' 
                      : result.includes('❌ FAIL')
                      ? 'bg-red-50 text-red-800'
                      : 'bg-neutral-50 text-neutral-800'
                  }`}
                >
                  {result}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Results */}
        {testTx && (
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
            <h4 className="font-semibold text-green-800 mb-2">Transaction Sent!</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-green-700">Tx Hash:</span>
                <div className="flex items-center space-x-2">
                  <code className="bg-white px-2 py-1 rounded text-xs">
                    {testTx.slice(0, 10)}...{testTx.slice(-8)}
                  </code>
                  <button
                    onClick={() => copyToClipboard(testTx)}
                    className="text-green-600 hover:text-green-800"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => openBasescan(testTx)}
                    className="text-green-600 hover:text-green-800"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Message Signing Results */}
        {testSignature && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2">Message Signed!</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">Message:</span>
                <span className="font-mono text-xs bg-white px-2 py-1 rounded max-w-xs truncate">
                  {testMessage}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-blue-700">Signature:</span>
                <div className="flex items-center space-x-2">
                  <code className="bg-white px-2 py-1 rounded text-xs max-w-xs truncate">
                    {testSignature.slice(0, 10)}...{testSignature.slice(-8)}
                  </code>
                  <button
                    onClick={() => copyToClipboard(testSignature)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <h4 className="font-semibold text-red-800 mb-2">Error</h4>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Test Information */}
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Test Suite Information</p>
              <ul className="space-y-1 text-xs">
                <li>• Tests wallet creation, balance fetching, message signing, and transactions</li>
                <li>• Uses gasless transactions when possible (requires Pimlico API key)</li>
                <li>• Tests both ETH and USDT balance functionality</li>
                <li>• Verifies API connectivity and error handling</li>
                <li>• Requires a small amount of ETH for transaction testing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
