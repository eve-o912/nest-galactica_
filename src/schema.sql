-- Nest Agent Database Schema
-- Run this in your Postgres database (Neon)

-- Agent configuration rules
CREATE TABLE agent_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  autopilot BOOLEAN DEFAULT false,
  scheduled_day TEXT DEFAULT 'Monday',
  scheduled_amount NUMERIC DEFAULT 0,
  monthly_budget NUMERIC DEFAULT 500,
  spent_this_month NUMERIC DEFAULT 0,
  streak_protection BOOLEAN DEFAULT true,
  idle_sweep_days INTEGER DEFAULT 3,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent action logs with real transaction hashes
CREATE TABLE agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB NOT NULL,
  result JSONB NOT NULL,
  reason TEXT NOT NULL,
  tx_hash TEXT,
  executed_at TIMESTAMPTZ DEFAULT now()
);

-- User savings goals
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  target_amount NUMERIC NOT NULL,
  deposited_amount NUMERIC DEFAULT 0,
  monthly_pledge NUMERIC DEFAULT 0,
  target_date DATE,
  asset TEXT DEFAULT 'USDT',
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WDK wallets table for EVM wallet management
CREATE TABLE wdk_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL UNIQUE,
  public_key TEXT,
  encrypted_data TEXT NOT NULL, -- Encrypted private key and mnemonic
  wallet_type TEXT DEFAULT 'evm',
  network TEXT DEFAULT 'base',
  account_abstraction BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_agent_logs_user_id ON agent_logs(user_id);
CREATE INDEX idx_agent_logs_executed_at ON agent_logs(executed_at DESC);
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_priority ON goals(priority ASC);
CREATE INDEX idx_wdk_wallets_user_id ON wdk_wallets(user_id);
CREATE INDEX idx_wdk_wallets_address ON wdk_wallets(address);
