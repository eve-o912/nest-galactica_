import { withSecurity } from '@/lib/validation'
import { logger } from '@/lib/retry'
import { createPublicClient, http, parseAbi, formatEther } from 'viem'
import { base } from 'viem/chains'

const USDT_ADDRESS = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
const YOUSD_VAULT = '0x0000000f926268be77Ab7e1d17E4e4C7D4b28a65'
const VAULT_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
])

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
})

export const GET = withSecurity(async (req: Request) => {
  const { searchParams } = new URL(req.url)
  const wallet = searchParams.get('wallet')
  
  if (!wallet) {
    return Response.json({ error: 'wallet address required' }, { status: 400 })
  }
  
  try {
    // Fetch all balances in parallel
    const [vaultShares, vaultDecimals, usdtBalance, usdtDecimals, ethBalance] = await Promise.all([
      client.readContract({
        address: YOUSD_VAULT,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: [wallet as `0x${string}`],
      }).catch(() => BigInt(0)),
      client.readContract({
        address: YOUSD_VAULT,
        abi: parseAbi(['function decimals() view returns (uint8)']),
        functionName: 'decimals',
      }).catch(() => 6),
      client.readContract({
        address: USDT_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [wallet as `0x${string}`],
      }).catch(() => 0n),
      client.readContract({
        address: USDT_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }).catch(() => 6),
      client.getBalance({ address: wallet as `0x${string}` }).catch(() => 0n),
    ])

    // Convert vault shares to assets (USDC value)
    const vaultAssets = await client.readContract({
      address: YOUSD_VAULT,
      abi: VAULT_ABI,
      functionName: 'convertToAssets',
      args: [vaultShares],
    }).catch(() => vaultShares) // fallback to shares if convert fails

    const result = {
      vault: Number(vaultAssets) / Math.pow(10, vaultDecimals),
      walletUSDT: Number(usdtBalance) / Math.pow(10, usdtDecimals),
      eth: formatEther(ethBalance),
    }
    
    logger.info('Fetched balances', { wallet, vault: result.vault, usdt: result.walletUSDT, eth: result.eth })
    return Response.json(result)
  } catch (err: any) {
    logger.error('Failed to fetch balances', err, { wallet })
    return Response.json({ 
      error: err.message || 'Failed to fetch balances',
      vault: 0,
      walletUSDT: 0,
      eth: '0',
    }, { status: 500 })
  }
})
