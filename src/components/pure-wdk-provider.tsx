'use client';

import { ReactNode } from 'react';

export function PureWDKProvider({ children }: { children: ReactNode }) {
  // Pure WDK doesn't need a provider like Privy
  // It's a direct implementation using Viem and our own wallet management
  return <>{children}</>;
}
