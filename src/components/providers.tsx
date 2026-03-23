'use client';

import { PureWDKProvider } from '@/components/pure-wdk-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PureWDKProvider>
      {children}
    </PureWDKProvider>
  );
}
