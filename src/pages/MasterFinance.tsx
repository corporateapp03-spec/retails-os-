import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Zap, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieChartIcon, 
  Download,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  ArrowRight,
  ShieldCheck,
  Calendar,
  CreditCard,
  Target,
  Rocket,
  RefreshCw,
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { InventoryItem, LedgerEntry } from '../types';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar
} from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type TimeRange = 'daily' | 'weekly' | 'monthly' | 'semi-annual' | 'annual';

export default function MasterFinance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [loanAmount, setLoanAmount] = useState(10000);
  const [loanDuration, setLoanDuration] = useState(12);
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [inventoryRes, ledgerRes] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('ledger').select('*').order('created_at', { ascending: true })
      ]);

      if (inventoryRes.error) throw inventoryRes.error;
      if (ledgerRes.error) throw ledgerRes.error;

      setInventory(inventoryRes.data || []);
      setLedger(ledgerRes.data || []);
    } catch (err) {
      console.error('Error fetching financial data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch financial data');
    } finally {
      setLoading(false);
    }
  }

  const analytics = useMemo(() => {
    if (!ledger.length) return null;

    // 1. Safety Wrap: Calculation Engine
    const sales = ledger.filter(e => e.transaction_type === 'sale');
    const expenses = ledger.filter(e => e.transaction_type === 'expense');

    const totalRevenue = sales.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    
    const dates = ledger
      .map(e => new Date(e.created_at).getTime())
      .filter(t => !isNaN(t));
    
    if (dates.length === 0) return null;

    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const daysDiff = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));

    const dailyRevenue = (totalRevenue || 0) / (daysDiff || 1);
    const dailyExpenses = (totalExpenses || 0) / (daysDiff || 1);
    const dailyProfit = dailyRevenue - dailyExpenses;

    // 2. 5-Horizon Multiplier
    const multiplier: number = {
      daily: 1,
      weekly: 7,
      monthly: 30,
      'semi-annual': 180,
      annual: 365
    }[timeRange];

    const scaledRevenue = dailyRevenue * multiplier;
    const scaledExpenses = dailyExpenses * multiplier;
    const scaledProfit = dailyProfit * multiplier;

    // 3. 3-Pillar Engine Mapping
    const PILLARS = {
      Oil: ['oil', 'lube', 'fluid', 'atf'],
      Spares: ['pad', 'filter', 'plug', 'belt', 'bolt', 'suspension', 'brake', 'hardware', 'gasket', 'engine'],
      Electrical: ['bulb', 'battery', 'fuse', 'relay', 'sensor', 'plug', 'wire', 'light', 'spark']
    };

    const getPillar = (desc: string = '') => {
      const d = desc.toLowerCase();
      if (PILLARS.Oil.some(k => d.includes(k))) return 'Oil';
      if (PILLARS.Electrical.some(k => d.includes(k))) return 'Electrical';
      if (PILLARS.Spares.some(k => d.includes(k))) return 'Spares';
      return 'Other';
    };

    const isRestock = (desc: string = '') => {
      const d = desc.toLowerCase();
      return ['purchase', 'restock', 'supplies', 'supply'].some(k => d.includes(k));
    };

    const pillarStats = ledger.reduce((acc, e) => {
      const pillar = getPillar(e.description);
      if (!acc[pillar]) acc[pillar] = { revenue: 0, expense: 0, decap: 0 };
      
      if (e.transaction_type === 'sale') {
        acc[pillar].revenue += (e.amount || 0);
      } else if (e.transaction_type === 'expense') {
        acc[pillar].expense += (e.amount || 0);
        if (isRestock(e.description)) {
          acc[pillar].decap += (e.amount || 0);
        }
      }
      return acc;
    }, {} as Record<string, { revenue: number, expense: number, decap: number }>);

    const categoryHealth = ['Oil', 'Spares', 'Electrical', 'Other'].map(name => {
      const stats = pillarStats[name] || { revenue: 0, expense: 0, decap: 0 };
      const sRev = (stats.revenue / (daysDiff || 1)) * multiplier;
      const sExp = (stats.expense / (daysDiff || 1)) * multiplier;
      const sDecap = (stats.decap / (daysDiff || 1)) * multiplier;
      const profit = sRev - sExp;
      const margin = sRev > 0 ? (profit / sRev) * 100 : 0;
      const status = sDecap > sRev ? 'Stocking Up' : 'Healthy';

      return { name, revenue: sRev, expense: sExp, profit, margin, status, decap: sDecap };
    }).sort((a, b) => b.revenue - a.revenue);

    // 4. Chart Data Preparation
    const pieData = categoryHealth.map(c => ({
      name: c.name,
      value: c.expense
    })).filter(c => c.value > 0);

    const dailyData = ledger.reduce((acc, e) => {
      const date = new Date(e.created_at).toLocaleDateString();
      if (!acc[date]) acc[date] = { date, revenue: 0, expenses: 0 };
      if (e.transaction_type === 'sale') acc[date].revenue += (e.amount || 0);
      else if (e.transaction_type === 'expense') acc[date].expenses += (e.amount || 0);
      return acc;
    }, {} as Record<string, any>);

    const trendData = Object.values(dailyData)
      .map((d: any) => ({ ...d, profit: d.revenue - d.expenses }))
      .slice(-15);

    // 5. Loan Simulation Logic
    const safeCapacity = Math.max(0, scaledProfit * 0.5);
    const monthlyPayment = (loanAmount || 0) / Math.max(1, loanDuration || 1);
    
    const requiredPayment = {
      daily: monthlyPayment / 30,
      weekly: (monthlyPayment / 30) * 7,
      monthly: monthlyPayment,
      'semi-annual': monthlyPayment * 6,
      annual: monthlyPayment * 12
    }[timeRange];

    const ratio = safeCapacity > 0 ? (requiredPayment || 0) / safeCapacity : 100;
    let verdict: 'Safe' | 'Risky' | 'Danger' = 'Safe';
    let vColor = 'text-emerald-500';
    let vBg = 'bg-emerald-500/10';
    let vBorder = 'border-emerald-500/20';

    if (ratio > 0.8) {
      verdict = 'Danger';
      vColor = 'text-rose-500';
      vBg = 'bg-rose-500/10';
      vBorder = 'border-rose-500/20';
    } else if (ratio > 0.5) {
      verdict = 'Risky';
      vColor = 'text-amber-500';
      vBg = 'bg-amber-500/10';
      vBorder = 'border-amber-500/20';
    }

    // 6. Growth Projection
    const projectedProfit = scaledProfit * 1.25; // 25% Growth Simulation
    const growthData = [
      { name: 'Current', profit: scaledProfit },
      { name: 'Projected', profit: projectedProfit }
    ];

    return {
      scaledRevenue,
      scaledExpenses,
      scaledProfit,
      pieData,
      trendData,
      safeCapacity,
      requiredPayment,
      verdict,
      vColor,
      vBg,
      vBorder,
      growthData,
      categoryHealth,
      growthPercentage: scaledProfit !== 0 ? ((projectedProfit - scaledProfit) / Math.abs(scaledProfit)) * 100 : 0
    };
  }, [ledger, timeRange, loanAmount, loanDuration]);

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#0a0a0a',
        useCORS: true,
        allowTaint: true,
        windowWidth: 1200
      });
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      pdf.save(`RetailOS_Executive_Report_${timeRange.toUpperCase()}.pdf`);
    } catch (err) {
      console.error('PDF Export Error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] space-y-6">
        <div className="relative">
          <RefreshCw className="animate-spin text-[#FFD700] w-16 h-16" />
          <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white w-6 h-6" />
        </div>
        <div className="space-y-2 text-center">
          <p className="text-[#FFD700] font-black uppercase tracking-[0.3em] text-xs animate-pulse">Initializing Growth Engine</p>
          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">Synchronizing Financial Vaults...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vault-card p-12 text-center max-w-lg mx-auto mt-10 border-rose-500/20">
        <AlertTriangle className="text-rose-500 mx-auto mb-6" size={48} />
        <h3 className="text-white font-black uppercase tracking-tighter text-xl mb-2">Engine Failure</h3>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">{error}</p>
        <button onClick={fetchData} className="gold-btn w-full py-4 min-h-[48px]">Re-Initialize Engine</button>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="vault-card p-12 text-center max-w-lg mx-auto mt-10">
        <BarChart3 className="text-[#FFD700] mx-auto mb-6" size={48} />
        <h3 className="text-white font-black uppercase tracking-tighter text-xl mb-2">Awaiting First Transaction</h3>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
          The Growth Engine requires ledger activity to generate simulations. 
          Record your first sale or expense to begin.
        </p>
      </div>
    );
  }

  const COLORS = ['#FFD700', '#C0C0C0', '#CD7F32', '#4a4a4a', '#2a2a2a'];

  return (
    <div className="space-y-8 pb-24">
      {/* 5-Horizon Time Engine Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-[#050505]/50 p-4 rounded-3xl border border-white/5 sticky top-0 z-40 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FFD700]/10 flex items-center justify-center text-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.1)]">
            <Zap size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter">Growth Engine</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Financial Horizon: {timeRange}</p>
          </div>
        </div>

        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar">
          {(['daily', 'weekly', 'monthly', 'semi-annual', 'annual'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap min-h-[48px]",
                timeRange === range 
                  ? "bg-[#FFD700] text-[#0a0a0a] shadow-[0_0_20px_rgba(255,215,0,0.3)]" 
                  : "text-slate-500 hover:text-white"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div ref={reportRef} className="space-y-8">
        {/* Key Metrics Grid - Responsive Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="vault-card p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <DollarSign size={80} className="text-[#FFD700]" />
            </div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Projected Revenue</p>
            <h3 className="text-4xl font-black text-white tracking-tighter">
              ${analytics.scaledRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-emerald-500">
              <TrendingUp size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Performance Baseline</span>
            </div>
          </div>

          <div className="vault-card p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingDown size={80} className="text-rose-500" />
            </div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Operating Load</p>
            <h3 className="text-4xl font-black text-white tracking-tighter">
              ${analytics.scaledExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-slate-500">
              <ShieldCheck size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Operational Burn</span>
            </div>
          </div>

          <div className="vault-card p-8 relative overflow-hidden group border-[#FFD700]/30 bg-[#FFD700]/5 md:col-span-2 lg:col-span-1">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Zap size={80} className="text-[#FFD700]" />
            </div>
            <p className="text-[#FFD700] text-[10px] font-black uppercase tracking-widest mb-2">Net Growth Profit</p>
            <h3 className="text-4xl font-black text-white tracking-tighter">
              ${analytics.scaledProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-[#FFD700]">
              <Target size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Capital Surplus</span>
            </div>
          </div>
        </div>

        {/* Charts Section - Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="vault-card p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="text-white font-black uppercase tracking-widest text-xs">Financial Heartbeat</h4>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Daily Profit Trends</p>
              </div>
              <BarChart3 className="text-[#FFD700]" size={20} />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" stroke="#4a4a4a" fontSize={10} tickFormatter={(v) => v.split('/')[0] + '/' + v.split('/')[1]} />
                  <YAxis stroke="#4a4a4a" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '12px' }} />
                  <Line type="monotone" dataKey="profit" stroke="#FFD700" strokeWidth={3} dot={{ fill: '#FFD700', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="vault-card p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="text-white font-black uppercase tracking-widest text-xs">Expense Allocation</h4>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">3-Pillar Distribution</p>
              </div>
              <PieChartIcon className="text-[#FFD700]" size={20} />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {analytics.pieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '900' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Loan Simulation & Growth - Responsive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Loan Simulator */}
          <div className="vault-card p-8 space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className="text-[#FFD700]" size={20} />
              <h4 className="text-white font-black uppercase tracking-widest text-xs">Loan Simulator</h4>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-3">Loan Amount ($)</label>
                <input 
                  type="number" 
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-lg font-black outline-none focus:border-[#FFD700]/50 transition-all text-white min-h-[48px]"
                />
              </div>

              <div>
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-3">Duration (Months)</label>
                <input 
                  type="number" 
                  value={loanDuration}
                  onChange={(e) => setLoanDuration(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-lg font-black outline-none focus:border-[#FFD700]/50 transition-all text-white min-h-[48px]"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Safe Capacity</span>
                <span className="text-emerald-500 text-xs font-black">${analytics.safeCapacity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: '50%' }} />
              </div>
            </div>
          </div>

          {/* Verdict Card */}
          <div className="vault-card p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-8">
                <ArrowRight className="text-[#FFD700]" size={20} />
                <h4 className="text-white font-black uppercase tracking-widest text-xs">Repayment Verdict</h4>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Required Payment</p>
                    <h5 className="text-3xl font-black text-white tracking-tighter">
                      ${analytics.requiredPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h5>
                  </div>
                  <div className={cn("px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest", analytics.vBg, analytics.vColor, analytics.vBorder)}>
                    {analytics.verdict}
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Info size={16} className={analytics.vColor} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Simulation Insight</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                    {analytics.verdict === 'Safe' 
                      ? 'Business generates sufficient cash flow to comfortably service this debt while maintaining operational buffers.' 
                      : analytics.verdict === 'Risky' 
                      ? 'Repayment consumes a significant portion of profit. Consider a longer duration or smaller loan amount.' 
                      : 'Required payments exceed safe thresholds. This level of debt may jeopardize daily operations.'}
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={exportToPDF}
              disabled={isExporting}
              className="w-full mt-8 gold-btn py-4 flex items-center justify-center gap-3 disabled:opacity-50 min-h-[48px]"
            >
              {isExporting ? <RefreshCw className="animate-spin" size={18} /> : <><Download size={18} /> Export Executive Report</>}
            </button>
          </div>

          {/* Funding Impact */}
          <div className="vault-card p-8 md:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3 mb-8">
              <Rocket className="text-[#FFD700]" size={20} />
              <h4 className="text-white font-black uppercase tracking-widest text-xs">Funding Impact</h4>
            </div>

            <div className="h-48 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.growthData}>
                  <XAxis dataKey="name" stroke="#4a4a4a" fontSize={10} />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="profit" radius={[8, 8, 0, 0]}>
                    {analytics.growthData.map((_, index) => <Cell key={`cell-${index}`} fill={index === 0 ? '#4a4a4a' : '#FFD700'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Projected Growth</span>
                <span className="text-[#FFD700] text-xs font-black">+{analytics.growthPercentage.toFixed(1)}%</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed italic font-medium">
                * Simulation assumes a 25% increase in sales velocity if capital is deployed to scale inventory.
              </p>
            </div>
          </div>
        </div>

        {/* Category Health - Android Fluid Card List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-white font-black uppercase tracking-widest text-xs">Pillar Health & Capital Reinvestment</h4>
              <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">3-Pillar Performance Audit</p>
            </div>
            <ShieldCheck className="text-[#FFD700]" size={24} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analytics.categoryHealth
              .filter(cat => ['Oil', 'Spares', 'Electrical'].includes(cat.name))
              .map((cat, idx) => (
              <div key={idx} className="vault-card p-6 border-[#FFD700]/10 hover:border-[#FFD700]/30 transition-all group">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h5 className="text-white font-black uppercase tracking-tighter text-lg">{cat.name}</h5>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                      cat.status === 'Healthy' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                    )}>
                      {cat.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Margin</p>
                    <p className="text-white font-black text-sm">{cat.margin.toFixed(1)}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                  <div>
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Revenue</p>
                    <p className="text-white font-bold text-xs">${cat.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Reinvestment</p>
                    <p className="text-amber-500 font-bold text-xs">${cat.decap.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Expenses</p>
                    <p className="text-rose-500 font-bold text-xs">${cat.expense.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Net Profit</p>
                    <p className="text-emerald-500 font-bold text-xs">${cat.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
