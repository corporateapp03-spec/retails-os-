import React, { useState, useEffect, useMemo } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { LedgerEntry } from '../types';
import { 
  TrendingUp, 
  Users, 
  ShieldCheck, 
  PieChart, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  History,
  Info,
  DollarSign,
  ArrowRight,
  Zap,
  Target
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

interface TransactionLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  profitPool: number;
}

type RiskProfile = 'safe' | 'moderate' | 'aggressive';
type RepaymentInterval = 'monthly' | 'semi-annual' | 'annual';

export default function ProfitDistribution() {
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Split States
  const [partnerAShare, setPartnerAShare] = useState<number>(40);
  const [partnerBShare, setPartnerBShare] = useState<number>(40);
  const [reinvestmentShare, setReinvestmentShare] = useState<number>(20);

  // Projection States
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('moderate');
  const [repaymentInterval, setRepaymentInterval] = useState<RepaymentInterval>('monthly');

  // Transaction Logs
  const [logs, setLogs] = useState<TransactionLog[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const [ledgerRes, summaryRes, inventoryRes] = await Promise.all([
        supabase.from('ledger').select('*'),
        supabase.from('business_summary').select('*'),
        supabase.from('inventory').select('*')
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      
      const rawLedger = ledgerRes.data || [];
      const rawSummaries = summaryRes.data || [];
      const rawInventory = inventoryRes.data || [];

      setLedger(rawLedger);

      if (rawSummaries.length > 0) {
        setSummaries(rawSummaries);
      } else {
        // Fallback calculation matching dashboard
        const safeNum = (val: any) => {
          const n = parseFloat(String(val || 0));
          return isNaN(n) ? 0 : n;
        };

        const categories = Array.from(new Set(rawInventory.map(i => i.category || 'General')));
        const fallbackSummaries = categories.map(cat => {
          const catLedger = rawLedger.filter(l => {
            const item = rawInventory.find(i => i.id === l.inventory_item_id);
            return (item?.category || 'General') === cat;
          });

          const revenue = catLedger.filter(l => l.transaction_type === 'sale').reduce((sum, l) => sum + safeNum(l.amount), 0);
          const expenses = catLedger.filter(l => l.transaction_type === 'expense').reduce((sum, l) => sum + safeNum(l.amount), 0);
          const profit = revenue - expenses;

          return { total_revenue: revenue, total_profit: profit };
        });
        setSummaries(fallbackSummaries);
      }

      addLog('Data Fetch', 'Successfully synchronized ledger and business summaries for precise allocation.');
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to load distribution data.');
    } finally {
      setLoading(false);
    }
  }

  const addLog = (action: string, details: string) => {
    const newLog: TransactionLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      action,
      details,
      profitPool: financials.profitPool
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50)); // Keep last 50
  };

  const financials = useMemo(() => {
    const availableProfit = summaries.reduce((acc, s) => acc + (s.total_profit || 0), 0);
    const totalRealized = summaries.reduce((acc, s) => acc + (s.total_revenue || 0), 0);
    
    const profitPool = availableProfit; // Use full available profit

    return {
      netProfit: availableProfit, // "Available Profit" from dashboard
      totalRealized,
      profitPool
    };
  }, [summaries]);

  const totalSplit = partnerAShare + partnerBShare + reinvestmentShare;
  const isSplitValid = totalSplit === 100;

  // Distribution Calculations
  const distribution = useMemo(() => {
    if (!isSplitValid) return { partnerA: 0, partnerB: 0, reinvestment: 0, leftover: 0 };
    
    const partnerA = financials.profitPool * (partnerAShare / 100);
    const partnerB = financials.profitPool * (partnerBShare / 100);
    const reinvestment = financials.profitPool * (reinvestmentShare / 100);
    const leftover = financials.netProfit - (partnerA + partnerB + reinvestment); // Should be 0 when valid

    return { partnerA, partnerB, reinvestment, leftover };
  }, [isSplitValid, financials, partnerAShare, partnerBShare, reinvestmentShare]);

  // Borrowing Projection
  const borrowingProjection = useMemo(() => {
    // Risk multipliers based on profit pool
    const riskMultipliers: Record<RiskProfile, number> = {
      safe: 1.5,
      moderate: 3.0,
      aggressive: 5.0
    };

    // Interest rate variants (annual)
    const baseRate = 0.085; // 8.5%
    
    const maxCapacity = financials.profitPool * riskMultipliers[riskProfile];
    
    const intervalPayments: Record<RepaymentInterval, number> = {
      monthly: 12,
      'semi-annual': 2,
      annual: 1
    };

    const paymentsPerYear = intervalPayments[repaymentInterval];
    const estimatedPayment = (maxCapacity * (1 + baseRate)) / (3 * paymentsPerYear); // 3-year term

    return {
      maxCapacity,
      estimatedPayment,
      annualRate: (baseRate * 100).toFixed(1)
    };
  }, [financials.profitPool, riskProfile, repaymentInterval]);

  // Event handlers with logging
  const handleSplitChange = (type: 'A' | 'B' | 'R', value: number) => {
    const val = Math.max(0, Math.min(100, value));
    if (type === 'A') setPartnerAShare(val);
    if (type === 'B') setPartnerBShare(val);
    if (type === 'R') setReinvestmentShare(val);
    
    // Low frequency logging for split changes to avoid spam
    addLog('Parameter Adjustment', `Updated ${type === 'A' ? 'Partner A' : type === 'B' ? 'Partner B' : 'Reinvestment'} allocation to ${val}%`);
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-24 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-[#FFD700]/10 rounded-xl">
              <TrendingUp size={24} className="text-[#FFD700]" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Profit Distribution Engine</h1>
          </div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest ml-12">Dynamic yield allocation & borrowing optimizer</p>
        </div>

        <div className="flex items-end gap-6 bg-white/5 p-4 rounded-[2rem] border border-white/10">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Distributable Pool</p>
            <p className="text-3xl font-black text-[#FFD700]">${financials.profitPool.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Input & Distribution */}
        <div className="lg:col-span-8 space-y-8">
          {/* Split Multi-Control */}
          <div className="vault-card p-10 rounded-[3rem] border border-white/10 bg-[#0a0a0a] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full -mr-20 -mt-20" />
            
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <PieChart size={18} className="text-[#FFD700]" />
                    Allocation Matrix
                  </h2>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-7">
                    Available Profit: <span className="text-white">${financials.netProfit.toLocaleString()}</span>
                  </p>
                </div>
                <div className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-300",
                  isSplitValid ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-rose-500/10 border-rose-500/30 text-rose-500 animate-pulse"
                )}>
                  {isSplitValid ? "Status: Verified" : `Invalid: ${totalSplit}%`}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Partner A */}
                <div className="space-y-4">
                  <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem] space-y-4 group hover:border-[#FFD700]/30 transition-all">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Partner A (%)</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number" 
                          value={partnerAShare}
                          onChange={(e) => handleSplitChange('A', parseInt(e.target.value) || 0)}
                          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-right font-black text-white outline-none focus:border-[#FFD700] focus:ring-1 focus:ring-[#FFD700]/20"
                        />
                        <span className="text-[10px] font-black text-[#FFD700]">%</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-white/5 text-right">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Projected Payout</p>
                      <p className="text-2xl font-black text-white">${distribution.partnerA.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Partner B */}
                <div className="space-y-4">
                  <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem] space-y-4 group hover:border-[#FFD700]/30 transition-all">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Partner B (%)</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number" 
                          value={partnerBShare}
                          onChange={(e) => handleSplitChange('B', parseInt(e.target.value) || 0)}
                          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-right font-black text-white outline-none focus:border-[#FFD700] focus:ring-1 focus:ring-[#FFD700]/20"
                        />
                        <span className="text-[10px] font-black text-[#FFD700]">%</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-white/5 text-right">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Projected Payout</p>
                      <p className="text-2xl font-black text-white">${distribution.partnerB.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Reinvestment */}
                <div className="space-y-4">
                  <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-[2rem] space-y-4 group hover:border-emerald-500/30 transition-all">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest">Reinvest (%)</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number" 
                          value={reinvestmentShare}
                          onChange={(e) => handleSplitChange('R', parseInt(e.target.value) || 0)}
                          className="w-16 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1 text-right font-black text-emerald-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                        />
                        <span className="text-[10px] font-black text-emerald-500">%</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-emerald-500/10 text-right">
                      <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest mb-1">Growth Pool</p>
                      <p className="text-2xl font-black text-emerald-500">${distribution.reinvestment.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {!isSplitValid && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-500 animate-in slide-in-from-top-2">
                  <AlertTriangle size={18} />
                  <p className="text-[10px] font-black uppercase tracking-widest">CRITICAL: Distribution total must be exactly 100% to finalize payouts.</p>
                </div>
              )}
            </div>
          </div>

          {/* Borrowing Projector */}
          <div className="vault-card p-10 rounded-[3rem] border border-white/10 bg-[#0a0a0a] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full -ml-20 -mt-20" />
            
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500">
                    <Zap size={18} />
                  </div>
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">Leverage Capacity Projector</h2>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <Info size={12} />
                  Based on yield velocity
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-8">
                  {/* Risk Profiles */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Risk Profile</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['safe', 'moderate', 'aggressive'].map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            setRiskProfile(p as RiskProfile);
                            addLog('Strategy Update', `Shifted business leverage profile to: ${p.toUpperCase()}`);
                          }}
                          className={cn(
                            "py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                            riskProfile === p 
                              ? "bg-blue-500 text-white border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]" 
                              : "bg-white/5 text-slate-500 border-white/10 hover:bg-white/10"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Repayment Interval */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Repayment Schedule</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['monthly', 'semi-annual', 'annual'].map((i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setRepaymentInterval(i as RepaymentInterval);
                            addLog('Parameter Check', `Repayment frequency adjusted to: ${i.toUpperCase()}`);
                          }}
                          className={cn(
                            "py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                            repaymentInterval === i 
                              ? "bg-white text-black border-white" 
                              : "bg-white/5 text-slate-500 border-white/10 hover:bg-white/10"
                          )}
                        >
                          {i}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between p-8 bg-blue-500/5 border border-blue-500/10 rounded-[2rem] relative">
                  <div className="flex items-center gap-2 text-blue-500 mb-4 opacity-50">
                    <Target size={16} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Projection Result</span>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Max Borrowing Power</p>
                      <p className="text-4xl font-black text-white tracking-tighter">${borrowingProjection.maxCapacity.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Est. {repaymentInterval} Payment</p>
                      <p className="text-xl font-black text-blue-500 tracking-tighter">${borrowingProjection.estimatedPayment.toLocaleString()}</p>
                    </div>
                    <div className="pt-4 border-t border-white/5">
                      <p className="text-[10px] font-bold text-slate-600 uppercase italic tracking-tighter">
                        Calculated at {borrowingProjection.annualRate}% APR over a 36-month horizon for operational expansion.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Transaction Logs */}
        <div className="lg:col-span-4 space-y-8">
          {/* Summary Stats */}
          <div className="vault-card p-8 rounded-[2.5rem] border border-white/10 bg-[#0a0a0a]">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-500" />
              Retained Yield Summary
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                <span>Primary Growth (Reinvest)</span>
                <span>+${distribution.reinvestment.toLocaleString()}</span>
              </div>
              <div className="pt-4 border-t border-white/5 flex justify-between items-end">
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Total Asset Growth</span>
                <span className="text-2xl font-black text-[#FFD700] tracking-tighter">${distribution.reinvestment.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Activity Log */}
          <div className="vault-card rounded-[2.5rem] border border-white/10 bg-[#0a0a0a] overflow-hidden flex flex-col max-h-[600px]">
            <div className="p-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                <History size={14} className="text-[#FFD700]" />
                Audit Trail
              </h3>
              <button 
                onClick={() => setLogs([])}
                className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-tighter"
              >
                Clear
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {logs.length === 0 ? (
                <div className="py-20 text-center opacity-20">
                  <History size={32} className="mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Waiting for Activity</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.map((log) => (
                    <div key={log.id} className="p-4 bg-white/5 rounded-2xl border border-transparent hover:border-white/10 transition-all group scale-95 opacity-80 hover:scale-100 hover:opacity-100">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[9px] font-black text-[#FFD700] uppercase tracking-widest">{log.action}</span>
                        <span className="text-[9px] font-bold text-slate-600">{log.timestamp}</span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed mb-2">{log.details}</p>
                      <div className="flex items-center gap-1.5">
                        <DollarSign size={10} className="text-slate-600" />
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">Pool At State: ${log.profitPool.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
