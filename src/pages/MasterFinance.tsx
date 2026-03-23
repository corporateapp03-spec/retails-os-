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
  Rocket
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
    try {
      const [inventoryRes, ledgerRes] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('ledger').select('*').order('created_at', { ascending: true })
      ]);

      if (inventoryRes.data) setInventory(inventoryRes.data);
      if (ledgerRes.data) setLedger(ledgerRes.data);
    } catch (err) {
      console.error('Error fetching financial data:', err);
    } finally {
      setLoading(false);
    }
  }

  const analytics = useMemo(() => {
    if (!ledger.length) return null;

    // 1. Calculate Daily Averages from Ledger
    const sales = ledger.filter(e => e.transaction_type === 'sale');
    const expenses = ledger.filter(e => e.transaction_type === 'expense');

    const totalRevenue: number = sales.reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses: number = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    // Find date range
    const dates = ledger.map(e => new Date(e.created_at).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const daysDiff = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));

    const dailyRevenue = totalRevenue / daysDiff;
    const dailyExpenses = totalExpenses / daysDiff;
    const dailyProfit = dailyRevenue - dailyExpenses;

    // 2. Scaling Logic
    const multiplier: number = {
      daily: 1,
      weekly: 7,
      monthly: 30,
      'semi-annual': 180,
      annual: 365
    }[timeRange];

    const scaledRevenue: number = dailyRevenue * multiplier;
    const scaledExpenses: number = dailyExpenses * multiplier;
    const scaledProfit: number = dailyProfit * multiplier;

    // 3. Category Breakdown (Expenses)
    const categories = expenses.reduce((acc, e) => {
      const cat = e.description?.split(':')[0] || 'Miscellaneous';
      acc[cat] = (acc[cat] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);

    const pieData = Object.entries(categories).map(([name, value]: [string, number]) => ({
      name,
      value: totalExpenses !== 0 ? (value / totalExpenses) * scaledExpenses : 0
    })).sort((a: any, b: any) => b.value - a.value);

    // 4. Profit Trends (Financial Heartbeat)
    // Group by day first
    const dailyData = ledger.reduce((acc, e) => {
      const date = new Date(e.created_at).toLocaleDateString();
      if (!acc[date]) acc[date] = { date, revenue: 0, expenses: 0 };
      if (e.transaction_type === 'sale') acc[date].revenue += e.amount;
      else if (e.transaction_type === 'expense') acc[date].expenses += e.amount;
      return acc;
    }, {} as Record<string, any>);

    const trendData = Object.values(dailyData)
      .map((d: any) => ({
        ...d,
        profit: d.revenue - d.expenses
      }))
      .slice(-15); // Last 15 days of activity

    // 5. Top Products (The Engine)
    const productSales = sales.reduce((acc, e) => {
      const name = e.description?.replace('Sale: ', '').split(' (x')[0] || 'Unknown';
      acc[name] = (acc[name] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);

    const topProducts = Object.entries(productSales)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a: any, b: any) => b.revenue - a.revenue)
      .slice(0, 5);

    // 6. Loan Intelligence
    const safeCapacity = scaledProfit * 0.5;
    const monthlyPayment = loanAmount / loanDuration;
    
    // Adjust required payment to match timeRange
    const requiredPayment = {
      daily: monthlyPayment / 30,
      weekly: (monthlyPayment / 30) * 7,
      monthly: monthlyPayment,
      'semi-annual': monthlyPayment * 6,
      annual: monthlyPayment * 12
    }[timeRange];

    const ratio = requiredPayment / safeCapacity;
    let status: 'Safe' | 'Risky' | 'Over-Leveraged' = 'Safe';
    let statusColor = 'text-emerald-500';
    let statusBg = 'bg-emerald-500/10';
    let statusBorder = 'border-emerald-500/20';

    if (ratio > 0.8) {
      status = 'Over-Leveraged';
      statusColor = 'text-rose-500';
      statusBg = 'bg-rose-500/10';
      statusBorder = 'border-rose-500/20';
    } else if (ratio > 0.5) {
      status = 'Risky';
      statusColor = 'text-amber-500';
      statusBg = 'bg-amber-500/10';
      statusBorder = 'border-amber-500/20';
    }

    // 7. Funding Impact (25% Growth)
    const projectedGrowth = 1.25;
    const projectedRevenue = scaledRevenue * projectedGrowth;
    const projectedProfit = projectedRevenue - scaledExpenses;

    const growthData = [
      { name: 'Current', profit: scaledProfit },
      { name: 'Projected (Funded)', profit: projectedProfit }
    ];

    return {
      scaledRevenue,
      scaledExpenses,
      scaledProfit,
      pieData,
      trendData,
      topProducts,
      safeCapacity,
      requiredPayment,
      status,
      statusColor,
      statusBg,
      statusBorder,
      growthData,
      projectedProfit,
      growthPercentage: scaledProfit !== 0 ? ((projectedProfit - scaledProfit) / Math.abs(scaledProfit)) * 100 : 0
    };
  }, [ledger, timeRange, loanAmount, loanDuration]);

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#0a0a0a',
        logging: false,
        useCORS: true
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Master_Finance_Report_${timeRange.toUpperCase()}.pdf`);
    } catch (err) {
      console.error('PDF Export Error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFD700]"></div>
        <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] animate-pulse">Initializing Financial Engine...</p>
      </div>
    );
  }

  if (!analytics) return null;

  const COLORS = ['#FFD700', '#C0C0C0', '#CD7F32', '#4a4a4a', '#2a2a2a'];

  return (
    <div className="space-y-8 pb-20">
      {/* Header & Time Engine */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <Zap className="text-[#FFD700]" size={32} />
            Master Credit & Growth Engine
          </h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">High-Fidelity Financial Simulation • 5-Horizon Edition</p>
        </div>

        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
          {(['daily', 'weekly', 'monthly', 'semi-annual', 'annual'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                timeRange === range 
                  ? "bg-[#FFD700] text-[#0a0a0a] shadow-lg" 
                  : "text-slate-500 hover:text-white"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div ref={reportRef} className="space-y-8 p-4 rounded-3xl">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/5 border border-white/10 p-8 rounded-[32px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <DollarSign size={64} className="text-[#FFD700]" />
            </div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Total Revenue ({timeRange})</p>
            <h3 className="text-4xl font-black text-white tracking-tighter">
              ${analytics.scaledRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-emerald-500">
              <TrendingUp size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Performance Baseline</span>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-8 rounded-[32px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <TrendingDown size={64} className="text-rose-500" />
            </div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Operating Expenses ({timeRange})</p>
            <h3 className="text-4xl font-black text-white tracking-tighter">
              ${analytics.scaledExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-slate-500">
              <ShieldCheck size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Operational Load</span>
            </div>
          </div>

          <div className="bg-[#FFD700]/5 border border-[#FFD700]/20 p-8 rounded-[32px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-30 transition-opacity">
              <Zap size={64} className="text-[#FFD700]" />
            </div>
            <p className="text-[#FFD700] text-[10px] font-black uppercase tracking-widest mb-2">Net Profit ({timeRange})</p>
            <h3 className="text-4xl font-black text-white tracking-tighter">
              ${analytics.scaledProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-[#FFD700]">
              <Target size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Growth Potential</span>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Financial Heartbeat */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-[32px]">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="text-white font-black uppercase tracking-widest text-xs">Financial Heartbeat</h4>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Daily Profit Trends (Last 15 Days)</p>
              </div>
              <BarChart3 className="text-[#FFD700]" size={20} />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#4a4a4a" 
                    fontSize={10} 
                    tickFormatter={(val: string) => {
                      const parts = val.split('/');
                      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : val;
                    }}
                  />
                  <YAxis stroke="#4a4a4a" fontSize={10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '12px' }}
                    itemStyle={{ color: '#FFD700', fontSize: '10px', fontWeight: 'bold' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="#FFD700" 
                    strokeWidth={3} 
                    dot={{ fill: '#FFD700', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Expense Allocation */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-[32px]">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="text-white font-black uppercase tracking-widest text-xs">Expense Allocation</h4>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Category Distribution ({timeRange})</p>
              </div>
              <PieChartIcon className="text-[#FFD700]" size={20} />
            </div>
            <div className="h-64 flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {analytics.pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '12px' }}
                    itemStyle={{ color: '#FFD700', fontSize: '10px', fontWeight: 'bold' }}
                  />
                  <Legend 
                    verticalAlign="middle" 
                    align="right" 
                    layout="vertical"
                    formatter={(value) => <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Loan Intelligence & Growth Simulation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Loan Simulator Inputs */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-[32px] space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className="text-[#FFD700]" size={20} />
              <h4 className="text-white font-black uppercase tracking-widest text-xs">Loan Simulator</h4>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-2">Desired Loan Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="number" 
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm font-bold outline-none focus:border-[#FFD700]/50 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-2">Duration (Months)</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="number" 
                    value={loanDuration}
                    onChange={(e) => setLoanDuration(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm font-bold outline-none focus:border-[#FFD700]/50 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Safe Repayment Capacity</span>
                <span className="text-emerald-500 text-xs font-black">${analytics.safeCapacity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500" 
                  style={{ width: '50%' }}
                />
              </div>
              <p className="text-[9px] text-slate-600 mt-2 italic">* Hard-coded at 50% of average profit for the period.</p>
            </div>
          </div>

          {/* Simulation Output & Verdict */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-[32px] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-8">
                <ArrowRight className="text-[#FFD700]" size={20} />
                <h4 className="text-white font-black uppercase tracking-widest text-xs">Repayment Verdict</h4>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Required Payment ({timeRange})</p>
                    <h5 className="text-3xl font-black text-white tracking-tighter">
                      ${analytics.requiredPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h5>
                  </div>
                  <div className={cn("px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest", analytics.statusBg, analytics.statusColor, analytics.statusBorder)}>
                    {analytics.status}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                  <div className="flex items-center gap-2">
                    {analytics.status === 'Safe' ? <CheckCircle2 className="text-emerald-500" size={16} /> : <AlertTriangle className={analytics.statusColor} size={16} />}
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">
                      {analytics.status === 'Safe' ? 'Optimal Leverage' : analytics.status === 'Risky' ? 'Caution Advised' : 'High Risk Warning'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {analytics.status === 'Safe' 
                      ? 'Your business generates sufficient cash flow to comfortably service this debt while maintaining operational buffers.' 
                      : analytics.status === 'Risky' 
                      ? 'Repayment consumes a significant portion of your profit. Consider a longer duration or smaller loan amount.' 
                      : 'Required payments exceed safe thresholds. This level of debt may jeopardize daily operations.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button 
                onClick={exportToPDF}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-3 bg-[#FFD700] text-[#0a0a0a] py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                {isExporting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#0a0a0a]"></div>
                ) : (
                  <>
                    <Download size={18} />
                    Export Executive Report
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Funding Impact */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-[32px]">
            <div className="flex items-center gap-3 mb-8">
              <Rocket className="text-[#FFD700]" size={20} />
              <h4 className="text-white font-black uppercase tracking-widest text-xs">Funding Impact</h4>
            </div>

            <div className="h-48 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.growthData}>
                  <XAxis dataKey="name" stroke="#4a4a4a" fontSize={10} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '12px' }}
                    itemStyle={{ color: '#FFD700', fontSize: '10px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="profit" radius={[8, 8, 0, 0]}>
                    {analytics.growthData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#4a4a4a' : '#FFD700'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Projected Profit Growth</span>
                <span className="text-[#FFD700] text-xs font-black">
                  +{analytics.growthPercentage.toFixed(1)}%
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed italic">
                * Simulation assumes a 25% increase in sales velocity across all horizons if capital is deployed to scale inventory.
              </p>
            </div>
          </div>
        </div>

        {/* The Engine: Top Products */}
        <div className="bg-white/5 border border-white/10 p-8 rounded-[32px]">
          <div className="flex items-center gap-3 mb-8">
            <Zap className="text-[#FFD700]" size={20} />
            <h4 className="text-white font-black uppercase tracking-widest text-xs">The Engine: Top Revenue Contributors</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {analytics.topProducts.map((product, idx) => (
              <div key={idx} className="bg-white/5 border border-white/5 p-6 rounded-2xl group hover:border-[#FFD700]/30 transition-all">
                <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Rank #{idx + 1}</p>
                <h5 className="text-white font-black text-sm truncate mb-2">{product.name}</h5>
                <p className="text-[#FFD700] font-mono text-xs">${product.revenue.toLocaleString()}</p>
                <div className="mt-3 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#FFD700] opacity-50" 
                    style={{ width: `${(product.revenue / analytics.topProducts[0].revenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
