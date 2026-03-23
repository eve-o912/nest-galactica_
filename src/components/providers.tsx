'use client';

import { PureWDKProvider } from '@/components/pure-wdk-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PureWDKProvider>
            },
          },
          blockExplorers: {
            default: {
              name: 'Basescan',
              url: 'https://basescan.org',
            },
          },
        },
        supportedChains: [
          {
            id: 8453,
            name: 'Base',
            nativeCurrency: {
              name: 'Ethereum',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: {
              default: {
                http: ['https://mainnet.base.org'],
              },
            },
            blockExplorers: {
              default: {
                name: 'Basescan',
                url: 'https://basescan.org',
              },
            },
          },
        ],
        loginMethods: ['email', 'wallet', 'google', 'twitter', 'discord'],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
