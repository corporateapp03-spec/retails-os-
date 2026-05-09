import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  BarChart3, 
  ShieldAlert, 
  Target, 
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  FileText,
  History,
  Activity,
  Calculator,
  Box,
  AlertTriangle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase, isConfigured } from '../lib/supabase';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

interface TransactionLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
}

export default function StrategicDecision() {
  const [items, setItems] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'p&l' | 'inventory' | 'simulator'>('p&l');

  // Scenario Simulator State
  const [investmentAmt, setInvestmentAmt] = useState<number>(10000);
  const [costCutAmt, setCostCutAmt] = useState<number>(0);
  
  // Activity Logs
  const [logs, setLogs] = useState<TransactionLog[]>([]);

  const summaries = useMemo(() => {
    const daily: Record<string, { total_revenue: number, total_profit: number, total_outflow: number }> = {};
    const itemMap = items.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {} as any);

    ledger.forEach(entry => {
      const date = new Date(entry.created_at).toISOString().split('T')[0];
      if (!daily[date]) {
        daily[date] = { total_revenue: 0, total_profit: 0, total_outflow: 0 };
      }

      if (entry.transaction_type === 'sale') {
        daily[date].total_revenue += Number(entry.amount || 0);
        const item = itemMap[entry.inventory_item_id];
        if (item) {
          const cost = (item.cost_price || 0) * (entry.quantity || 1);
          daily[date].total_profit += (Number(entry.amount || 0) - cost);
        } else {
          daily[date].total_profit += Number(entry.amount || 0);
        }
      } else if (['expense', 'capital_withdrawal', 'CAPITAL_WITHDRAWAL', 'capital_deduction'].includes(entry.transaction_type)) {
        daily[date].total_outflow += Number(entry.amount || 0);
        daily[date].total_profit -= Number(entry.amount || 0);
      }
    });

    return Object.entries(daily).map(([date, data]) => ({
      date,
      ...data
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [ledger, items]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    if (!isConfigured) return;
    setLoading(true);
    try {
      const [ledgerRes, invRes] = await Promise.all([
        supabase.from('ledger').select('*').order('created_at', { ascending: true }),
        supabase.from('inventory').select('*')
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      if (invRes.error) throw invRes.error;

      setLedger(ledgerRes.data || []);
      setItems(invRes.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const addLog = (action: string, details: string) => {
    const newLog: TransactionLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleString(),
      action,
      details
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
  };

  const financials = useMemo(() => {
    if (!summaries.length) return null;

    const totalRevenue = summaries.reduce((acc, s) => acc + (s.total_revenue || 0), 0);
    const totalProfit = summaries.reduce((acc, s) => acc + (s.total_profit || 0), 0);
    const totalExpenses = summaries.reduce((acc, s) => acc + (s.total_outflow || 0), 0);
    
    // Derived Balance Sheet Approximations
    const inventoryAssetValue = items.reduce((acc, item) => acc + (item.cost_price * item.stock_quantity), 0);
    const profitMargin = (totalProfit / (totalRevenue || 1)) * 100;
    
    // Daily Trends
    const chartData = summaries.slice(-30).map(s => ({
      date: new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      revenue: s.total_revenue || 0,
      profit: s.total_profit || 0,
      expenses: s.total_outflow || 0
    }));

    return {
      totalRevenue,
      totalProfit,
      totalExpenses,
      inventoryAssetValue,
      profitMargin,
      chartData,
      netCashFlow: totalRevenue - totalExpenses
    };
  }, [summaries, items]);

  const productPerformance = useMemo(() => {
    return items
      .map(item => ({
        ...item,
        currentValue: item.selling_price * item.stock_quantity,
        yieldPotential: (item.selling_price - item.cost_price) * item.stock_quantity,
        roi: ((item.selling_price - item.cost_price) / (item.cost_price || 1)) * 100
      }))
      .sort((a, b) => b.yieldPotential - a.yieldPotential);
  }, [items]);

  const projections = useMemo(() => {
    if (!financials) return null;
    
    // Growth heuristics: 2.5x revenue multiplier for strategic investments
    const revMultiplier = 2.5;
    const projectedNewRevenue = financials.totalRevenue + (investmentAmt * revMultiplier);
    const projectedNewProfit = projectedNewRevenue * (financials.profitMargin / 100) + costCutAmt;

    return {
      estNewRevenue: projectedNewRevenue,
      estNewProfit: projectedNewProfit,
      growthRate: ((projectedNewProfit - financials.totalProfit) / (financials.totalProfit || 1)) * 100
    };
  }, [financials, investmentAmt, costCutAmt]);

  const exportReport = () => {
    const doc = new jsPDF();
    const timestamp = new Date().toLocaleString();

    // Strategy Document Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('CORPORATE STRATEGY & DECISION REPORT', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`CONFIDENTIAL EXECUTIVE VIEW | ${timestamp}`, 105, 30, { align: 'center' });

    // Financial Health Table
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text('1. Core Financial Status', 14, 55);
    autoTable(doc, {
      startY: 60,
      head: [['KPI', 'Current Valuation', 'Status']],
      body: [
        ['Total Gross Revenue', `$${financials?.totalRevenue.toLocaleString()}`, 'ACTIVE'],
        ['Net Distributable Profit', `$${financials?.totalProfit.toLocaleString()}`, 'REALISED'],
        ['Total Operational Expenses', `$${financials?.totalExpenses.toLocaleString()}`, 'STABLE'],
        ['Inventory Asset Value', `$${financials?.inventoryAssetValue.toLocaleString()}`, 'ASSET'],
        ['Net Cash Position', `$${financials?.netCashFlow.toLocaleString()}`, financials?.netCashFlow! > 0 ? 'POSITIVE' : 'CRITICAL']
      ],
      theme: 'grid',
      headStyles: { fillColor: [218, 165, 32] } // Gold
    });

    // Product Intelligence
    doc.addPage();
    doc.text('2. Product Asset Intelligence', 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [['Product', 'Stock', 'Value', 'ROI %']],
      body: productPerformance.slice(0, 15).map(p => [
        p.name,
        p.stock_quantity,
        `$${p.currentValue.toLocaleString()}`,
        `${p.roi.toFixed(1)}%`
      ]),
      styles: { fontSize: 8 }
    });

    // Strategy Projections
    doc.text('3. Strategic Growth Scenarios', 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Scenario Input', 'Result Analysis']],
      body: [
        [`Target Investment: $${investmentAmt.toLocaleString()}`, `Est. Growth: +${projections?.growthRate.toFixed(1)}%`],
        [`Operational Cuts: $${costCutAmt.toLocaleString()}`, `Est. New Annual Profit: $${projections?.estNewProfit.toLocaleString()}`]
      ],
      theme: 'striped'
    });

    doc.save(`Strategy_Decision_Hub_${new Date().toISOString().split('T')[0]}.pdf`);
    addLog('STRATEGY EXPORT', `Generated investor report for ${timestamp}`);
  };

  if (loading) return <Loading />;
  if (error) return (
    <div className="p-8 text-center">
      <AlertTriangle size={48} className="mx-auto text-rose-500 mb-4" />
      <p className="text-white font-bold">{error}</p>
    </div>
  );
  if (!financials) return null;

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-[#FFD700]/10 rounded border border-[#FFD700]/20 text-[10px] font-black text-[#FFD700] uppercase tracking-widest">
              Executive View
            </span>
            <Activity size={14} className="text-blue-500" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter">Strategic Decision Hub</h1>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-2">Single Source of Truth & Financial Forensics</p>
        </div>
        <button 
          onClick={exportReport}
          className="flex items-center gap-2 px-6 py-3 bg-[#FFD700] hover:bg-white text-black font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)]"
        >
          <FileText size={16} />
          Export Investor Report
        </button>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: financials.totalRevenue, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Net Profit', value: financials.totalProfit, icon: DollarSign, color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/10' },
          { label: 'Inventory Assets', value: financials.inventoryAssetValue, icon: Layers, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Profit Margin', value: `${financials.profitMargin.toFixed(1)}%`, icon: Target, color: 'text-purple-500', bg: 'bg-purple-500/10' }
        ].map((kpi, i) => (
          <div key={i} className="vault-card p-6 rounded-[2rem] border border-white/5 bg-[#0d0d0d] relative group overflow-hidden">
            <div className={`absolute top-0 right-0 p-8 ${kpi.bg} rounded-bl-[4rem] opacity-20 group-hover:opacity-40 transition-opacity`} />
            <div className="relative z-10">
              <kpi.icon size={18} className={kpi.color + " mb-4"} />
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{kpi.label}</p>
              <p className="text-2xl font-black text-white">
                {typeof kpi.value === 'number' ? `$${kpi.value.toLocaleString()}` : kpi.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main P&L Forensic Tracking */}
        <div className="lg:col-span-2 vault-card rounded-[2.5rem] border border-white/10 bg-[#0a0a0a] overflow-hidden">
          <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <BarChart3 size={18} className="text-[#FFD700]" />
                P&L Forensic Analytics
              </h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Rolling 30-Day performance architecture</p>
            </div>
            <div className="flex bg-white/5 p-1 rounded-xl">
              {['p&l', 'inventory', 'simulator'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === tab ? "bg-[#FFD700] text-black" : "text-slate-500 hover:text-white"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="p-8 h-[400px]">
            {activeTab === 'p&l' && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financials.chartData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFD700" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#FFD700" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ fontSize: '10px', textTransform: 'uppercase' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="profit" stroke="#FFD700" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {activeTab === 'inventory' && (
              <div className="h-full overflow-y-auto space-y-4 custom-scrollbar-gold pr-4">
                {productPerformance.slice(0, 8).map((p, i) => (
                  <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-black text-[#FFD700]">
                        #{i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Stock: {p.stock_quantity} | Value: ${p.currentValue.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-emerald-500">{p.roi.toFixed(1)}% ROI</p>
                      <p className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">Yield: ${p.yieldPotential.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'simulator' && (
              <div className="h-full space-y-8 py-4">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Expansion Capital Investment</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input 
                        type="number"
                        value={investmentAmt}
                        onChange={(e) => setInvestmentAmt(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 font-black text-2xl text-white outline-none focus:border-[#FFD700] transition-colors"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Operational Cost Efficiency (Cut)</label>
                    <div className="relative">
                      <TrendingDown className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input 
                        type="number"
                        value={costCutAmt}
                        onChange={(e) => setCostCutAmt(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 font-black text-2xl text-rose-500 outline-none focus:border-rose-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-blue-500/5 rounded-3xl border border-blue-500/20 flex items-center justify-between">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                       <Zap size={14} />
                       Impact Forecast
                    </h4>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Projected Annual Profit</p>
                      <p className="text-4xl font-black text-white tracking-tighter">${projections?.estNewProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full inline-block mb-3">
                      +{projections?.growthRate.toFixed(1)}% Strategic Growth
                    </p>
                    <p className="text-xs text-slate-500 font-bold max-w-[200px] leading-relaxed">
                      AI projected scaling based on historical yield multipliers and current operational margins.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Strategic Analysis Sidebar */}
        <div className="space-y-6">
          <div className="vault-card p-8 rounded-[2.5rem] border border-white/10 bg-[#0a0a0a] relative overflow-hidden">
             <div className="absolute top-4 right-4 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
             </div>
             <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
               <Calculator size={16} className="text-[#FFD700]" />
               Balance Sheet Check
             </h3>
             <div className="space-y-6">
                <div className="flex justify-between items-center group">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-white transition-colors">Total Assets</p>
                   <p className="font-bold text-white">${financials.inventoryAssetValue.toLocaleString()}</p>
                </div>
                <div className="flex justify-between items-center group">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-white transition-colors">Cumulative Sales</p>
                   <p className="font-bold text-white">${financials.totalRevenue.toLocaleString()}</p>
                </div>
                <div className="flex justify-between items-center group">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-white transition-colors">OpEx Burn Rate</p>
                   <p className="font-bold text-rose-500">-${financials.totalExpenses.toLocaleString()}</p>
                </div>
                <div className="pt-6 border-t border-white/5">
                   <div className="flex justify-between items-end">
                      <div>
                         <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">Net Cash Position</p>
                         <p className={cn(
                           "text-2xl font-black",
                           financials.netCashFlow >= 0 ? "text-emerald-500" : "text-rose-500"
                         )}>
                           ${financials.netCashFlow.toLocaleString()}
                         </p>
                      </div>
                      <div className={cn(
                        "p-2 rounded-xl",
                        financials.netCashFlow >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10"
                      )}>
                        {financials.netCashFlow >= 0 ? <ArrowUpRight className="text-emerald-500" /> : <ArrowDownRight className="text-rose-500" />}
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <div className="vault-card p-8 rounded-[2.5rem] border border-emerald-500/10 bg-emerald-500/5">
            <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <ShieldAlert size={14} />
              Risk Assessment
            </h3>
            <p className="text-xs text-slate-300 font-bold leading-relaxed">
              Business health is currently <span className="text-emerald-400">High Liquid</span>. 
              The inventory asset value provides a secure buffer against short-term operational burn. 
              Strategic recommendation: Increase capital allocation into high-ROI products (top 5).
            </p>
          </div>
          
          {/* Audit History mini */}
          <div className="vault-card p-6 rounded-[2rem] border border-white/5 bg-[#0d0d0d]">
             <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <History size={14} />
                Recent Strategy Events
             </h4>
             <div className="space-y-3">
                {logs.length === 0 ? (
                  <p className="text-[10px] text-slate-700 italic">No events recorded...</p>
                ) : (
                  logs.slice(0, 3).map(log => (
                    <div key={log.id} className="text-[10px]">
                       <p className="text-[#FFD700] font-black uppercase tracking-tighter">{log.action}</p>
                       <p className="text-slate-500 leading-tight">{log.details}</p>
                    </div>
                  ))
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
