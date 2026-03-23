import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { Redis } from '@upstash/redis'
import { query } from '@/lib/db'
import {
  getLiveUSDTBalance, getLiveVaultBalance, getLiveAPY,
  getUserYieldEarned, getUserDepositHistory,
  getDaysSinceLastDeposit, hasDepositedThisWeek,
  executeTool, type AgentRules,
} from '@/lib/yo-executor'
import { logger } from '@/lib/retry'

// Lazy initialization to prevent crashes on missing env vars
let genAI: GoogleGenerativeAI | null = null
let redis: Redis | null = null

function getGenAI() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  }
  return genAI
}

function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

const AGENT_TOOLS = [{
  functionDeclarations: [
    {
      name: 'deposit_to_goal',
      description: 'Deposit USDC/USDT into a savings goal via YO Protocol yoUSD vault on Base. Real on-chain transaction.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          goal_name: { type: SchemaType.STRING, description: 'Exact goal name' },
          amount_usdc: { type: SchemaType.NUMBER, description: 'USDC amount (min $1)' },
          token_type: { type: SchemaType.STRING, enum: ['USDC', 'USDT'], description: 'Token type to deposit' },
          reason: { type: SchemaType.STRING, description: 'Plain English reason for user' },
        },
        required: ['goal_name', 'amount_usdc', 'token_type', 'reason'],
      },
    },
    {
      name: 'sweep_idle_usdc',
      description: 'Sweep idle USDC/USDT from wallet into highest priority incomplete goal.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          amount_usdc: { type: SchemaType.NUMBER },
          token_type: { type: SchemaType.STRING, enum: ['USDC', 'USDT'], description: 'Token type to sweep' },
          reason: { type: SchemaType.STRING },
        },
        required: ['amount_usdc', 'token_type', 'reason'],
      },
    },
    {
      name: 'protect_streak',
      description: 'Make $1 deposit to protect weekly streak. Never uses Emergency Fund.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          goal_name: { type: SchemaType.STRING },
          token_type: { type: SchemaType.STRING, enum: ['USDC', 'USDT'], description: 'Token type to use' },
          reason: { type: SchemaType.STRING },
        },
        required: ['goal_name', 'token_type', 'reason'],
      },
    },
    {
      name: 'rebalance_portfolio',
      description: 'Rebalance portfolio between USDC and USDT based on market conditions and user preferences.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          target_usdt_percentage: { type: SchemaType.NUMBER, description: 'Target USDT allocation (0-100)' },
          reason: { type: SchemaType.STRING, description: 'Reason for rebalancing' },
        },
        required: ['target_usdt_percentage', 'reason'],
      },
    },
    {
      name: 'bridge_to_tron',
      description: 'Bridge USDT from Base to TRON network for native Tether operations.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          amount_usdt: { type: SchemaType.NUMBER, description: 'USDT amount to bridge (min $5)' },
          tron_address: { type: SchemaType.STRING, description: 'Target TRON address' },
          reason: { type: SchemaType.STRING, description: 'Reason for bridging' },
        },
        required: ['amount_usdt', 'tron_address', 'reason'],
      },
    },
    {
      name: 'optimize_yield',
      description: 'Move funds between different yield protocols based on APY comparison.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          protocol: { type: SchemaType.STRING, enum: ['YO', 'Aave', 'Compound'], description: 'Target protocol' },
          amount_usdc: { type: SchemaType.NUMBER, description: 'Amount to move' },
          reason: { type: SchemaType.STRING, description: 'Reason for optimization' },
        },
        required: ['protocol', 'amount_usdc', 'reason'],
      },
    },
    {
      name: 'send_notification',
      description: 'Alert user without moving money. Use when autopilot is OFF.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          message: { type: SchemaType.STRING },
          urgency: { type: SchemaType.STRING, enum: ['low', 'medium', 'high'] },
        },
        required: ['message', 'urgency'],
      },
    },
  ],
}]

export async function POST(req: Request) {
  const isCron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` 
  const body = await req.json().catch(() => ({}))

  // Handle client-side deposit recording (MetaMask flow)
  if (body.recordDeposit && body.userId) {
    try {
      const { walletAddress, goalName, amountUsdc, txHash } = body.recordDeposit
      await query(
        `INSERT INTO agent_logs (user_id, tool_name, input, result, reason, tx_hash)
         VALUES ($1, 'deposit_to_goal', $2, $3, $4, $5)`,
        [
          body.userId,
          JSON.stringify({ goal_name: goalName, amount_usdc: amountUsdc }),
          JSON.stringify({ success: true, amount_usdc: amountUsdc, tx_hash: txHash }),
          `Manual deposit of $${amountUsdc} to ${goalName}`,
          txHash,
        ]
      )
      await query(
        `UPDATE goals SET deposited_amount = deposited_amount + $1
         WHERE user_id = $2 AND LOWER(name) = LOWER($3)`,
        [amountUsdc, body.userId, goalName]
      )
      return Response.json({ success: true, tx_hash: txHash })
    } catch (err: any) {
      logger.error('Failed to record deposit', err, { userId: body.userId })
      return Response.json({ error: err.message || 'Failed to record deposit' }, { status: 500 })
    }
  }

  // Handle manual forced actions (e.g., direct deposit from UI)
  if (body.forceAction && body.userId) {
    const rows = await query('SELECT * FROM agent_rules WHERE user_id = $1', [body.userId])
    if (!rows.length) {
      return Response.json({ error: 'User not found. Please setup agent rules first.' }, { status: 404 })
    }
    const dbRules = rows[0]
    const rules: AgentRules = {
      userId: dbRules.user_id,
      walletAddress: dbRules.wallet_address,
      autopilot: dbRules.autopilot,
      scheduledDay: dbRules.scheduled_day,
      scheduledAmount: dbRules.scheduled_amount,
      monthlyBudget: dbRules.monthly_budget,
      spentThisMonth: dbRules.spent_this_month,
      streakProtection: dbRules.streak_protection,
      idleSweepDays: dbRules.idle_sweep_days,
      enabled: dbRules.enabled,
    }
    const { tool, args } = body.forceAction

    try {
      const result = await executeTool(tool, args, rules)

      await query(
        `INSERT INTO agent_logs (user_id, tool_name, input, result, reason, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          rules.userId,
          tool,
          JSON.stringify(args),
          JSON.stringify(result),
          args.reason ?? '',
          result.tx_hash ?? null,
        ]
      )

      return Response.json({
        ran: 1,
        results: [{ userId: rules.userId, actions: [{ tool, args, result }] }],
      })
    } catch (err: any) {
      logger.error('Manual action failed', err, { userId: body.userId, tool: body.forceAction?.tool })
      return Response.json({
        ran: 0,
        results: [{ userId: rules.userId, error: err.message }],
      }, { status: 500 })
    }
  }

  // Cron / manual agent run
  let users: AgentRules[] = []
  if (isCron) {
    if (new Date().getDate() === 1) {
      await query('UPDATE agent_rules SET spent_this_month = 0')
    }
    users = await query('SELECT * FROM agent_rules WHERE enabled = true') as AgentRules[]
  } else if (body.userId) {
    const rows = await query('SELECT * FROM agent_rules WHERE user_id = $1 AND enabled = true', [body.userId])
    users = rows as AgentRules[]
  }

  const results = []

  for (const rules of users) {
    const dedupKey = `agent:${rules.userId}:${new Date().toISOString().split('T')[0]}` 
    const redisInstance = getRedis()
    if (isCron && redisInstance && await redisInstance.get(dedupKey)) {
      results.push({ userId: rules.userId, skipped: 'already ran today' })
      continue
    }

    try {
      const [usdcBalance, vaultBalance, apy, yieldEarned, depositHistory, daysSinceDeposit, depositedThisWeek, goals] =
        await Promise.all([
          getLiveUSDCBalance(rules.walletAddress),
          getLiveVaultBalance(rules.walletAddress),
          getLiveAPY(),
          getUserYieldEarned(rules.walletAddress),
          getUserDepositHistory(rules.walletAddress),
          getDaysSinceLastDeposit(rules.userId),
          hasDepositedThisWeek(rules.userId),
          query('SELECT * FROM goals WHERE user_id = $1 ORDER BY priority ASC', [rules.userId]),
        ])

      const today = new Date()
      const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' })
      const streakAtRisk = !depositedThisWeek && today.getDay() >= 4
      const remaining = rules.monthlyBudget - rules.spentThisMonth

      const agentPrompt = `
You are the Nest savings agent making autonomous decisions right now.
Today is ${dayOfWeek}, ${today.toDateString()}.

LIVE DATA FROM BASE BLOCKCHAIN:
- Wallet USDC: $${usdcBalance.toFixed(2)}
- yoUSD vault value: $${vaultBalance.toFixed(2)}
- Total yield earned: $${yieldEarned.toFixed(2)}
- Current APY: ${apy.toFixed(1)}%

RECENT DEPOSIT HISTORY (last 10):
${JSON.stringify(depositHistory, null, 2)}

AGENT RULES:
- Mode: ${rules.autopilot ? 'AUTOPILOT — execute real transactions' : 'NOTIFY ONLY — no transactions'}
- Scheduled deposit: $${rules.scheduledAmount} every ${rules.scheduledDay}
- Monthly budget: $${rules.monthlyBudget} | Spent: $${rules.spentThisMonth} | Remaining: $${remaining.toFixed(2)}
- Streak protection: ${rules.streakProtection ? 'ON' : 'OFF'}
- Idle sweep after: ${rules.idleSweepDays} days

ACTIVITY:
- Days since last deposit: ${daysSinceDeposit}
- Deposited this week: ${depositedThisWeek}
- Streak at risk: ${streakAtRisk}

GOALS:
${JSON.stringify(goals, null, 2)}

DECISION CHECKLIST:
1. Is today ${rules.scheduledDay} AND remaining budget >= $${rules.scheduledAmount} AND USDC balance sufficient? → deposit_to_goal
2. Has USDC been idle ${rules.idleSweepDays}+ days? → sweep_idle_usdc
3. Streak at risk AND streak_protection ON? → protect_streak ($1, not Emergency Fund)
4. Any goal falling behind deadline? → send_notification

HARD RULES:
- Never exceed $${remaining.toFixed(2)} remaining budget
- Never touch Emergency Fund for streak protection
- If autopilot OFF → only send_notification
- If USDC balance < $1 → do nothing
- Always give plain English reason

Call all applicable tools now.
`

      const genAIInstance = getGenAI()
      if (!genAIInstance) {
        throw new Error('GEMINI_API_KEY not configured')
      }
      const model = genAIInstance.getGenerativeModel({ model: 'gemini-2.0-flash', tools: AGENT_TOOLS })
      const chat = model.startChat()
      let response = await chat.sendMessage(agentPrompt)
      const actions = []

      while (true) {
        const parts = response.candidates?.[0]?.content?.parts ?? []
        const toolCalls = parts.filter((p: any) => p.functionCall)
        if (!toolCalls.length) break

        const toolResults = []
        for (const part of toolCalls as any[]) {
          const { name, args } = part.functionCall
          const result = await executeTool(name, args, rules)

          await query(
            `INSERT INTO agent_logs (user_id, tool_name, input, result, reason, tx_hash)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              rules.userId,
              name,
              JSON.stringify(args),
              JSON.stringify(result),
              args.reason ?? '',
              result.tx_hash ?? null,
            ]
          )
          actions.push({ tool: name, args, result })
          toolResults.push({ functionResponse: { name, response: result } })
        }
        response = await chat.sendMessage(toolResults)
      }

      const redisInstance2 = getRedis()
      if (redisInstance2) {
        await redisInstance2.set(dedupKey, '1', { ex: 90000 })
      }
      results.push({ userId: rules.userId, actions })

    } catch (err: any) {
      logger.error('Agent execution failed', err, { userId: rules.userId })
      await query(
        `INSERT INTO agent_logs (user_id, tool_name, input, result, reason)
         VALUES ($1, 'error', '{}', $2, 'Agent crashed')`,
        [rules.userId, JSON.stringify({ error: err.message })]
      )
      results.push({ userId: rules.userId, error: err.message })
    }
  }

  return Response.json({ ran: results.length, results })
}
