# WDK Wallet Setup Guide

This guide will help you set up WDK (Wallet Development Kit) with EVM wallets and gasless transactions for your Nest application.

## 🚀 Quick Start

### 1. Environment Configuration

Copy the example environment file and configure your API keys:

```bash
cp env.example .env.local
```

Edit `.env.local` with your actual values:

```bash
# Required: Base RPC URL
BASE_RPC_URL=https://mainnet.base.org

# Optional but Recommended: Paymaster & Bundler for gasless transactions
PAYMASTER_URL=https://api.pimlico.io/v2/base/rpc?apikey=YOUR_PIMLICO_KEY
BUNDLER_URL=https://api.pimlico.io/v2/base/rpc?apikey=YOUR_PIMLICO_KEY

# Critical: Wallet Encryption Key
WALLET_ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### 2. Get API Keys

#### Pimlico (Recommended for Gasless Transactions)

1. Sign up at [Pimlico Dashboard](https://dashboard.pimlico.io/)
2. Create API Key → Name it "Nest Production"
3. Copy your API key to `.env.local`

#### Alternative Options

- **Alchemy**: [dashboard.alchemy.com](https://dashboard.alchemy.com/)
- **Infura**: [infura.io](https://infura.io/)
- **Stackup**: [app.stackup.sh](https://app.stackup.sh/)

### 3. Generate Encryption Key

For development, generate a random key:

```bash
openssl rand -hex 32
```

⚠️ **For production**, use AWS KMS, Azure Key Vault, or Google Cloud KMS.

### 4. Database Setup

Run the updated schema to add WDK wallet support:

```sql
-- Add the WDK wallets table
CREATE TABLE wdk_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL UNIQUE,
  public_key TEXT,
  encrypted_data TEXT NOT NULL,
  wallet_type TEXT DEFAULT 'evm',
  network TEXT DEFAULT 'base',
  account_abstraction BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_wdk_wallets_user_id ON wdk_wallets(user_id);
CREATE INDEX idx_wdk_wallets_address ON wdk_wallets(address);
```

## 🛠️ Integration

### Using the React Hook

```tsx
import { useWDKWallet } from '@/hooks/useWDKWallet';

function MyComponent() {
  const {
    wallet,
    loading,
    createWallet,
    sendTransaction,
    hasBalance,
    formatBalance,
  } = useWDKWallet();

  const handleCreateWallet = async () => {
    const address = await createWallet();
    console.log('Wallet created:', address);
  };

  const handleSendTx = async () => {
    const result = await sendTransaction({
      to: '0x...',
      value: '0.001',
      usePaymaster: true,
    });
  };

  return (
    <div>
      {wallet ? (
        <div>
          <p>Address: {wallet.address}</p>
          <p>Balance: {formatBalance(wallet.balance.eth, 'eth')}</p>
          <button onClick={handleSendTx}>Send Transaction</button>
        </div>
      ) : (
        <button onClick={handleCreateWallet}>Create Wallet</button>
      )}
    </div>
  );
}
```

### Direct API Usage

```typescript
// Create wallet
const response = await fetch('/api/wdk/wallet', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user123' }),
});

const { address, publicKey } = await response.json();

// Send transaction
const txResult = await fetch('/api/wdk/wallet/sign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    to: '0x...',
    value: '0.001',
    usePaymaster: true,
  }),
});
```

## 🧪 Testing

Use the built-in test component to verify your setup:

```tsx
import { WDKWalletTest } from '@/components/WDKWalletTest';

function TestPage() {
  return <WDKWalletTest />;
}
```

Add this to your page to test:
- Wallet creation
- Transaction sending (with gasless support)
- Message signing
- Balance checking

## 🔧 Features

### ✅ What's Included

- **EVM Wallet Support**: Full Base network integration
- **Account Abstraction**: ERC-4337 support for smart wallets
- **Gasless Transactions**: Pimlico paymaster integration
- **Secure Storage**: Encrypted private keys and mnemonics
- **TypeScript Support**: Full type safety
- **React Hooks**: Easy integration with React components
- **API Endpoints**: RESTful wallet management

### 🔄 Gasless Transactions

When `usePaymaster: true`, transactions are sponsored:
- Users pay fees in USDC instead of ETH
- No need for users to hold ETH for gas
- Better user experience for DeFi interactions

### 🔒 Security Features

- **Encryption**: Private keys encrypted with AES-256-GCM
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Secure Storage**: Only encrypted data in database
- **Production Ready**: KMS integration for enterprise security

## 📊 Costs

| Service | Free Tier | Paid |
|---------|-----------|------|
| Base RPC | Free | - |
| Pimlico | 100 UserOps/month | $49/month |
| Alchemy | 300M compute units | $49/month |

**Total for small apps**: $0-10/month (free tier)
**Total for production**: ~$100/month

## 🚨 Important Notes

1. **Never commit `.env.local`** to version control
2. **Use production KMS** for real applications
3. **Test on Base testnet** first
4. **Monitor gas costs** when not using paymaster
5. **Backup encryption keys** securely

## 🐛 Troubleshooting

### Common Issues

1. **"WALLET_ENCRYPTION_KEY is required"**
   - Make sure `.env.local` has a valid 64-character hex key

2. **"Wallet already exists"**
   - Each user can only have one wallet
   - Check if wallet was already created

3. **"Paymaster transaction failed"**
   - Check Pimlico API key
   - Verify user has USDC for paymaster fees
   - Fall back to regular ETH transactions

4. **"Invalid address format"**
   - Ensure addresses are 0x-prefixed 42-character hex strings

### Debug Mode

Enable debug logging:

```bash
DEBUG=wdk:* npm run dev
```

## 📚 Resources

- [WDK Documentation](https://docs.wdk.tether.io/)
- [Pimlico Docs](https://docs.pimlico.io/)
- [Base Network](https://docs.base.org/)
- [ERC-4337 Spec](https://eips.ethereum.org/EIPS/eip-4337)

## 🤝 Support

If you encounter issues:

1. Check the console for error messages
2. Verify environment variables
3. Test with the WDKWalletTest component
4. Check API key quotas and limits

---

Your WDK wallet integration is now ready! 🎉
