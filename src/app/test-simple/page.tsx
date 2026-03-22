'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';

export default function SimpleTestPage() {
  const [testResults, setTestResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (test: string, status: 'PASS' | 'FAIL' | 'INFO', details: string) => {
    setTestResults(prev => [...prev, {
      test,
      status,
      details,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const runBasicTests = async () => {
    setLoading(true);
    setTestResults([]);
    
    // Test 1: Check if we're in browser
    addResult('Browser Environment', 'INFO', typeof window !== 'undefined' ? 'Running in browser' : 'Not in browser');

    // Test 2: Check Next.js environment
    addResult('Next.js Runtime', 'INFO', 'Client-side rendering active');

    // Test 3: Test API connectivity
    try {
      const response = await fetch('/api/test-wdk');
      const data = await response.json();
      
      if (data.overall === 'PASS') {
        addResult('WDK API Tests', 'PASS', `All ${data.summary.total} tests passed`);
      } else {
        addResult('WDK API Tests', 'FAIL', `${data.summary.failed} of ${data.summary.total} tests failed`);
      }
      
      // Add individual test results
      data.tests.forEach((test: any) => {
        addResult(`API: ${test.name}`, test.status === 'PASS' ? 'PASS' : 'FAIL', test.details);
      });
    } catch (error) {
      addResult('WDK API Tests', 'FAIL', error instanceof Error ? error.message : 'API call failed');
    }

    // Test 4: Test balances API
    try {
      const response = await fetch('/api/balances?wallet=0x0000000000000000000000000000000000000000');
      const data = await response.json();
      
      if (response.ok) {
        addResult('Balances API', 'PASS', 'API endpoint reachable');
      } else {
        addResult('Balances API', 'FAIL', `API returned ${response.status}`);
      }
    } catch (error) {
      addResult('Balances API', 'FAIL', error instanceof Error ? error.message : 'API call failed');
    }

    // Test 5: Test goals API
    try {
      const response = await fetch('/api/goals?userId=test');
      const data = await response.json();
      
      if (response.ok) {
        addResult('Goals API', 'PASS', 'API endpoint reachable');
      } else {
        addResult('Goals API', 'FAIL', `API returned ${response.status}`);
      }
    } catch (error) {
      addResult('Goals API', 'FAIL', error instanceof Error ? error.message : 'API call failed');
    }

    // Test 6: Check environment variables (client-side)
    const hasEnvVars = typeof process !== 'undefined' && process.env;
    addResult('Environment Check', 'INFO', hasEnvVars ? 'Process env available' : 'Process env not available');

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
            Simple WDK Test
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Basic connectivity and functionality tests
          </p>
        </div>

        {/* Test Controls */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
          <Button 
            onClick={runBasicTests} 
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Running Tests...
              </>
            ) : (
              'Run Basic Tests'
            )}
          </Button>
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            <div className="space-y-2">
              {testResults.map((result, index) => (
                <div 
                  key={index}
                  className={`p-3 rounded-lg border ${
                    result.status === 'PASS' 
                      ? 'bg-green-50 border-green-200 text-green-800' 
                      : result.status === 'FAIL'
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {result.status === 'PASS' && <CheckCircle className="w-4 h-4 mt-0.5" />}
                    {result.status === 'FAIL' && <XCircle className="w-4 h-4 mt-0.5" />}
                    {result.status === 'INFO' && <AlertTriangle className="w-4 h-4 mt-0.5" />}
                    <div className="flex-1">
                      <div className="font-medium">{result.test}</div>
                      <div className="text-sm opacity-80">{result.details}</div>
                      <div className="text-xs opacity-60 mt-1">{result.timestamp}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">Test Instructions</h3>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Click "Run Basic Tests" to check system functionality</li>
            <li>Tests will verify API endpoints and basic connectivity</li>
            <li>For full WDK testing, visit <code>/test-wdk</code> (requires wallet connection)</li>
            <li>Make sure your environment variables are configured in <code>.env.local</code></li>
          </ol>
        </div>
      </div>
    </div>
  );
}
