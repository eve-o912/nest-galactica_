import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
} from 'viem'
import { base } from 'viem/chains'
import { PrivyClient } from '@privy-io/server-auth'
import { withRetry, withCircuitBreaker, withTimeout, logger, RetryableError } from './retry'
import { withTransaction, query, queryOne, closePool } from './db'
import { validateWalletAddress, validateAmount, ValidationError } from './validation'

const YOUSD_VAULT  = '0x0000000f926268be77Ab7e1d17E4e4C7D4b28a65'
const YOGATEWAY    = '0xF1EeE0957267b1A474323Ff9CfF7719E964969FA'
const USDT_ADDRESS = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
const USDT_DECIMALS = 6

const ERC20_ABI = [
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToAssets', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToShares', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'previewWithdraw', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'previewRedeem', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const VAULT_ABI = [
  {
    name: 'deposit', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'withdraw', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'redeem', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'shares', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToAssets', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToShares', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
})

const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
)


export interface AgentRules {
  userId: string
  walletAddress: string
  autopilot: boolean
  scheduledDay: string
  scheduledAmount: number
  monthlyBudget: number
  spentThisMonth: number
  streakProtection: boolean
  idleSweepDays: number
  enabled: boolean
}

export interface ToolResult {
  success: boolean
  tx_hash?: string
  basescan_url?: string
  amount_usdt?: number
  slippage_bps?: number
  error?: string
  notified?: boolean
  skipped?: boolean
  skip_reason?: string
}

// ─── Live blockchain reads ─────────────────────────────

export async function getLiveUSDTBalance(address: string): Promise<number> {
  try {
    if (!address || address === 'undefined' || address.length < 10) {
      throw new Error(`Invalid address provided: "${address}"`)
    }

    const validatedAddress = validateWalletAddress(address)
    const raw = await withRetry(
      () => publicClient.readContract({
        address: USDT_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [validatedAddress as `0x${string}`],
      }),
      { maxAttempts: 3, delayMs: 1000 }
    )
    return Number(formatUnits(raw, USDT_DECIMALS))
  } catch (err: any) {
    // Log the FULL error details
    logger.error('Failed to get USDT balance', err, { 
      address,
      rpcUrl: process.env.BASE_RPC_URL,
      errorMessage: err?.message,
      errorCause: err?.cause?.message,
      errorDetails: JSON.stringify(err, null, 2)
    })
    throw new Error(`USDT balance read failed: ${err?.message} | cause: ${err?.cause?.message}`)
  }
}

export async function getLiveVaultBalance(address: string): Promise<number> {
  try {
    const validatedAddress = validateWalletAddress(address)
    const [sharesRaw, assetsRaw] = await withRetry(
      async () => {
        const shares = await publicClient.readContract({
          address: YOUSD_VAULT as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [validatedAddress as `0x${string}`],
        })
        const assets = await publicClient.readContract({
          address: YOUSD_VAULT as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'convertToAssets',
          args: [shares],
        })
        return [shares, assets]
      },
      { maxAttempts: 3, delayMs: 1000 }
    )
    return Number(formatUnits(assetsRaw, USDT_DECIMALS))
  } catch (err) {
    logger.error('Failed to get vault balance', err, { address })
    throw new RetryableError('Failed to read vault balance')
  }
}

// ─── YO API Reads (no key needed) ──────────────────────

export async function getUserYieldEarned(walletAddress: string): Promise<number> {
  return withCircuitBreaker(
    'yo-api-yield',
    async () => {
      const validatedAddress = validateWalletAddress(walletAddress)
      const res = await withTimeout(
        fetch(`https://api.yo.xyz/api/v1/performance/user/base/${YOUSD_VAULT}/${validatedAddress}`),
        10000,
        'YO API yield fetch'
      )
      if (!res.ok) throw new Error(`YO API returned ${res.status}`)
      const data = await res.json()
      return Number(data?.data?.yieldEarned?.formatted ?? 0)
    },
    { failureThreshold: 5, resetTimeoutMs: 60000 }
  )
}

export async function getUserDepositHistory(walletAddress: string) {
  return withCircuitBreaker(
    'yo-api-history',
    async () => {
      const validatedAddress = validateWalletAddress(walletAddress)
      const res = await withTimeout(
        fetch(`https://api.yo.xyz/api/v1/history/user/base/${YOUSD_VAULT}/${validatedAddress}?limit=10`),
        10000,
        'YO API history fetch'
      )
      if (!res.ok) throw new Error(`YO API returned ${res.status}`)
      const data = await res.json()
      return data?.data ?? []
    },
    { failureThreshold: 5, resetTimeoutMs: 60000 }
  )
}

export async function getLiveAPY(): Promise<number> {
  return withCircuitBreaker(
    'yo-api-apy',
    async () => {
      const res = await withTimeout(
        fetch(`https://api.yo.xyz/api/v1/vault/base/${YOUSD_VAULT}/snapshot`),
        10000,
        'YO API APY fetch'
      )
      if (!res.ok) throw new Error(`YO API returned ${res.status}`)
      const data = await res.json()
      return Number(data?.data?.apy?.current ?? 0)
    },
    { failureThreshold: 5, resetTimeoutMs: 60000 }
  )
}

export async function getDaysSinceLastDeposit(userId: string): Promise<number> {
  try {
    const validatedId = userId.replace(/[^a-zA-Z0-9_-]/g, '')
    const row = await queryOne<{ executed_at: string }>(
      `SELECT executed_at FROM agent_logs
       WHERE user_id = $1
       AND tool_name IN ('deposit_to_goal','sweep_idle_usdt','protect_streak')
       AND (result->>'success')::boolean = true
       ORDER BY executed_at DESC LIMIT 1`,
      [validatedId]
    )
    if (!row) return 999
    return Math.floor((Date.now() - new Date(row.executed_at).getTime()) / 86400000)
  } catch (err) {
    logger.error('Failed to get days since last deposit', err, { userId })
    return 999
  }
}

export async function hasDepositedThisWeek(userId: string): Promise<boolean> {
  try {
    const validatedId = userId.replace(/[^a-zA-Z0-9_-]/g, '')
    const monday = new Date()
    monday.setDate(monday.getDate() - monday.getDay() + 1)
    monday.setHours(0, 0, 0, 0)
    
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM agent_logs
       WHERE user_id = $1
       AND tool_name IN ('deposit_to_goal','sweep_idle_usdt','protect_streak')
       AND (result->>'success')::boolean = true
       AND executed_at >= $2
       LIMIT 1`,
      [validatedId, monday.toISOString()]
    )
    return !!row
  } catch (err) {
    logger.error('Failed to check weekly deposit', err, { userId })
    return false
  }
}

// ─── Real deposit via ERC-4626 vault + Privy wallet ─────

function buildApproveTx(amountRaw: bigint) {
  const approveSelector = '0x095ea7b3'
  const spender = YOUSD_VAULT.slice(2).padStart(64, '0')
  const amount = amountRaw.toString(16).padStart(64, '0')
  return {
    to: USDT_ADDRESS,
    data: `0x${approveSelector}${spender}${amount}`,
  }
}

function buildDepositTx(amountRaw: bigint, receiver: string) {
  const depositSelector = '0x6e553f65'
  const assets = amountRaw.toString(16).padStart(64, '0')
  const addr = receiver.slice(2).padStart(64, '0')
  return {
    to: YOUSD_VAULT,
    data: `0x${depositSelector}${assets}${addr}`,
  }
}

async function executeRealDeposit(
  userId: string,
  walletAddress: string,
  amountUSDT: number
): Promise<{ success: boolean; txHash?: string; error?: string; slippageBps?: number }> {
  const startTime = Date.now()
  
  try {
    const validatedWallet = validateWalletAddress(walletAddress)
    const validatedAmount = validateAmount(amountUSDT, 0.01, 100000)
    const validatedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '')
    
    logger.info('Starting deposit execution', { 
      userId: validatedUserId, 
      wallet: validatedWallet, 
      amount: validatedAmount 
    })
    
    const amountRaw = parseUnits(validatedAmount.toFixed(6), USDT_DECIMALS)

    // Check USDT allowance
    const allowance = await withRetry(
      () => publicClient.readContract({
        address: USDT_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [validatedWallet as `0x${string}`, YOUSD_VAULT as `0x${string}`],
      }),
      { maxAttempts: 3, delayMs: 1000 }
    )

    const privyBase = `https://auth.privy.io/api/v1/apps/${process.env.PRIVY_APP_ID}`
    const authHeader = `Basic ${Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64')}`

    // Send approve if needed
    if (allowance < amountRaw) {
      logger.info('Sending approve transaction', { wallet: validatedWallet })
      const approveTx = buildApproveTx(amountRaw)
      
      const approveRes = await withTimeout(
        fetch(`${privyBase}/wallets/${validatedWallet}/rpc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            'privy-app-id': process.env.PRIVY_APP_ID!,
          },
          body: JSON.stringify({
            method: 'eth_sendTransaction',
            caip2: 'eip155:8453',
            params: {
              transaction: {
                to: approveTx.to,
                data: approveTx.data,
                value: '0x0',
                chainId: '0x2105',
              },
            },
          }),
        }),
        30000,
        'Privy approve transaction'
      )

      if (!approveRes.ok) {
        const err = await approveRes.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(`Approve failed: ${err.message || approveRes.statusText}`)
      }
      
      const { data: approveData } = await approveRes.json()
      await withTimeout(
        publicClient.waitForTransactionReceipt({
          hash: approveData.hash,
          timeout: 60_000,
        }),
        65000,
        'Approve confirmation'
      )
      
      logger.info('Approve transaction confirmed', { txHash: approveData.hash })
    }

    // Send deposit to vault
    logger.info('Sending deposit transaction', { wallet: validatedWallet })
    const depositTx = buildDepositTx(amountRaw, validatedWallet)
    
    const depositRes = await withTimeout(
      fetch(`${privyBase}/wallets/${validatedWallet}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'privy-app-id': process.env.PRIVY_APP_ID!,
        },
        body: JSON.stringify({
          method: 'eth_sendTransaction',
          caip2: 'eip155:8453',
          params: {
            transaction: {
              to: depositTx.to,
              data: depositTx.data,
              value: '0x0',
              chainId: '0x2105',
            },
          },
        }),
      }),
      30000,
      'Privy deposit transaction'
    )

    if (!depositRes.ok) {
      const err = await depositRes.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(`Deposit failed: ${err.message || depositRes.statusText}`)
    }

    const { data } = await depositRes.json()
    const txHash = data.hash

    // Wait for confirmation
    logger.info('Waiting for deposit confirmation', { txHash })
    const receipt = await withTimeout(
      publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      }),
      65000,
      'Deposit confirmation'
    )

    if (receipt.status !== 'success') {
      throw new Error(`Transaction reverted: ${txHash}`)
    }

    const duration = Date.now() - startTime
    logger.info('Deposit completed successfully', { txHash, duration })

    return { success: true, txHash, slippageBps: 50 }
  } catch (err: any) {
    const duration = Date.now() - startTime
    logger.error('Deposit failed', err, { userId, walletAddress, amountUSDC, duration })
    return { 
      success: false, 
      error: err instanceof ValidationError ? err.message : `Transaction failed: ${err.message}` 
    }
  }
}

// ─── Real withdrawal via ERC-4626 vault + Privy wallet ─────

function buildWithdrawTx(amountRaw: bigint, receiver: string, owner: string) {
  const withdrawSelector = '0xb460af94'
  const assets = amountRaw.toString(16).padStart(64, '0')
  const recv = receiver.slice(2).padStart(64, '0')
  const own = owner.slice(2).padStart(64, '0')
  return {
    to: YOUSD_VAULT,
    data: `0x${withdrawSelector}${assets}${recv}${own}`,
  }
}

export async function getEthBalance(address: string): Promise<string> {
  try {
    const validatedAddress = validateWalletAddress(address)
    const balance = await publicClient.getBalance({
      address: validatedAddress as `0x${string}`,
    })
    return formatUnits(balance, 18)
  } catch (err) {
    logger.error('Failed to get ETH balance', err, { address })
    return '0'
  }
}

async function executeRealWithdrawal(
  userId: string,
  walletAddress: string,
  amountUSDT: number
): Promise<{ success: boolean; txHash?: string; error?: string; slippageBps?: number }> {
  const startTime = Date.now()
  
  try {
    const validatedWallet = validateWalletAddress(walletAddress)
    const validatedAmount = validateAmount(amountUSDT, 0.01, 100000)
    const validatedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '')
    
    logger.info('Starting withdrawal execution', { 
      userId: validatedUserId, 
      wallet: validatedWallet, 
      amount: validatedAmount 
    })
    
    const amountRaw = parseUnits(validatedAmount.toFixed(6), USDT_DECIMALS)

    // Check vault balance (shares)
    const vaultShares = await withRetry(
      () => publicClient.readContract({
        address: YOUSD_VAULT as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: [validatedWallet as `0x${string}`],
      }),
      { maxAttempts: 3, delayMs: 1000 }
    )
    
    const vaultAssets = await publicClient.readContract({
      address: YOUSD_VAULT as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'convertToAssets',
      args: [vaultShares],
    })
    
    if (vaultAssets < amountRaw) {
      throw new Error(`Insufficient vault balance. Have ${formatUnits(vaultAssets, USDT_DECIMALS)} USDT, want ${validatedAmount} USDT`)
    }

    const privyBase = `https://auth.privy.io/api/v1/apps/${process.env.PRIVY_APP_ID}`
    const authHeader = `Basic ${Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64')}`

    // Send withdrawal
    logger.info('Sending withdrawal transaction', { wallet: validatedWallet })
    const withdrawTx = buildWithdrawTx(amountRaw, validatedWallet, validatedWallet)
    
    const withdrawRes = await withTimeout(
      fetch(`${privyBase}/wallets/${validatedWallet}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'privy-app-id': process.env.PRIVY_APP_ID!,
        },
        body: JSON.stringify({
          method: 'eth_sendTransaction',
          caip2: 'eip155:8453',
          params: {
            transaction: {
              to: withdrawTx.to,
              data: withdrawTx.data,
              value: '0x0',
              chainId: '0x2105',
            },
          },
        }),
      }),
      30000,
      'Privy withdrawal transaction'
    )

    if (!withdrawRes.ok) {
      const err = await withdrawRes.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(`Withdrawal failed: ${err.message || withdrawRes.statusText}`)
    }

    const { data } = await withdrawRes.json()
    const txHash = data.hash

    // Wait for confirmation
    logger.info('Waiting for withdrawal confirmation', { txHash })
    const receipt = await withTimeout(
      publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      }),
      65000,
      'Withdrawal confirmation'
    )

    if (receipt.status !== 'success') {
      throw new Error(`Transaction reverted: ${txHash}`)
    }

    const duration = Date.now() - startTime
    logger.info('Withdrawal completed successfully', { txHash, duration })

    return { success: true, txHash, slippageBps: 50 }
  } catch (err: any) {
    const duration = Date.now() - startTime
    logger.error('Withdrawal failed', err, { userId, walletAddress, amountUSDC, duration })
    return { 
      success: false, 
      error: err instanceof ValidationError ? err.message : `Transaction failed: ${err.message}` 
    }
  }
}

// ─── Tool executor ────────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  rules: AgentRules
): Promise<ToolResult> {
  const moneyTools = ['deposit_to_goal', 'sweep_idle_usdt', 'protect_streak']

  if (moneyTools.includes(toolName)) {
    // Allow manual deposits even if autopilot is OFF
    if (!rules.autopilot && toolName !== 'deposit_to_goal') {
      return { success: true, skipped: true, skip_reason: 'Autopilot OFF — notify only' }
    }
    const amount = args.amount_usdt ?? 1
    const remaining = rules.monthlyBudget - rules.spentThisMonth
    if (amount > remaining) {
      return { success: false, skipped: true, skip_reason: `Exceeds monthly budget. Remaining: $${remaining.toFixed(2)}` }
    }
    const liveBalance = await getLiveUSDTBalance(rules.walletAddress)
    if (liveBalance < amount) {
      return { success: false, skipped: true, skip_reason: `Insufficient USDT. Have $${liveBalance.toFixed(2)}, need $${amount}` }
    }
  }

  switch (toolName) {
    case 'deposit_to_goal': {
      try {
        const goal_name = args.goal_name || 'General Savings'
        const amount_usdt = validateAmount(args.amount_usdt, 0.01)
        
        const result = await executeRealDeposit(rules.userId, rules.walletAddress, amount_usdt)
        
        if (result.success) {
          // Use transaction for database updates
          await withTransaction(async (trx) => {
            await trx.query(
              `UPDATE agent_rules SET spent_this_month = spent_this_month + $1, updated_at = now() WHERE user_id = $2`,
              [amount_usdt, rules.userId]
            )
            await trx.query(
              `UPDATE goals SET deposited_amount = deposited_amount + $1 WHERE user_id = $2 AND LOWER(name) = LOWER($3)`,
              [amount_usdt, rules.userId, goal_name]
            )
          })
        }
        
        return {
          success: result.success,
          tx_hash: result.txHash,
          basescan_url: result.txHash ? `https://basescan.org/tx/${result.txHash}` : undefined,
          amount_usdt,
          error: result.error,
        }
      } catch (err: any) {
        return {
          success: false,
          error: err instanceof ValidationError ? err.message : `Deposit failed: ${err.message}`,
        }
      }
    }

    case 'sweep_idle_usdt': {
      try {
        const amount_usdt = validateAmount(args.amount_usdt, 0.01)
        
        const goals = await query<{ id: string }>(
          `SELECT * FROM goals WHERE user_id = $1 AND deposited_amount < target_amount ORDER BY priority ASC LIMIT 1`,
          [rules.userId]
        )
        
        if (!goals.length) return { success: false, error: 'No active goals' }
        
        const result = await executeRealDeposit(rules.userId, rules.walletAddress, amount_usdt)
        
        if (result.success) {
          await withTransaction(async (trx) => {
            await trx.query(
              `UPDATE agent_rules SET spent_this_month = spent_this_month + $1, updated_at = now() WHERE user_id = $2`,
              [amount_usdt, rules.userId]
            )
            await trx.query(
              `UPDATE goals SET deposited_amount = deposited_amount + $1 WHERE id = $2`,
              [amount_usdt, goals[0].id]
            )
          })
        }
        
        return {
          success: result.success,
          tx_hash: result.txHash,
          basescan_url: result.txHash ? `https://basescan.org/tx/${result.txHash}` : undefined,
          amount_usdt,
          error: result.error,
        }
      } catch (err: any) {
        return {
          success: false,
          error: err instanceof ValidationError ? err.message : `Sweep failed: ${err.message}`,
        }
      }
    }

    case 'protect_streak': {
      try {
        const AMOUNT = 1.0
        
        const goals = await query<{ id: string }>(
          `SELECT * FROM goals WHERE user_id = $1 AND LOWER(name) NOT LIKE '%emergency%' AND deposited_amount < target_amount ORDER BY priority ASC LIMIT 1`,
          [rules.userId]
        )
        
        if (!goals.length) return { success: false, error: 'No eligible goal for streak protection' }
        
        const result = await executeRealDeposit(rules.userId, rules.walletAddress, AMOUNT)
        
        if (result.success) {
          await withTransaction(async (trx) => {
            await trx.query(
              `UPDATE agent_rules SET spent_this_month = spent_this_month + $1, updated_at = now() WHERE user_id = $2`,
              [AMOUNT, rules.userId]
            )
            await trx.query(
              `UPDATE goals SET deposited_amount = deposited_amount + $1 WHERE id = $2`,
              [AMOUNT, goals[0].id]
            )
          })
        }
        
        return {
          success: result.success,
          tx_hash: result.txHash,
          basescan_url: result.txHash ? `https://basescan.org/tx/${result.txHash}` : undefined,
          amount_usdc: AMOUNT,
          error: result.error,
        }
      } catch (err: any) {
        return {
          success: false,
          error: err instanceof ValidationError ? err.message : `Streak protection failed: ${err.message}`,
        }
      }
    }

    case 'send_notification': {
      try {
        const { message, urgency } = args
        await query(
          `INSERT INTO agent_logs (user_id, tool_name, input, result, reason) VALUES ($1, 'notify', $2, $3, $4)`,
          [rules.userId, JSON.stringify(args), JSON.stringify({ notified: true, urgency }), message]
        )
        return { success: true, notified: true }
      } catch (err: any) {
        return { success: false, error: `Notification failed: ${err.message}` }
      }
    }

    case 'withdraw_from_goal': {
      try {
        const goal_name = args.goal_name || 'General Savings'
        const amount_usdt = validateAmount(args.amount_usdt, 0.01)
        
        // Check on-chain vault balance
        const vaultBalance = await getLiveVaultBalance(rules.walletAddress)
        
        if (vaultBalance < amount_usdt) {
          return { 
            success: false, 
            error: `Insufficient vault balance. Deposited: $${vaultBalance.toFixed(2)}, Requested: $${amount_usdt}` 
          }
        }
        
        const result = await executeRealWithdrawal(rules.userId, rules.walletAddress, amount_usdt)
        
        if (result.success) {
          // Use transaction for database updates
          await withTransaction(async (trx) => {
            await trx.query(
              `UPDATE agent_rules SET spent_this_month = GREATEST(0, spent_this_month - $1), updated_at = now() WHERE user_id = $2`,
              [amount_usdt, rules.userId]
            )
            await trx.query(
              `UPDATE goals SET deposited_amount = GREATEST(0, deposited_amount - $1) WHERE user_id = $2 AND LOWER(name) = LOWER($3)`,
              [amount_usdt, rules.userId, goal_name]
            )
          })
        }
        
        return {
          success: result.success,
          tx_hash: result.txHash,
          basescan_url: result.txHash ? `https://basescan.org/tx/${result.txHash}` : undefined,
          amount_usdt,
          slippage_bps: result.slippageBps,
          error: result.error,
        }
      } catch (err: any) {
        return {
          success: false,
          error: err instanceof ValidationError ? err.message : `Withdrawal failed: ${err.message}`,
        }
      }
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` }
  }
}

// Cleanup function for graceful shutdown
export async function cleanup(): Promise<void> {
  logger.info('Cleaning up executor resources...')
  await closePool()
  logger.info('Executor cleanup complete')
}
