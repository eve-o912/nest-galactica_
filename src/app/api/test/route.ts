import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Nest app is running',
    timestamp: new Date().toISOString(),
    routes: {
      home: '/',
      dashboard: '/dashboard',
      health: '/api/health',
      test: '/api/test'
    }
  });
}
