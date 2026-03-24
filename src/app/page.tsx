'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Target,
  TrendingUp,
  Lock,
  Heart,
  Shield,
  Flame,
  Menu,
  X,
  Wallet,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

// Add error boundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Page Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Page Error</h1>
            <p className="text-red-500 mb-4">{this.state.error?.message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 text-white rounded"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Add debug component
function DebugInfo() {
  return (
    <div className="fixed top-4 right-4 bg-green-500 text-white p-3 rounded-lg text-sm z-50 shadow-lg">
      <div className="font-bold">✅ Nest Loaded</div>
      <div className="text-xs">Dashboard Active</div>
    </div>
  );
}
import { Goal } from '@/lib/types';
import { Button } from '@/components/ui';
import { ChatInterface } from '@/components/chat-interface';
import { GoalsView } from '@/components/goals-view';
import { YieldDashboard } from '@/components/yield-dashboard';
import { LockPeriods } from '@/components/lock-periods';
import { PortfolioHealth } from '@/components/portfolio-health';
import { RiskEducation } from '@/components/risk-education';
import { StreaksView } from '@/components/streaks-view';
import { Onboarding } from '@/components/onboarding';
import { GoalModal } from '@/components/goal-modal';
import { AgentPanel } from '@/components/AgentPanel';
import { PureWDKLoginButton } from '@/components/pure-wdk-login-button';
import { usePureWDKWallet } from '@/hooks/usePureWDKWallet';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'agent', label: 'Agent', icon: Sparkles },
  { id: 'yield', label: 'Yield', icon: TrendingUp },
  { id: 'locks', label: 'Locks', icon: Lock },
  { id: 'health', label: 'Health', icon: Heart },
  { id: 'streaks', label: 'Streaks', icon: Flame },
  { id: 'risks', label: 'Risks', icon: Shield },
];

function NestApp() {
  const { user, authenticated, ready, createWallet } = usePureWDKWallet();
  const userId = user?.id;
  const [activeTab, setActiveTab] = useState('overview');
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  // Fetch goals from database when user is authenticated
  useEffect(() => {
    if (!userId) return;
    
    const fetchGoals = async () => {
      try {
        const res = await fetch(`/api/goals?userId=${userId}`);
        if (res.ok) {
          const goals = await res.json();
          // Update portfolio with fetched goals
          setPortfolio(prev => prev ? {
            ...prev,
            goals: goals,
            totalBalance: goals.reduce((sum: number, g: any) => sum + (g.deposited_amount || 0), 0),
          } : null);
        }
      } catch (err) {
        console.error('Failed to fetch goals:', err);
      }
    };

    if (authenticated) {
      fetchGoals();
    }
  }, [userId, authenticated]);

  const handleAddGoal = () => {
    setEditingGoal(null);
    setIsGoalModalOpen(true);
  };

  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = async (goalData: Partial<Goal>) => {
    if (!userId) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      if (editingGoal) {
        // TODO: Add PUT endpoint for updating goals
        setPortfolio({
          ...portfolio,
          goals: portfolio?.goals?.map((g: Goal) =>
            g.id === editingGoal.id ? { ...g, ...goalData } as Goal : g
          ) ?? [],
        });
      } else {
        // Create new goal in database
        const res = await fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            name: goalData.name || 'New Goal',
            emoji: goalData.emoji || '🎯',
            targetAmount: goalData.targetAmount || 0,
            depositedAmount: goalData.depositedAmount || 0,
            targetDate: goalData.targetDate || '',
            monthlyPledge: goalData.monthlyPledge || 0,
            assetType: goalData.assetType || 'USDC',
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to create goal');
        }

        const newGoal = await res.json();
        
        // Update local state with the new goal
        setPortfolio(prev => prev ? {
          ...prev,
          goals: [...prev.goals, newGoal],
          totalBalance: prev.totalBalance + (newGoal.deposited_amount || 0),
        } : null);
      }
    } catch (err: any) {
      console.error('Failed to save goal:', err);
      alert(err.message || 'Failed to save goal');
    }
  };

  const handleLockGoal = (goalId: string, days: number) => {
    if (!portfolio) return;
    
    const lockExpiry = new Date();
    lockExpiry.setDate(lockExpiry.getDate() + days);
    
    setPortfolio({
      ...portfolio,
      goals: portfolio.goals.map((g: Goal) =>
        g.id === goalId
          ? { ...g, lockPeriod: days, lockExpiry: lockExpiry.toISOString() }
          : g
      ),
    });
  };

  if (isOnboarding) {
    return <Onboarding onComplete={() => setIsOnboarding(false)} />;
  }

  const renderContent = () => {
    // Show onboarding for new users
    if (!authenticated && !isOnboarding) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="max-w-md w-full mx-auto text-center">
            <div className="mb-8">
              <img src="/nest-logo.png" alt="Nest" className="w-16 h-16 mx-auto mb-4" />
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
                Welcome to Nest
              </h1>
              <p className="text-lg text-neutral-600 dark:text-neutral-400">
                Goal-based DeFi savings platform
              </p>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-8 mb-6">
              <h2 className="text-xl font-semibold mb-4">Get Started</h2>
              <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                Create your wallet to start saving with automated DeFi strategies. 
                No complex setup required - just sign up and start saving.
              </p>
              
              <Button
                onClick={() => {
                  createWallet().then(() => {
                    setIsOnboarding(false);
                    window.location.reload(); // Refresh to show authenticated state
                  }).catch(err => {
                    console.error('Failed to create wallet:', err);
                    alert('Failed to create wallet. Please try again.');
                  });
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg"
                size="lg"
              >
                Sign Up & Create Wallet
              </Button>
              
              <div className="mt-6 text-sm text-neutral-500">
                <p>✓ Free wallet creation</p>
                <p>✓ No gas fees for setup</p>
                <p>✓ Automated savings strategies</p>
              </div>
            </div>
            
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => setIsOnboarding(true)}
                className="text-neutral-600 dark:text-neutral-400"
              >
                Skip to Demo
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (isOnboarding) {
      return <Onboarding onComplete={() => setIsOnboarding(false)} />;
    }

    switch (activeTab) {
      case 'overview':
        return (
          <div className="h-full flex flex-col lg:flex-row gap-6">
            <div className="flex-1 lg:w-2/3">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                  Hey, welcome back! 👋
                </h1>
                <p className="text-neutral-600 dark:text-neutral-400">
                  You have {portfolio?.goals?.length ?? 0} active goals and ${portfolio?.totalBalance?.toFixed(2) ?? '0.00'} earning {portfolio?.baseApy ?? 0}% APY.
                </p>
              </div>
              
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <QuickStat
                  label="Total Balance"
                  value={`$${portfolio?.totalBalance?.toFixed(2) ?? '0.00'}`}
                  trend={`+${portfolio?.totalEarnedYield?.toFixed(2) ?? '0.00'} earned`}
                />
                <QuickStat
                  label="Current APY"
                  value={`${portfolio?.baseApy ?? 0}%`}
                  trend="Variable rate"
                />
                <QuickStat
                  label="Streak"
                  value={`${portfolio?.currentStreak ?? 0} weeks`}
                  trend={`Best: ${portfolio?.longestStreak ?? 0}`}
                />
              </div>

              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg">Your Goals</h3>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('goals')}>
                    View All
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <div className="space-y-3">
                  {(portfolio?.goals ?? []).slice(0, 3).map((goal: Goal) => (
                    <div
                      key={goal.id}
                      className="flex items-center gap-4 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl"
                    >
                      <span className="text-2xl">{goal.emoji}</span>
                      <div className="flex-1">
                        <p className="font-medium text-neutral-900 dark:text-white">{goal.name}</p>
                        <div className="flex items-center gap-2 text-sm text-neutral-500">
                          <span>${goal.depositedAmount.toFixed(0)} of ${goal.targetAmount.toFixed(0)}</span>
                          {goal.lockPeriod && <span className="text-amber-500">🔒 {goal.lockPeriod}d</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-neutral-900 dark:text-white">
                          {((goal.depositedAmount / goal.targetAmount) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="lg:w-1/3 h-[500px] lg:h-auto">
              <ChatInterface portfolio={portfolio ?? null} />
            </div>
          </div>
        );
      case 'goals':
        return (
          <GoalsView
            goals={portfolio?.goals ?? []}
            onAddGoal={handleAddGoal}
            onEditGoal={handleEditGoal}
          />
        );
      case 'agent':
        return <AgentPanel />;
      case 'yield':
        return <YieldDashboard portfolio={portfolio ?? null} />;
      case 'locks':
        return (
          <LockPeriods
            goals={portfolio?.goals ?? []}
            baseApy={portfolio?.baseApy ?? 0}
            onLockGoal={handleLockGoal}
          />
        );
      case 'health':
        return <PortfolioHealth portfolio={portfolio ?? null} />;
      case 'streaks':
        return <StreaksView portfolio={portfolio ?? null} />;
      case 'risks':
        return <RiskEducation />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/nest-logo.png" alt="Nest" className="w-10 h-10" />
              <div>
                <h1 className="font-bold text-xl text-neutral-900 dark:text-white">Nest</h1>
                <p className="text-xs text-neutral-500">Goal-based DeFi savings</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <PureWDKLoginButton />
              {!authenticated ? (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    createWallet().then(() => {
                      // Refresh page after wallet creation
                      window.location.reload();
                    }).catch(err => {
                      console.error('Failed to create wallet:', err);
                      alert('Failed to create wallet. Please try again.');
                    });
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white border-green-600"
                >
                  Sign Up
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-green-600 font-medium">
                    ✓ Connected
                  </span>
                  <span className="text-sm text-neutral-500">
                    {wallet?.address?.slice(0, 6)}...{wallet?.address?.slice(-4)}
                  </span>
                </div>
              )}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden w-10 h-10 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden border-t border-neutral-200 dark:border-neutral-800 overflow-hidden"
            >
              <div className="px-4 py-2 space-y-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
                
                {!authenticated && (
                  <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
                    <Button
                      onClick={() => {
                        createWallet().then(() => {
                          setIsMobileMenuOpen(false);
                          window.location.reload();
                        }).catch(err => {
                          console.error('Failed to create wallet:', err);
                          alert('Failed to create wallet. Please try again.');
                        });
                      }}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                    >
                      Sign Up & Create Wallet
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      <GoalModal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        onSave={handleSaveGoal}
        goal={editingGoal}
      />
    </div>
  );
}

function QuickStat({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend: string;
}) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4">
      <p className="text-sm text-neutral-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-neutral-900 dark:text-white">{value}</p>
      <p className="text-xs text-green-600 dark:text-green-400">{trend}</p>
    </div>
  );
}

// Add debug wrapper
function NestAppWithDebug() {
  return (
    <ErrorBoundary>
      <DebugInfo />
      <NestApp />
    </ErrorBoundary>
  );
}

export default NestAppWithDebug;
