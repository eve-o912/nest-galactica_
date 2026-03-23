'use client';

import { Button } from '@/components/ui';
import { Wallet, Loader2, Shield } from 'lucide-react';
import { usePureWDKWallet } from '@/hooks/usePureWDKWallet';

export function PureWDKLoginButton() {
  const { 
    ready, 
    authenticated, 
    login, 
    logout, 
    user, 
    loading, 
    error,
    createWallet,
    wallet 
  } = usePureWDKWallet();

  if (!ready) {
    return (
      <Button disabled className="w-full">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Initializing...
      </Button>
    );
  }

  if (loading) {
    return (
      <Button disabled className="w-full">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {authenticated ? 'Processing...' : 'Creating Wallet...'}
      </Button>
    );
  }

  if (authenticated && wallet) {
    return (
      <div className="space-y-2">
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <Shield className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">Pure WDK Wallet</span>
          </div>
          <div className="text-xs text-gray-600">
            <div>Address: {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</div>
            <div>Chain: {wallet.chain}</div>
            <div>User ID: {user?.id?.slice(0, 8)}...</div>
          </div>
        </div>
        <Button 
          onClick={logout} 
          variant="outline" 
          className="w-full"
        >
          Logout
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button 
        onClick={login} 
        className="w-full"
        disabled={loading}
      >
        <Wallet className="mr-2 h-4 w-4" />
        Create Pure WDK Wallet
      </Button>
      
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      
      <div className="text-xs text-gray-500 space-y-1">
        <p>• No third-party dependencies</p>
        <p>• Direct blockchain access</p>
        <p>• Multi-chain support</p>
        <p>• Full wallet control</p>
      </div>
    </div>
  );
}
