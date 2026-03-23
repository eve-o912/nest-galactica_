// Health check endpoint - verifies all services are operational
import { NextResponse } from 'next/server';
import { checkDatabaseHealth, pool } from '@/lib/db';
import { publicClient } from '@/lib/yo-executor';
import { logger } from '@/lib/retry';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  services: {
    database: { healthy: boolean; latency: number; error?: string };
    redis: { healthy: boolean; latency: number; error?: string };
    baseRpc: { healthy: boolean; latency: number; error?: string };
    yoApi: { healthy: boolean; latency: number; error?: string };
    privy: { healthy: boolean; latency: number; error?: string };
    encryption: { healthy: boolean; error?: string };
  };
}

export async function GET(req: Request) {
  const start = Date.now();
  const services: HealthStatus['services'] = {
    database: { healthy: false, latency: 0 },
    redis: { healthy: false, latency: 0 },
    baseRpc: { healthy: false, latency: 0 },
    yoApi: { healthy: false, latency: 0 },
    privy: { healthy: false, latency: 0 },
    encryption: { healthy: false },
  };

  // Check database
  try {
    const dbHealth = await checkDatabaseHealth();
    services.database = dbHealth;
  } catch (err) {
    services.database = {
      healthy: false,
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }

  // Check Redis (Upstash)
  try {
    const redisStart = Date.now();
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await redis.ping();
    services.redis = { healthy: true, latency: Date.now() - redisStart };
  } catch (err) {
    services.redis = {
      healthy: false,
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }

  // Check Base RPC
  try {
    const rpcStart = Date.now();
    await publicClient.getBlockNumber();
    services.baseRpc = { healthy: true, latency: Date.now() - rpcStart };
  } catch (err) {
    services.baseRpc = {
      healthy: false,
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }

  // Check YO API
  try {
    const yoStart = Date.now();
    const YOUSD_VAULT = '0x0000000f926268be77Ab7e1d17E4e4C7D4b28a65';
    const res = await fetch(`https://api.yo.xyz/api/v1/vault/base/${YOUSD_VAULT}/snapshot`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    services.yoApi = { healthy: true, latency: Date.now() - yoStart };
  } catch (err) {
    services.yoApi = {
      healthy: false,
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }

  // Check Privy (just verify credentials exist)
  try {
    const privyStart = Date.now();
    if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) {
      throw new Error('Missing Privy credentials');
    }
    // Try a lightweight auth check
    const authHeader = `Basic ${Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64')}`;
    const res = await fetch(`https://auth.privy.io/api/v1/apps/${process.env.PRIVY_APP_ID}`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    services.privy = { healthy: true, latency: Date.now() - privyStart };
  } catch (err) {
    services.privy = {
      healthy: false,
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }

  // Check encryption key
  try {
    const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('WALLET_ENCRYPTION_KEY not set');
    }
    if (!/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
      throw new Error('WALLET_ENCRYPTION_KEY must be 64 hex characters');
    }
    services.encryption = { healthy: true };
  } catch (err) {
    services.encryption = {
      healthy: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }

  // Determine overall status
  const allHealthy = Object.values(services).every(s => s.healthy);
  const someHealthy = Object.values(services).some(s => s.healthy);
  const status: HealthStatus['status'] = allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy';

  const health: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    services,
  };

  logger.info('Health check completed', { status, latency: Date.now() - start });

  return NextResponse.json(health, {
    status: allHealthy ? 200 : someHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

// Also handle POST for load balancer health checks
export async function POST(req: Request) {
  return GET(req);
}
