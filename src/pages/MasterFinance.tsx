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
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

type TimeRange = 'daily' | 'weekly' | 'monthly' | 'semi-annual' | 'annual';

export default function MasterFinance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mathError, setMathError] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [loanAmount, setLoanAmount] = useState(10000);
  const [loanDuration, setLoanDuration] = useState(12);
  const [isExporting, setIsExporting] = useState(false);
  const [pin, setPin] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthorized) {
      fetchData();
    }
  }, [isAuthorized]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '7007') {
      setIsAuthorized(true);
    } else {
      alert('Invalid PIN');
      setPin('');
    }
  };

  async function fetchData() {
    setLoading(true);
    setError(null);
    setDataLoaded(false);
    try {
      const [inventoryRes, ledgerRes] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('ledger').select('*').order('created_at', { ascending: true })
      ]);

      if (inventoryRes.error) throw inventoryRes.error;
      if (ledgerRes.error) throw ledgerRes.error;

      setInventory(inventoryRes.data || []);
      setLedger(ledgerRes.data || []);
      setDataLoaded(true);
    } catch (err) {
      console.error('Error fetching financial data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch financial data');
    } finally {
      setLoading(false);
    }
  }

  const analytics = useMemo(() => {
    const defaultAnalytics = {
      scaledRevenue: 0,
      scaledExpenses: 0,
      scaledProfit: 0,
      pieData: [],
      trendData: [],
      safeCapacity: 0,
      requiredPayment: 0,
      verdict: 'Safe' as const,
      vColor: 'text-emerald-500',
      vBg: 'bg-emerald-500/10',
      vBorder: 'border-emerald-500/20',
      growthData: [
        { name: 'Current Path', profit: 0 },
        { name: 'Funded Path', profit: 0 }
      ],
      categoryHealth: [],
      wdaInflow: 0,
      wdaOutflow: 0,
      operationalBurn: 0,
      capitalReinvestment: 0,
      inventoryValue: 0,
      deadStockValue: 0,
      cashOnHand: 0,
      stockToSalesRatio: 0,
      inventoryTurnoverRatio: 0,
      fundingMultiplier: 0,
      projectedMonthlyRevenueIncrease: 0,
      dscr: 100,
      growthPercentage: 0,
      multiplier: 30,
      cogs: 0,
      netProfit: 0
    };

    if (!dataLoaded || !ledger || !ledger.length) return defaultAnalytics;

    try {
      const safeNum = (val: any) => {
        const n = parseFloat(String(val || 0));
        return isNaN(n) ? 0 : n;
      };

      // 1. Database Truth: Expense Reconciliation Logic
      const validLedger = ledger.filter(Boolean);
      const sales = validLedger.filter(e => e.transaction_type === 'sale');
      const allExpenses = validLedger.filter(e => e.transaction_type === 'expense');

      const REINVESTMENT_KEYWORDS = ['restock', 'purchase', 'stock', 'inventory'];
      
      const isRestock = (desc: string | null | undefined) => {
        if (!desc) return false;
        const d = String(desc).toLowerCase();
        return REINVESTMENT_KEYWORDS.some(k => d.includes(k));
      };

      const capitalReinvestment = allExpenses
        .filter(e => isRestock(e.description))
        .reduce((sum, e) => sum + safeNum(e.amount), 0);

      const operationalBurn = allExpenses
        .filter(e => !isRestock(e.description))
        .reduce((sum, e) => sum + safeNum(e.amount), 0);

      const totalRevenue = sales.reduce((sum, e) => sum + safeNum(e.amount), 0);
      const totalExpenses = allExpenses.reduce((sum, e) => sum + safeNum(e.amount), 0);
      const cashOnHand = totalRevenue - totalExpenses;

      // 2. 3-Pillar Engine Mapping (Database Driven)
      const PILLARS = {
        Oil: ['oil', 'lube', 'fluid', 'atf', 'lubex'],
        Spares: ['pad', 'filter', 'belt', 'bolt', 'suspension', 'brake', 'hardware', 'gasket', 'engine'],
        Electrical: ['bulb', 'battery', 'fuse', 'relay', 'sensor', 'plug', 'wire', 'light', 'spark']
      };

      const getPillar = (desc: string | null | undefined) => {
        if (!desc) return 'Other';
        const d = String(desc).toLowerCase();
        if (PILLARS.Oil.some(k => d.includes(k))) return 'Oil';
        if (PILLARS.Electrical.some(k => d.includes(k))) return 'Electrical';
        if (PILLARS.Spares.some(k => d.includes(k))) return 'Spares';
        return 'Other';
      };

      // COGS Calculation (Joining with Inventory)
      const cogs = sales.reduce((sum, sale) => {
        const item = inventory.find(i => i.id === sale.inventory_item_id);
        return sum + (safeNum(item?.cost_price) * safeNum(sale.quantity));
      }, 0);

      const netProfit = totalRevenue - (operationalBurn + cogs);

      // Dead Stock Analysis
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const deadStockValue = inventory.reduce((sum, item) => {
        const itemSales = sales.filter(s => s.inventory_item_id === item.id && new Date(s.created_at) >= ninetyDaysAgo);
        if (itemSales.length === 0 && safeNum(item.quantity) > 0) {
          return sum + (safeNum(item.cost_price) * safeNum(item.quantity));
        }
        return sum;
      }, 0);

      const inventoryValue = inventory.reduce((sum, item) => sum + (safeNum(item.cost_price) * safeNum(item.quantity)), 0);

      // 3. Growth Logic: Weighted Daily Average
      const dates = validLedger
        .map(e => e.created_at ? new Date(e.created_at).getTime() : NaN)
        .filter(t => !isNaN(t));
      
      if (dates.length === 0) return defaultAnalytics;

      const minDate = Math.min(...dates);
      const maxDate = Math.max(...dates);
      const daysDiff = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));

      const dailyRevenueActual = totalRevenue / daysDiff;
      const dailyExpensesActual = totalExpenses / daysDiff;
      const dailyProfitActual = dailyRevenueActual - dailyExpensesActual;

      // 4. 5-Horizon Multiplier
      const multiplier: number = {
        daily: 1,
        weekly: 7,
        monthly: 30,
        'semi-annual': 180,
        annual: 365
      }[timeRange] || 30;

      const scaledRevenue = dailyRevenueActual * multiplier;
      const scaledExpenses = dailyExpensesActual * multiplier;
      const scaledProfit = dailyProfitActual * multiplier;

      // Pillar Stats
      const pillarStats = validLedger.reduce((acc, e) => {
        const pillar = getPillar(e.description);
        if (!acc[pillar]) acc[pillar] = { revenue: 0, reinvestment: 0, expense: 0 };
        
        const amount = safeNum(e.amount);
        if (e.transaction_type === 'sale') {
          acc[pillar].revenue += amount;
        } else if (e.transaction_type === 'expense') {
          if (isRestock(e.description)) {
            acc[pillar].reinvestment += amount;
          } else {
            acc[pillar].expense += amount;
          }
        }
        return acc;
      }, {} as Record<string, { revenue: number, reinvestment: number, expense: number }>);

      const categoryHealth = ['Oil', 'Spares', 'Electrical'].map(name => {
        const stats = pillarStats[name] || { revenue: 0, reinvestment: 0, expense: 0 };
        const sRev = (stats.revenue / (daysDiff || 1)) * multiplier;
        const sReinvest = (stats.reinvestment / (daysDiff || 1)) * multiplier;
        const sExp = (stats.expense / (daysDiff || 1)) * multiplier;
        const profit = sRev - (sExp + (sReinvest * 0.1)); // Simplified profit per pillar
        const margin = sRev > 0 ? (profit / sRev) * 100 : 0;
        const status = sRev === 0 ? 'Expansion Opportunity' : (sReinvest > sRev ? 'Asset Reinvestment' : 'Healthy');

        return { name, revenue: sRev, reinvestment: sReinvest, expense: sExp, profit, margin, status };
      }).sort((a, b) => b.revenue - a.revenue);

      // Chart Data
      const pieData = categoryHealth.map(c => ({
        name: c.name,
        value: c.reinvestment
      })).filter(c => c.value > 0);

      const dailyData = validLedger.reduce((acc, e) => {
        if (!e.created_at) return acc;
        const d = new Date(e.created_at);
        if (isNaN(d.getTime())) return acc;
        const date = d.toLocaleDateString();
        if (!acc[date]) acc[date] = { date, revenue: 0, expenses: 0 };
        const amount = safeNum(e.amount);
        if (e.transaction_type === 'sale') acc[date].revenue += amount;
        else if (e.transaction_type === 'expense') acc[date].expenses += amount;
        return acc;
      }, {} as Record<string, any>);

      const trendData = Object.values(dailyData)
        .map((d: any) => ({ ...d, profit: d.revenue - d.expenses }))
        .slice(-15);

      // Risk Mitigation
      const monthlyPayment = Math.max(1, safeNum(loanAmount) / Math.max(1, safeNum(loanDuration)));
      const dscr = monthlyPayment > 0 ? (dailyProfitActual * 30) / monthlyPayment : 100;
      const safeCapacity = Math.max(0, scaledProfit * 0.5);
      const requiredPayment = (monthlyPayment / 30) * multiplier;

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

      // Projections
      const inventoryTurnoverRatio = inventoryValue > 0 ? (dailyRevenueActual * 30) / inventoryValue : 0;
      const projectedMonthlyRevenueIncrease = loanAmount * inventoryTurnoverRatio;
      const growthData = [
        { name: 'Current Path', profit: scaledProfit },
        { name: 'Funded Path', profit: scaledProfit + (projectedMonthlyRevenueIncrease / 30 * multiplier) }
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
        wdaInflow: dailyRevenueActual,
        wdaOutflow: dailyExpensesActual,
        operationalBurn,
        capitalReinvestment,
        inventoryValue,
        deadStockValue,
        cashOnHand,
        stockToSalesRatio: (dailyRevenueActual * 30) > 0 ? inventoryValue / (dailyRevenueActual * 30) : 0,
        inventoryTurnoverRatio,
        fundingMultiplier: inventoryTurnoverRatio,
        projectedMonthlyRevenueIncrease,
        dscr,
        growthPercentage: scaledProfit !== 0 ? ((growthData[1].profit - scaledProfit) / Math.abs(scaledProfit)) * 100 : 0,
        multiplier,
        cogs,
        netProfit
      };
    } catch (err) {
      console.error('Analytics Engine Error:', err);
      setMathError(true);
      return defaultAnalytics;
    }
  }, [ledger, inventory, timeRange, loanAmount, loanDuration, dataLoaded]);

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="vault-card p-12 w-full max-w-md text-center space-y-8">
          <div className="w-20 h-20 bg-[#FFD700]/10 rounded-3xl flex items-center justify-center text-[#FFD700] mx-auto shadow-[0_0_30px_rgba(255,215,0,0.1)]">
            <ShieldCheck size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Vault Access</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Institutional-Grade Intelligence</p>
          </div>
          <form onSubmit={handlePinSubmit} className="space-y-6">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="ENTER PIN"
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-center text-2xl font-black tracking-[0.5em] text-[#FFD700] outline-none focus:border-[#FFD700]/50 transition-all placeholder:text-slate-800"
              autoFocus
            />
            <button type="submit" className="gold-btn w-full py-4 text-xs font-black uppercase tracking-widest">
              Authorize Access
            </button>
          </form>
        </div>
      </div>
    );
  }

  const exportToPDF = async () => {
    if (!analytics) return;
    setIsExporting(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      let currentY = 20;

      // 1. Header (Institutional Grade)
      pdf.setFillColor(10, 10, 10);
      pdf.rect(0, 0, pageWidth, 45, 'F');
      pdf.setTextColor(255, 215, 0);
      pdf.setFontSize(24);
      pdf.setFont('helvetica', 'bold');
      pdf.text('INVESTMENT MEMORANDUM', margin, 25);
      
      pdf.setTextColor(150, 150, 150);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text('STRICTLY PRIVATE & CONFIDENTIAL', margin, 32);
      pdf.text(`REPORT ID: OS-${Math.random().toString(36).substr(2, 9).toUpperCase()}`, margin, 37);
      pdf.text(`GENERATED: ${new Date().toLocaleString()}`, pageWidth - margin, 37, { align: 'right' });

      currentY = 55;

      // Section A: Operational Baseline
      pdf.setTextColor(10, 10, 10);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SECTION A: OPERATIONAL BASELINE (90-DAY WDA)', margin, currentY);
      currentY += 8;

      autoTable(pdf, {
        startY: currentY,
        head: [['Metric', 'Historical Average', 'Analysis']],
        body: [
          ['Weighted Daily Inflow', `$${analytics.wdaInflow.toLocaleString()}`, 'Cash Velocity'],
          ['Weighted Daily Outflow', `$${analytics.wdaOutflow.toLocaleString()}`, 'Operational Burn'],
          ['Inventory Value', `$${analytics.inventoryValue.toLocaleString()}`, 'Liquid Asset Base'],
          ['Stock-to-Sales Ratio', `${analytics.stockToSalesRatio.toFixed(2)}x`, 'Efficiency Correlation']
        ],
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 215, 0] },
        styles: { fontSize: 9, cellPadding: 4 }
      });

      currentY = (pdf as any).lastAutoTable.finalY + 15;

      // Section B: Capital Reinvestment Analysis
      pdf.setFontSize(14);
      pdf.text('SECTION B: CAPITAL REINVESTMENT ANALYSIS', margin, currentY);
      currentY += 8;

      autoTable(pdf, {
        startY: currentY,
        head: [['Pillar', 'Revenue', 'Reinvestment', 'Margin %', 'Asset Growth']],
        body: analytics.categoryHealth
          .filter(cat => ['Oil', 'Spares', 'Electrical'].includes(cat.name))
          .map(cat => [
            cat.name,
            `$${cat.revenue.toLocaleString()}`,
            `$${cat.reinvestment.toLocaleString()}`,
            `${cat.margin.toFixed(1)}%`,
            'Liquid Asset Conversion'
          ]),
        theme: 'striped',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 215, 0] },
        styles: { fontSize: 8 }
      });

      currentY = (pdf as any).lastAutoTable.finalY + 15;

      // Section C: Liquidity & Asset Base
      pdf.setFontSize(14);
      pdf.text('SECTION C: LIQUIDITY & ASSET BASE', margin, currentY);
      currentY += 8;

      autoTable(pdf, {
        startY: currentY,
        head: [['Asset Class', 'Value', 'Liquidity Status']],
        body: [
          ['Cash on Hand', `$${analytics.cashOnHand.toLocaleString()}`, 'Highly Liquid'],
          ['Total Asset Valuation', `$${analytics.inventoryValue.toLocaleString()}`, 'Inventory Base'],
          ['Dead Stock (90 Days)', `$${analytics.deadStockValue.toLocaleString()}`, 'Recovery Opportunity']
        ],
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 215, 0] },
        styles: { fontSize: 9 }
      });

      currentY = (pdf as any).lastAutoTable.finalY + 15;

      // Section D: Financial Position
      pdf.setFontSize(14);
      pdf.text('SECTION D: FINANCIAL POSITION (NET PROFIT)', margin, currentY);
      currentY += 8;

      autoTable(pdf, {
        startY: currentY,
        head: [['Metric', 'Value', 'Formula']],
        body: [
          ['Total Revenue', `$${analytics.scaledRevenue.toLocaleString()}`, 'Gross Inflow'],
          ['Operational Burn', `$${analytics.operationalBurn.toLocaleString()}`, 'Fixed Expenses'],
          ['COGS', `$${analytics.cogs.toLocaleString()}`, 'Variable Cost'],
          ['Net Profit', `$${analytics.netProfit.toLocaleString()}`, 'Rev - (Burn + COGS)']
        ],
        theme: 'striped',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 215, 0] },
        styles: { fontSize: 9 }
      });

      currentY = (pdf as any).lastAutoTable.finalY + 15;

      // Section E: Risk Mitigation (DSCR)
      pdf.setFontSize(14);
      pdf.text('SECTION E: RISK MITIGATION & DSCR', margin, currentY);
      currentY += 8;

      autoTable(pdf, {
        startY: currentY,
        head: [['Risk Factor', 'Value', 'Safety Verdict']],
        body: [
          ['Debt-Service Coverage Ratio (DSCR)', `${analytics.dscr.toFixed(2)}x`, analytics.dscr > 2 ? 'Institutional Safe' : 'Standard'],
          ['Safe Repayment Capacity', `$${analytics.safeCapacity.toLocaleString()}`, '50% Profit Buffer'],
          ['Monthly Loan Obligation', `$${(analytics.requiredPayment / (analytics.multiplier / 30)).toLocaleString()}`, 'Fixed Commitment']
        ],
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 215, 0] },
        styles: { fontSize: 9 }
      });

      currentY = (pdf as any).lastAutoTable.finalY + 15;

      // Section F: Simulated ROI
      pdf.setFontSize(14);
      pdf.text('SECTION F: SIMULATED ROI & FUNDING MULTIPLIER', margin, currentY);
      currentY += 5;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`"Based on a current Inventory Turnover Ratio of ${analytics.inventoryTurnoverRatio.toFixed(2)}, an infusion of $${loanAmount.toLocaleString()} is mathematically projected to generate $${analytics.projectedMonthlyRevenueIncrease.toLocaleString()} in additional Monthly Revenue."`, margin, currentY + 5, { maxWidth: pageWidth - (margin * 2) });
      
      currentY += 15;

      // Charts
      const chartElements = document.querySelectorAll('.recharts-wrapper');
      if (chartElements.length > 0) {
        for (let i = 0; i < Math.min(chartElements.length, 2); i++) {
          const chart = chartElements[i] as HTMLElement;
          const canvas = await html2canvas(chart, {
            scale: 1.5,
            backgroundColor: '#0a0a0a',
            logging: false
          });
          const imgData = canvas.toDataURL('image/png', 0.7);
          const imgWidth = (pageWidth - (margin * 2)) / 2 - 5;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          
          pdf.addImage(imgData, 'PNG', margin + (i * (imgWidth + 10)), currentY, imgWidth, imgHeight);
        }
      }

      // Footer
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text('This document is generated by Retail-OS Growth Engine. All projections are based on historical ledger data.', pageWidth / 2, 285, { align: 'center' });

      // Blob Download
      const pdfBlob = pdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Investment_Memorandum_${new Date().getTime()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('PDF Export Error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (mathError) {
    return (
      <div className="vault-card p-12 text-center max-w-lg mx-auto mt-10 border-[#FFD700]/20">
        <RefreshCw className="text-[#FFD700] mx-auto mb-6 animate-spin" size={48} />
        <h3 className="text-white font-black uppercase tracking-tighter text-xl mb-2">Data Recalculating</h3>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">The Growth Engine is re-aligning financial vectors. Please wait...</p>
        <button onClick={() => { setMathError(false); fetchData(); }} className="gold-btn w-full py-4 min-h-[48px]">Force Re-Sync</button>
      </div>
    );
  }

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="vault-card p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <DollarSign size={80} className="text-[#FFD700]" />
            </div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Projected Revenue</p>
            <h3 className="text-3xl font-black text-white tracking-tighter">
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
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Operational Burn</p>
            <h3 className="text-3xl font-black text-white tracking-tighter">
              ${analytics.operationalBurn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-slate-500">
              <ShieldCheck size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Real Expenses</span>
            </div>
          </div>

          <div className="vault-card p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <RefreshCw size={80} className="text-amber-500" />
            </div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Capital Reinvestment</p>
            <h3 className="text-3xl font-black text-white tracking-tighter">
              ${analytics.capitalReinvestment.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-amber-500">
              <CheckCircle2 size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Asset Conversion</span>
            </div>
          </div>

          <div className="vault-card p-8 relative overflow-hidden group border-[#FFD700]/30 bg-[#FFD700]/5">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Zap size={80} className="text-[#FFD700]" />
            </div>
            <p className="text-[#FFD700] text-[10px] font-black uppercase tracking-widest mb-2">Net Profit</p>
            <h3 className="text-3xl font-black text-white tracking-tighter">
              ${analytics.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-[#FFD700]">
              <Target size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Capital Surplus</span>
            </div>
          </div>
        </div>

        {/* Liquidity Analysis Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="vault-card p-6 border-white/5 bg-white/[0.02]">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Cash on Hand</p>
            <h4 className="text-2xl font-black text-white tracking-tighter">${analytics.cashOnHand.toLocaleString()}</h4>
            <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-[60%]" />
            </div>
          </div>
          <div className="vault-card p-6 border-white/5 bg-white/[0.02]">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Total Asset Valuation</p>
            <h4 className="text-2xl font-black text-white tracking-tighter">${analytics.inventoryValue.toLocaleString()}</h4>
            <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-[#FFD700] w-[85%]" />
            </div>
          </div>
          <div className="vault-card p-6 border-rose-500/20 bg-rose-500/5">
            <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mb-1">Dead Stock Opportunity</p>
            <h4 className="text-2xl font-black text-white tracking-tighter">${analytics.deadStockValue.toLocaleString()}</h4>
            <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 w-[20%]" />
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
                  <XAxis 
                    dataKey="date" 
                    stroke="#4a4a4a" 
                    fontSize={10} 
                    tickFormatter={(v) => {
                      if (!v || typeof v !== 'string') return '';
                      const parts = v.split(/[/.-]/);
                      if (parts.length < 2) return v;
                      return `${parts[0]}/${parts[1]}`;
                    }} 
                  />
                  <YAxis stroke="#4a4a4a" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '12px' }} />
                  <Line type="monotone" dataKey="profit" stroke="#FFD700" strokeWidth={3} dot={{ fill: '#FFD700', r: 4 }} />
                  <Line type="monotone" dataKey="restock" stroke="#C0C0C0" strokeWidth={2} strokeDasharray="5 5" dot={false} />
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
              {isExporting ? (
                <>
                  <RefreshCw className="animate-spin" size={18} />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>Export Executive Report</span>
                </>
              )}
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
                * Based on a current Inventory Turnover Ratio of {analytics.inventoryTurnoverRatio.toFixed(2)}, an infusion of ${loanAmount.toLocaleString()} is mathematically projected to generate ${analytics.projectedMonthlyRevenueIncrease.toLocaleString()} in additional Monthly Revenue.
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
                      cat.status === 'Healthy' ? "bg-emerald-500/10 text-emerald-500" : 
                      cat.status === 'Expansion Opportunity' ? "bg-[#FFD700]/10 text-[#FFD700]" :
                      "bg-amber-500/10 text-amber-500"
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
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Asset Reinvestment</p>
                    <p className="text-amber-500 font-bold text-xs">${cat.reinvestment.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
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
