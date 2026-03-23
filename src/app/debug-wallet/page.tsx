'use client';

import { useState } from 'react';

export default function DebugWallet() {
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testFetch = async () => {
    if (!userId) {
      alert('Enter a user ID');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/wdk/pure/balance?userId=${userId}&chain=base`);
      const data = await res.json();
      
      setResult({
        status: res.status,
        ok: res.ok,
        data
      });
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const testCreate = async () => {
    if (!userId) {
      alert('Enter a user ID');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/wdk/pure/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, chain: 'base' })
      });
      
      const data = await res.json();
      
      setResult({
        status: res.status,
        ok: res.ok,
        data
      });
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const testTronFetch = async () => {
    if (!userId) {
      alert('Enter a user ID');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/tron/balance?userId=${userId}`);
      const data = await res.json();
      
      setResult({
        status: res.status,
        ok: res.ok,
        data
      });
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const testTronCreate = async () => {
    if (!userId) {
      alert('Enter a user ID');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/tron/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      const data = await res.json();
      
      setResult({
        status: res.status,
        ok: res.ok,
        data
      });
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Wallet Debug Tool</h1>
        
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <label className="block mb-2 font-medium">
            User ID:
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full border border-gray-300 rounded px-4 py-2 mb-4"
            placeholder="Enter user ID (e.g., test-user-123)"
          />
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">EVM Wallet (WDK)</h3>
              <div className="flex gap-2">
                <button
                  onClick={testFetch}
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {loading ? 'Testing...' : 'Test Fetch'}
                </button>
                
                <button
                  onClick={testCreate}
                  disabled={loading}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  {loading ? 'Creating...' : 'Test Create'}
                </button>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold text-green-900 mb-2">TRON Wallet</h3>
              <div className="flex gap-2">
                <button
                  onClick={testTronFetch}
                  disabled={loading}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  {loading ? 'Testing...' : 'Test Fetch'}
                </button>
                
                <button
                  onClick={testTronCreate}
                  disabled={loading}
                  className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 disabled:opacity-50 text-sm"
                >
                  {loading ? 'Creating...' : 'Test Create'}
                </button>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-600">
            <p>• Try with a new user ID to test wallet creation</p>
            <p>• Try with existing user ID to test wallet fetching</p>
            <p>• Check browser console for detailed logs</p>
          </div>
        </div>

        {result && (
          <div className="bg-gray-900 text-green-400 p-6 rounded-lg font-mono text-sm overflow-auto max-h-96">
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}

        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-900 mb-2">Environment Check</h3>
          <div className="text-sm text-yellow-800 space-y-1">
            <p>• Check browser console for detailed error messages</p>
            <p>• Ensure WALLET_ENCRYPTION_KEY is set in .env.local</p>
            <p>• Verify database tables exist (wdk_wallets, tron_wallets)</p>
            <p>• Check network tab in browser dev tools for API failures</p>
          </div>
        </div>
      </div>
    </div>
  );
}
