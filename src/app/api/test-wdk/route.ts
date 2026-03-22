import { NextRequest, NextResponse } from 'next/server';
import { createWDKClient } from '@/lib/wdk/client';
import { logger } from '@/lib/retry';

export async function GET(request: NextRequest) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      tests: [] as any[],
      summary: { passed: 0, failed: 0, total: 0 }
    };

    // Test 1: WDK Client Initialization
    try {
      const client = await createWDKClient();
      results.tests.push({
        name: 'WDK Client Initialization',
        status: 'PASS',
        details: 'WDK client created successfully'
      });
      results.summary.passed++;
    } catch (error) {
      results.tests.push({
        name: 'WDK Client Initialization',
        status: 'FAIL',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
      results.summary.failed++;
    }

    // Test 2: Environment Variables
    const envVars = {
      BASE_RPC_URL: !!process.env.BASE_RPC_URL,
      WALLET_ENCRYPTION_KEY: !!process.env.WALLET_ENCRYPTION_KEY,
      PAYMASTER_URL: !!process.env.PAYMASTER_URL,
      BUNDLER_URL: !!process.env.BUNDLER_URL,
    };

    const envOk = Object.values(envVars).every(Boolean);
    results.tests.push({
      name: 'Environment Variables',
      status: envOk ? 'PASS' : 'FAIL',
      details: envVars
    });
    
    if (envOk) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }

    // Test 3: Database Connection (simple query)
    try {
      const { query } = await import('@/lib/db');
      await query('SELECT 1 as test');
      results.tests.push({
        name: 'Database Connection',
        status: 'PASS',
        details: 'Database connection successful'
      });
      results.summary.passed++;
    } catch (error) {
      results.tests.push({
        name: 'Database Connection',
        status: 'FAIL',
        details: error instanceof Error ? error.message : 'Database connection failed'
      });
      results.summary.failed++;
    }

    // Test 4: Viem Client Connection
    try {
      const { createPublicClient, http } = await import('viem');
      const { base } = await import('viem/chains');
      
      const publicClient = createPublicClient({
        chain: base,
        transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
      });

      const blockNumber = await publicClient.getBlockNumber();
      results.tests.push({
        name: 'Base RPC Connection',
        status: 'PASS',
        details: `Connected to Base, block: ${blockNumber}`
      });
      results.summary.passed++;
    } catch (error) {
      results.tests.push({
        name: 'Base RPC Connection',
        status: 'FAIL',
        details: error instanceof Error ? error.message : 'RPC connection failed'
      });
      results.summary.failed++;
    }

    // Test 5: USDT Contract Read
    try {
      const { createPublicClient, http } = await import('viem');
      const { base } = await import('viem/chains');
      
      const publicClient = createPublicClient({
        chain: base,
        transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
      });

      const USDT_ADDRESS = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2';
      const decimals = await publicClient.readContract({
        address: USDT_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'decimals',
            type: 'function',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ name: '', type: 'uint8' }],
          },
        ],
        functionName: 'decimals',
      });

      results.tests.push({
        name: 'USDT Contract Read',
        status: 'PASS',
        details: `USDT decimals: ${decimals}`
      });
      results.summary.passed++;
    } catch (error) {
      results.tests.push({
        name: 'USDT Contract Read',
        status: 'FAIL',
        details: error instanceof Error ? error.message : 'USDT contract read failed'
      });
      results.summary.failed++;
    }

    results.summary.total = results.summary.passed + results.summary.failed;
    results.overall = results.summary.failed === 0 ? 'PASS' : 'FAIL';

    logger.info('WDK API test completed', results);

    return NextResponse.json(results);
  } catch (error) {
    logger.error('WDK API test failed', error);
    return NextResponse.json(
      { 
        error: 'Test suite failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
