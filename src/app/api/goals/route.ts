import { query } from '@/lib/db'
import { withSecurity } from '@/lib/validation'
import { logger } from '@/lib/retry'

export const GET = withSecurity(async (req: Request) => {
  const { searchParams } = new URL(req.url)
  const userIdParam = searchParams.get('userId')
  
  if (!userIdParam) {
    return Response.json({ error: 'userId required' }, { status: 400 })
  }
  
  try {
    const goals = await query(
      `SELECT id, name, deposited_amount, target_amount 
       FROM goals 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userIdParam]
    )
    
    logger.info('Fetched goals', { userId: userIdParam, count: goals.length })
    return Response.json(goals)
  } catch (err: any) {
    logger.error('Failed to fetch goals', {
      error: err.message,
      stack: err.stack,
      userId: userIdParam || 'unknown'
    });
    return Response.json({ 
      error: err.message || 'Failed to fetch goals',
      debug: {
        userId: userIdParam || 'missing',
        databaseError: !!err.message
      }
    }, { status: 500 })
  }
})

export const POST = withSecurity(async (req: Request) => {
  try {
    const body = await req.json()
    const { userId, name, emoji, targetAmount, depositedAmount, targetDate, monthlyPledge, assetType } = body
    
    if (!userId || !name || !targetAmount) {
      return Response.json({ error: 'userId, name, and targetAmount are required' }, { status: 400 })
    }
    
    const result = await query(
      `INSERT INTO goals (
        user_id, name, emoji, target_amount, deposited_amount, 
        target_date, monthly_pledge, asset, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, name, emoji, target_amount, deposited_amount, target_date, monthly_pledge, asset, created_at`,
      [userId, name, emoji || '🎯', targetAmount, depositedAmount || 0, targetDate, monthlyPledge || 0, assetType || 'USDC']
    )
    
    logger.info('Created goal', { userId, name, targetAmount })
    return Response.json(result[0])
  } catch (err: any) {
    logger.error('Failed to create goal', err)
    return Response.json({ 
      error: err.message || 'Failed to create goal' 
    }, { status: 500 })
  }
})
