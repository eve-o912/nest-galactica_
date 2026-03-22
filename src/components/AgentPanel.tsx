'use client';

import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { 
  Bot, 
  Settings, 
  Activity, 
  Play, 
  Save, 
  Loader2,
  Wallet,
  TrendingUp,
  Shield,
  Flame,
  Bell,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Info,
  ArrowRightLeft,
  ArrowRight,
  ChevronDown,
  X,
  Plus,
  Minus,
  Send,
} from 'lucide-react';
import { createWalletClient, createPublicClient, custom, http, parseUnits, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { Button } from '@/components/ui';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface AgentLog {
  id: string;
  tool_name: string;
  reason: string;
  result: {
    success: boolean;
    skipped?: boolean;
    skip_reason?: string;
    error?: string;
    tx_hash?: string;
    basescan_url?: string;
    amount_usdc?: number;
    slippage_bps?: number;
  };
  executed_at: string;
}

interface Balances {
  vault: number;
  walletUSDC: number;
  eth: string;
}

interface Goal {
  id: string;
  name: string;
  deposited_amount: number;
  target_amount: number;
}

export function AgentPanel() {
  const { user, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const userId = user?.id;
  const walletAddress = user?.wallet?.address;
  
  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
  const YOUSD_VAULT = '0x0000000f926268be77Ab7e1d17E4e4C7D4b28a65' as const;

  const viemPublicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  // Debug wallet address format
  useEffect(() => {
    console.log('=== WALLET DEBUG ===');
    console.log('Wallet address:', walletAddress);
    console.log('Wallet type:', user?.wallet?.walletClientType);
    console.log('User ID:', userId);
    console.log('Full user object:', user);
  }, [userId, walletAddress]);

  const [tab, setTab] = useState<'setup' | 'activity'>('setup');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState('');
  const [balances, setBalances] = useState<Balances>({ vault: 0, walletUSDT: 0, eth: '0' });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'deposit' | 'withdraw' | null>(null);
  
  // Deposit state
  const [depositAmount, setDepositAmount] = useState(10);
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState<{txHash: string; amount: number; slippage?: number} | null>(null);
  
  // Withdrawal state
  const [withdrawAmount, setWithdrawAmount] = useState(10);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<{txHash: string; amount: number; slippage?: number} | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [rules, setRules] = useState({
    autopilot: false,
    scheduledDay: 'Monday',
    scheduledAmount: 50,
    monthlyBudget: 200,
    streakProtection: true,
    idleSweepDays: 3,
    enabled: false,
  });

  useEffect(() => {
    if (!userId || !walletAddress) return;
    
    fetch(`/api/agent/rules?userId=${userId}`)
      .then(r => r.json())
      .then(data => { 
        if (data) {
          setRules(r => ({ ...r, ...data }));
          if (data.selectedGoal) setSelectedGoal(data.selectedGoal);
        }
      })
      .catch(console.error);
    
    fetchLogs();
    fetchBalances();
    fetchGoals();
    
    const interval = setInterval(fetchBalances, 30000);
    return () => clearInterval(interval);
  }, [userId, walletAddress]);

  async function executeDepositClientSide(amount: number, goalName: string) {
    const wallet = wallets.find(w => w.address.toLowerCase() === walletAddress?.toLowerCase());
    if (!wallet) throw new Error('Wallet not found');

    // Switch to Base
    await wallet.switchChain(8453);

    const provider = await wallet.getEthereumProvider();
    const walletClient = createWalletClient({
      chain: base,
      transport: custom(provider),
    });

    const [address] = await walletClient.getAddresses();
    const amountRaw = parseUnits(amount.toFixed(6), 6);

    // Check allowance
    const allowance = await viemPublicClient.readContract({
      address: USDC_ADDRESS,
      abi: [{
        name: 'allowance', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      }] as const,
      functionName: 'allowance',
      args: [address, YOUSD_VAULT],
    });

    // Approve if needed
    if (allowance < amountRaw) {
      const approveTxHash = await walletClient.sendTransaction({
        account: address,
        to: USDC_ADDRESS,
        data: encodeFunctionData({
          abi: [{
              name: 'approve', type: 'function', stateMutability: 'nonpayable',
              inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
              outputs: [{ name: '', type: 'bool' }],
            }] as const,
          functionName: 'approve',
          args: [YOUSD_VAULT, amountRaw],
        }),
      });
      await viemPublicClient.waitForTransactionReceipt({ hash: approveTxHash });
    }

    // Deposit
    const depositTxHash = await walletClient.sendTransaction({
      account: address,
      to: YOUSD_VAULT,
      data: encodeFunctionData({
        abi: [{
            name: 'deposit', type: 'function', stateMutability: 'nonpayable',
            inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
          }] as const,
        functionName: 'deposit',
        args: [amountRaw, address],
      }),
    });

    const receipt = await viemPublicClient.waitForTransactionReceipt({ hash: depositTxHash });
    if (receipt.status !== 'success') throw new Error('Transaction reverted');

    // Record in DB via lightweight endpoint
    await fetch('/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        recordDeposit: {
          walletAddress,
          goalName,
          amountUsdc: amount,
          txHash: depositTxHash,
        }
      }),
    });

    return depositTxHash;
  }

  async function fetchBalances() {
    if (!walletAddress) return;
    try {
      const res = await fetch(`/api/balances?wallet=${walletAddress}`);
      const data = await res.json();
      setBalances(data);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    }
  }

  async function fetchGoals() {
    if (!userId) return;
    try {
      const res = await fetch(`/api/goals?userId=${userId}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setGoals(data);
        if (!selectedGoal) setSelectedGoal(data[0].name);
      } else {
        setGoals([]);
        setSelectedGoal('');
      }
    } catch (err) {
      console.error('Failed to fetch goals:', err);
      setGoals([]);
      setSelectedGoal('');
    }
  }

  async function fetchLogs() {
    if (!userId) return;
    try {
      const res = await fetch(`/api/agent/logs?userId=${userId}`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }

  async function saveRules() {
    if (!userId || !walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/agent/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, walletAddress, selectedGoal, ...rules }),
      });
      
      const data = await res.json().catch(() => ({ error: 'Invalid response from server' }));
      
      if (!res.ok) {
        throw new Error(data.error || `Failed to save: ${res.status}`);
      }
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save rules:', err);
      setSaveError(err.message || 'Failed to save rules');
    }
    setSaving(false);
  }

  async function runNow() {
    if (!userId) return;
    setRunning(true);
    try {
      await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      await fetchLogs();
    } catch (err) {
      console.error('Agent run failed:', err);
    }
    setRunning(false);
  }

  function handleDepositClick() {
    if (!userId || !walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    if (depositAmount < 0.01) {
      setDepositError('Minimum deposit is $0.01');
      return;
    }
    if (depositAmount > 1000) {
      setPendingAction('deposit');
      setShowConfirmModal(true);
      return;
    }
    executeDeposit();
  }

  async function executeDeposit() {
    setShowConfirmModal(false);
    setDepositing(true);
    setDepositError(null);
    setDepositSuccess(null);

    const isEmbedded = user?.wallet?.walletClientType === 'privy';

    try {
      if (!isEmbedded) {
        // MetaMask or other external wallet — sign in browser
        const txHash = await executeDepositClientSide(depositAmount, selectedGoal);
        setDepositSuccess({ txHash, amount: depositAmount });
        await fetchLogs();
        await fetchBalances();
        return;
      }

      // Privy embedded wallet — server-side signing (existing flow)
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          forceAction: {
            tool: 'deposit_to_goal',
            args: {
              goal_name: selectedGoal,
              amount_usdc: depositAmount,
              reason: `Manual deposit of $${depositAmount} to ${selectedGoal}` 
            }
          }
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Server error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      if (data.results?.[0]?.actions?.[0]?.result?.success) {
        const result = data.results[0].actions[0].result;
        setDepositSuccess({ txHash: result.tx_hash!, amount: result.amount_usdc! });
        await fetchLogs();
        await fetchBalances();
      } else {
        throw new Error(data.results?.[0]?.error || 'Deposit failed');
      }
    } catch (err: any) {
      setDepositError(err.message || 'Deposit failed');
    }

    setDepositing(false);
  }

  function handleWithdrawClick() {
    if (!userId || !walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    if (withdrawAmount < 0.01) {
      setWithdrawError('Minimum withdrawal is $0.01');
      return;
    }
    if (withdrawAmount > 1000) {
      setPendingAction('withdraw');
      setShowConfirmModal(true);
      return;
    }
    executeWithdrawal();
  }

  async function executeWithdrawal() {
    setShowConfirmModal(false);
    setWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          forceAction: {
            tool: 'withdraw_from_goal',
            args: {
              goal_name: selectedGoal,
              amount_usdc: withdrawAmount,
              reason: `Manual withdrawal of $${withdrawAmount} from ${selectedGoal}`
            }
          }
        }),
      });

      // Check if response is ok before parsing JSON
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Server error ${res.status}: ${errorText}`);
      }

      const data = await res.json().catch(() => ({ error: 'Invalid JSON response from server' }));
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      if (data.results?.[0]?.actions?.[0]?.result?.success) {
        const result = data.results[0].actions[0].result;
        setWithdrawSuccess({
          txHash: result.tx_hash!,
          amount: result.amount_usdc!,
          slippage: result.slippage_bps
        });
        await fetchLogs();
        await fetchBalances();
      } else {
        const error = data.results?.[0]?.actions?.[0]?.result?.error 
          || data.results?.[0]?.error 
          || 'Withdrawal failed';
        setWithdrawError(error);
      }
    } catch (err: any) {
      setWithdrawError(err.message || 'Withdrawal failed');
    }

    setWithdrawing(false);
  }

  function setMaxWithdraw() {
    setWithdrawAmount(Math.floor(balances.vault * 100) / 100);
  }

  function setMaxDeposit() {
    setDepositAmount(Math.floor(balances.walletUSDC * 100) / 100);
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Bot className="w-16 h-16 text-neutral-400" />
        <p className="text-neutral-600 dark:text-neutral-400">Connect your wallet to access the Nest Agent</p>
      </div>
    );
  }

  const toolIcon: Record<string, React.ReactNode> = {
    deposit_to_goal: <Wallet className="w-5 h-5 text-green-500" />,
    sweep_idle_usdc: <TrendingUp className="w-5 h-5 text-blue-500" />,
    protect_streak: <Sparkles className="w-5 h-5 text-orange-500" />,
    send_notification: <Bell className="w-5 h-5 text-yellow-500" />,
    notify: <Bell className="w-5 h-5 text-yellow-500" />,
    withdraw_from_goal: <ArrowRightLeft className="w-5 h-5 text-red-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Balance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
          <p className="text-sm text-neutral-500 mb-1">Vault Balance</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">
            ${balances?.vault?.toFixed(2) ?? '0.00'}
          </p>
          <p className="text-xs text-neutral-400">yoUSD on Base</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
          <p className="text-sm text-neutral-500 mb-1">Wallet USDT</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">
            ${balances?.walletUSDT?.toFixed(2) ?? '0.00'}
          </p>
          <p className="text-xs text-neutral-400">Available to deposit</p>
        </div>
      </div>

      {/* Goal Selector */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Selected Goal
        </label>
        {goals.length > 0 ? (
          <select
            value={selectedGoal}
            onChange={(e) => setSelectedGoal(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {goals.map(goal => (
              <option key={goal.id} value={goal.name}>
                {goal.name} (${goal.deposited_amount?.toFixed(2) ?? '0.00'} / ${goal.target_amount?.toFixed(0) ?? '0'})
              </option>
            ))}
          </select>
        ) : (
          <div className="text-center py-4">
            <p className="text-neutral-500 dark:text-neutral-400 mb-2">No goals created yet</p>
            <p className="text-xs text-neutral-400">Go to the Goals tab to create your first goal</p>
          </div>
        )}
      </div>

      {/* Deposit & Withdraw Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deposit Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg text-neutral-900 dark:text-white">Deposit</h2>
              <p className="text-sm text-neutral-500">Add USDC to yoUSD vault</p>
            </div>
          </div>

          {depositSuccess ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-400">Deposit successful!</span>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Deposited ${depositSuccess.amount.toFixed(2)} USDC
                {depositSuccess.slippage && (
                  <span className="text-xs text-neutral-400 ml-2">(Slippage: {depositSuccess.slippage / 100}%)</span>
                )}
              </p>
              <a 
                href={`https://basescan.org/tx/${depositSuccess.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                View on Basescan <ExternalLink className="w-3 h-3" />
              </a>
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setDepositSuccess(null)}>
                  Deposit Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Amount (USDC)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">$</span>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    min={0.01}
                    step={0.01}
                    className="flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={setMaxDeposit}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    MAX
                  </button>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Available: ${balances?.walletUSDC?.toFixed(2) ?? '0.00'} USDC
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Info className="w-3 h-3" />
                <span>Slippage: 0.5% (50 bps)</span>
              </div>

              {depositError && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  <XCircle className="w-4 h-4" />
                  {depositError}
                </div>
              )}

              <Button 
                onClick={handleDepositClick} 
                disabled={depositing || (balances?.walletUSDC ?? 0) < depositAmount}
                className="w-full"
              >
                {depositing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4 mr-2" />
                    Deposit ${depositAmount.toFixed(2)} USDC
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Withdraw Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg text-neutral-900 dark:text-white">Withdraw</h2>
              <p className="text-sm text-neutral-500">Remove USDC from vault</p>
            </div>
          </div>

          {withdrawSuccess ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-400">Withdrawal successful!</span>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Withdrew ${withdrawSuccess.amount.toFixed(2)} USDC
                {withdrawSuccess.slippage && (
                  <span className="text-xs text-neutral-400 ml-2">(Slippage: {withdrawSuccess.slippage / 100}%)</span>
                )}
              </p>
              <a 
                href={`https://basescan.org/tx/${withdrawSuccess.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                View on Basescan <ExternalLink className="w-3 h-3" />
              </a>
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setWithdrawSuccess(null)}>
                  Withdraw Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Amount (USDC)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">$</span>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                    min={0.01}
                    step={0.01}
                    className="flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
                  />
                  <button
                    onClick={setMaxWithdraw}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    MAX
                  </button>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Available: ${balances?.vault?.toFixed(2) ?? '0.00'} USDC
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Info className="w-3 h-3" />
                <span>Slippage: 0.5% (50 bps)</span>
              </div>

              {withdrawError && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  <XCircle className="w-4 h-4" />
                  {withdrawError}
                </div>
              )}

              <Button 
                onClick={handleWithdrawClick} 
                disabled={withdrawing || (balances?.vault ?? 0) < withdrawAmount}
                variant="outline"
                className="w-full border-red-200 hover:bg-red-50 text-red-600"
              >
                {withdrawing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-4 h-4 mr-2" />
                    Withdraw ${withdrawAmount.toFixed(2)} USDC
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Confirm Large Transaction</h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6">
              You are about to {pendingAction} <strong>${pendingAction === 'deposit' ? depositAmount.toFixed(2) : withdrawAmount.toFixed(2)} USDC</strong>.
              <br /><br />
              This is above the $1,000 threshold. Please confirm you want to proceed.
            </p>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1"
                onClick={() => {
                  if (pendingAction === 'deposit') executeDeposit();
                  else executeWithdrawal();
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Panel */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-neutral-900 dark:text-white">Nest Agent</h2>
              <p className="text-sm text-neutral-500">
                {rules.enabled 
                  ? (rules.autopilot ? '🟢 Autopilot active' : '🟡 Notify only') 
                  : '⚫ Disabled'}
              </p>
            </div>
          </div>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-neutral-500">Enable</span>
            <button
              onClick={() => setRules(r => ({ ...r, enabled: !r.enabled }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                rules.enabled ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-600'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  rules.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800">
          {(['setup', 'activity'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {t === 'setup' ? (
                <span className="flex items-center justify-center gap-2">
                  <Settings className="w-4 h-4" /> Setup
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Activity className="w-4 h-4" /> Activity
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {tab === 'setup' && (
            <div className="space-y-6">
              {/* Autopilot Mode */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-neutral-900 dark:text-white">Mode</h3>
                    <p className="text-sm text-neutral-500">
                      {rules.autopilot ? 'Agent executes real transactions' : 'Agent only sends you alerts'}
                    </p>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">
                    {(['Notify', 'Autopilot'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setRules(r => ({ ...r, autopilot: m === 'Autopilot' }))}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${
                          (m === 'Autopilot') === rules.autopilot
                            ? 'bg-blue-500 text-white'
                            : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scheduled Deposit */}
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Scheduled Deposit
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-neutral-500">Every</span>
                  <select
                    value={rules.scheduledDay}
                    onChange={(e) => setRules(r => ({ ...r, scheduledDay: e.target.value }))}
                    className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="text-sm text-neutral-500">deposit</span>
                  <div className="flex items-center px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                    <span className="text-neutral-500 mr-1">$</span>
                    <input
                      type="number"
                      value={rules.scheduledAmount}
                      min={0.01}
                      step={0.01}
                      onChange={(e) => setRules(r => ({ ...r, scheduledAmount: Number(e.target.value) }))}
                      className="w-20 bg-transparent outline-none text-neutral-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Monthly Budget */}
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Monthly Budget Cap
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-neutral-500">Never spend more than</span>
                  <div className="flex items-center px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                    <span className="text-neutral-500 mr-1">$</span>
                    <input
                      type="number"
                      value={rules.monthlyBudget}
                      min={1}
                      onChange={(e) => setRules(r => ({ ...r, monthlyBudget: Number(e.target.value) }))}
                      className="w-24 bg-transparent outline-none text-neutral-900 dark:text-white"
                    />
                  </div>
                  <span className="text-sm text-neutral-500">/ month</span>
                </div>
              </div>

              {/* Streak Protection */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Streak Guardian
                  </h3>
                  <p className="text-sm text-neutral-500">Auto-deposit $1 to protect weekly streak</p>
                </div>
                <button
                  onClick={() => setRules(r => ({ ...r, streakProtection: !r.streakProtection }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    rules.streakProtection ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      rules.streakProtection ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Idle Sweep */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Idle USDC Sweep
                  </h3>
                  <p className="text-sm text-neutral-500">Sweep uninvested USDC after</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.idleSweepDays}
                    min={1}
                    max={30}
                    onChange={(e) => setRules(r => ({ ...r, idleSweepDays: Number(e.target.value) }))}
                    className="w-16 px-2 py-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-center"
                  />
                  <span className="text-sm text-neutral-500">days</span>
                </div>
              </div>

              {/* Save Button */}
              {saveError && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  <XCircle className="w-4 h-4" />
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  Rules saved successfully!
                </div>
              )}
              <Button onClick={saveRules} disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Agent Rules
                  </>
                )}
              </Button>
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-500">Last 30 actions</p>
                <Button onClick={runNow} disabled={running} variant="outline" size="sm">
                  {running ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Agent Now
                    </>
                  )}
                </Button>
              </div>

              {logs.length === 0 ? (
                <div className="text-center py-12 text-neutral-500">
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No agent activity yet. Save your rules and click &quot;Run Agent Now&quot;.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => {
                    const result = log.result;
                    const isSuccess = result?.success && !result?.skipped;
                    const isSkipped = result?.skipped;
                    const isWithdrawal = log.tool_name === 'withdraw_from_goal';
                    
                    return (
                      <div
                        key={log.id}
                        className={`p-4 rounded-xl border ${
                          isSuccess
                            ? isWithdrawal 
                              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : isSkipped
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {toolIcon[log.tool_name] || <Bot className="w-5 h-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 dark:text-white">
                              {log.reason || result?.skip_reason || result?.error || log.tool_name}
                            </p>
                            {result?.amount_usdc && (
                              <p className={`text-sm mt-1 ${isWithdrawal ? 'text-red-600' : 'text-green-600'}`}>
                                {isWithdrawal ? '-' : '+'}${result.amount_usdc.toFixed(2)} USDC
                                {result.slippage_bps && (
                                  <span className="text-xs text-neutral-400 ml-2">
                                    (slippage: {result.slippage_bps / 100}%)
                                  </span>
                                )}
                              </p>
                            )}
                            {result?.tx_hash && (
                              <a
                                href={result.basescan_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-2"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                {result.tx_hash.slice(0, 10)}...{result.tx_hash.slice(-6)}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <span className="text-xs text-neutral-400 whitespace-nowrap">
                            {new Date(log.executed_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
