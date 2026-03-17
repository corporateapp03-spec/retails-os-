import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Package, 
  DollarSign, 
  PieChart as PieChartIcon, 
  Download,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  ArrowRight,
  FileText,
  Calendar
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { InventoryItem, LedgerEntry, BusinessSummary } from '../types';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend 
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [summaries, setSummaries] = useState<BusinessSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Projection Manual Inputs
  const [partnerA, setPartnerA] = useState(40);
  const [partnerB, setPartnerB] = useState(40);
  const [reinvestment, setReinvestment] = useState(20);
  const [reportTimeframe, setReportTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'semi-annual' | 'annual'>('monthly');
  const [isGeneratingInvestorReport, setIsGeneratingInvestorReport] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [invRes, ledRes, sumRes] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('ledger').select('*').order('created_at', { ascending: false }),
        supabase.from('business_summary').select('*')
      ]);

      if (invRes.error) throw invRes.error;
      if (ledRes.error) throw ledRes.error;
      if (sumRes.error) throw sumRes.error;

      setInventory(invRes.data || []);
      setLedger(ledRes.data || []);
      setSummaries(sumRes.data || []);
    } catch (err) {
      console.error('Error fetching report data:', err);
      setError('Failed to load executive data.');
    } finally {
      setLoading(false);
    }
  }

  // 1. Data Analytics Engine (Read-Only)
  const analytics = useMemo(() => {
    if (summaries.length === 0) return null;

    const totalRevenue = summaries.reduce((acc, s) => acc + (s.total_revenue || 0), 0);
    const totalExpenses = summaries.reduce((acc, s) => acc + (s.total_expenses || 0), 0);
    const netProfit = summaries.reduce((acc, s) => acc + (s.total_profit || 0), 0);

    const assetValuation = inventory.reduce((acc, item) => acc + (item.cost_price * item.quantity), 0);
    const cashOnHand = netProfit; // Use total profit as available cash

    // Inventory Velocity
    const salesEntries = ledger.filter(l => l.transaction_type === 'sale');
    
    // Calculate Velocity (Sales per day over last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentSales = salesEntries.filter(l => new Date(l.created_at) > thirtyDaysAgo);
    const salesVelocity = recentSales.length / 30;

    // 1. Marketing: Demand Velocity (Trending Categories)
    const categoryVelocity: Record<string, number> = {};
    recentSales.forEach(sale => {
      const item = inventory.find(i => i.id === sale.inventory_item_id);
      const cat = item?.category || 'Uncategorized';
      categoryVelocity[cat] = (categoryVelocity[cat] || 0) + (sale.quantity || 1);
    });
    const demandVelocity = Object.entries(categoryVelocity)
      .map(([name, velocity]) => ({ name, velocity }))
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 5);

    // 2. Financial: Revenue vs Cost + Profit Margin
    const totalCostOfGoodsSold = salesEntries.reduce((acc, sale) => {
      const item = inventory.find(i => i.id === sale.inventory_item_id);
      return acc + ((item?.cost_price || 0) * (sale.quantity || 1));
    }, 0);
    const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCostOfGoodsSold) / totalRevenue) * 100 : 0;

    // 3. Operations: Operational Load (Transactions per day)
    const dailyLoad: Record<string, number> = {};
    recentSales.forEach(sale => {
      const date = new Date(sale.created_at).toISOString().split('T')[0];
      dailyLoad[date] = (dailyLoad[date] || 0) + 1;
    });
    const operationalLoad = Object.values(dailyLoad).reduce((acc, count) => acc + count, 0) / 30;

    // 4. Support: Refund/Return Proxy
    const refundEntries = ledger.filter(l => 
      l.transaction_type === 'expense' && 
      (l.description?.toLowerCase().includes('refund') || l.description?.toLowerCase().includes('return'))
    );
    const refundCount = refundEntries.length;

    // 5. Executive: Growth Rate
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const previousPeriodSales = salesEntries.filter(l => {
      const d = new Date(l.created_at);
      return d > sixtyDaysAgo && d <= thirtyDaysAgo;
    });
    const currentPeriodRevenue = recentSales.reduce((acc, s) => acc + (s.amount || 0), 0);
    const previousPeriodRevenue = previousPeriodSales.reduce((acc, s) => acc + (s.amount || 0), 0);
    const growthRate = previousPeriodRevenue > 0 ? ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 : 0;

    // 6. Executive: Total Asset Valuation
    const totalAssetValuation = assetValuation + netProfit;

    const itemSalesCount: Record<string, number> = {};
    salesEntries.forEach(s => {
      if (s.inventory_item_id) {
        itemSalesCount[s.inventory_item_id] = (itemSalesCount[s.inventory_item_id] || 0) + (s.quantity || 1);
      }
    });

    const fastMoving = Object.entries(itemSalesCount)
      .map(([id, count]) => ({
        id,
        count,
        name: inventory.find(i => i.id === id)?.name || 'Unknown'
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const deadStock = inventory.filter(item => {
      const hasRecentSales = ledger.some(l => 
        l.inventory_item_id === item.id && 
        l.transaction_type === 'sale' && 
        new Date(l.created_at) > thirtyDaysAgo
      );
      return !hasRecentSales;
    })
    .sort((a, b) => (b.cost_price * b.quantity) - (a.cost_price * a.quantity))
    .slice(0, 15);

    const deadStockValue = deadStock.reduce((acc, item) => acc + (item.cost_price * item.quantity), 0);
    const deadStockRatio = assetValuation > 0 ? (deadStockValue / assetValuation) : 0;

      return {
        totalRevenue,
        totalExpenses,
        netProfit,
        assetValuation,
        cashOnHand,
        fastMoving,
        deadStock,
        deadStockValue,
        deadStockRatio,
        salesVelocity,
        demandVelocity,
        totalCostOfGoodsSold,
        profitMargin,
        operationalLoad,
        refundCount,
        growthRate,
        totalAssetValuation
      };
    }, [summaries, inventory, ledger]);

  const handlePartnerAChange = (val: number) => {
    const newA = Math.max(0, Math.min(100, val));
    setPartnerA(newA);
    // Auto-adjust reinvestment to keep total 100 if possible, or just let user fix it
    const remaining = 100 - newA - partnerB;
    setReinvestment(Math.max(0, remaining));
  };

  const handlePartnerBChange = (val: number) => {
    const newB = Math.max(0, Math.min(100, val));
    setPartnerB(newB);
    const remaining = 100 - partnerA - newB;
    setReinvestment(Math.max(0, remaining));
  };

  const handleReinvestmentChange = (val: number) => {
    const newR = Math.max(0, Math.min(100, val));
    setReinvestment(newR);
    const remaining = 100 - partnerA - newR;
    // This one is trickier, maybe just let user adjust
  };

  const distributionData = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: 'Partner A', value: (analytics.netProfit * partnerA) / 100, color: '#10b981' },
      { name: 'Partner B', value: (analytics.netProfit * partnerB) / 100, color: '#3b82f6' },
      { name: 'Reinvestment', value: (analytics.netProfit * reinvestment) / 100, color: '#f59e0b' },
    ];
  }, [analytics, partnerA, partnerB, reinvestment]);

  const generatePDF = () => {
    if (!analytics) return;

    try {
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(22);
      doc.setTextColor(10, 10, 10); // Dark Charcoal
      doc.text('Executive Financial Position Report', 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

      // Gold Accent Line
      doc.setDrawColor(255, 215, 0);
      doc.setLineWidth(1);
      doc.line(14, 35, 196, 35);

      // Financial Positions Section
      doc.setFontSize(16);
      doc.setTextColor(10, 10, 10);
      doc.text('1. Financial Positions & Performance', 14, 45);
      
      autoTable(doc, {
        startY: 50,
        head: [['Financial Metric', 'Value']],
        body: [
          ['Total Revenue', `$${analytics.totalRevenue.toLocaleString()}`],
          ['Total Expenses', `$${analytics.totalExpenses.toLocaleString()}`],
          ['Net Profit (Summary Pool)', `$${analytics.netProfit.toLocaleString()}`],
          ['Cash on Hand (Liquidity)', `$${analytics.cashOnHand.toLocaleString()}`],
          ['Total Asset Valuation (Combined)', `$${analytics.totalAssetValuation.toLocaleString()}`],
          ['Profit Margin', `${analytics.profitMargin.toFixed(1)}%`],
          ['Sales Velocity (30d)', `${analytics.salesVelocity.toFixed(2)} sales/day`],
          ['Growth Rate (MoM)', `${analytics.growthRate.toFixed(1)}%`],
          ['Refund/Return Count', `${analytics.refundCount}`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [10, 10, 10], textColor: [255, 215, 0] }
      });

      // 1.5 Strategic Intelligence
      let finalY0 = (doc as any).lastAutoTable.finalY;
      doc.setFontSize(16);
      doc.text('1.5 Strategic Intelligence Modules', 14, finalY0 + 15);
      
      autoTable(doc, {
        startY: finalY0 + 20,
        head: [['Module', 'Key Insight', 'Metric']],
        body: [
          ['Marketing', 'Demand Velocity (Top Category)', analytics.demandVelocity[0]?.name || 'N/A'],
          ['Operations', 'Operational Load', `${analytics.operationalLoad.toFixed(2)} tx/day`],
          ['Operations', 'Dead Stock Value', `$${analytics.deadStockValue.toLocaleString()}`],
          ['Support', 'Return Proxy Count', analytics.refundCount.toString()],
          ['Executive', 'Growth Rate', `${analytics.growthRate.toFixed(1)}%`],
          ['Executive', 'Total Asset Valuation', `$${analytics.totalAssetValuation.toLocaleString()}`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [255, 215, 0], textColor: [0, 0, 0] }
      });

      // 2. Distribution Plan
      let finalY = (doc as any).lastAutoTable.lastAutoTable ? (doc as any).lastAutoTable.finalY : (doc as any).lastAutoTable.finalY;
      doc.setFontSize(16);
      doc.text('2. Distribution Plan', 14, finalY + 15);
      
      autoTable(doc, {
        startY: finalY + 20,
        head: [['Entity', 'Percentage', 'Calculated Amount']],
        body: [
          ['Partner A', `${partnerA}%`, `$${((analytics.netProfit * partnerA) / 100).toLocaleString()}`],
          ['Partner B', `${partnerB}%`, `$${((analytics.netProfit * partnerB) / 100).toLocaleString()}`],
          ['Reinvestment', `${reinvestment}%`, `$${((analytics.netProfit * reinvestment) / 100).toLocaleString()}`],
          ['TOTAL POOL', '100%', `$${analytics.netProfit.toLocaleString()}`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        foot: [['Total', `${partnerA + partnerB + reinvestment}%`, `$${((analytics.netProfit * (partnerA + partnerB + reinvestment)) / 100).toLocaleString()}`]],
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }
      });

      // 3. Inventory Velocity - Fast Moving
      let finalY2 = (doc as any).lastAutoTable.finalY;
      doc.setFontSize(16);
      doc.text('3. Top 15 Fast-Moving Items', 14, finalY2 + 15);
      
      autoTable(doc, {
        startY: finalY2 + 20,
        head: [['Rank', 'Item Name', 'Sales Volume (Total)']],
        body: analytics.fastMoving.map((i, idx) => [idx + 1, i.name, i.count]),
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] } // emerald-500
      });

      // 4. Inventory Velocity - Dead Stock
      let finalY3 = (doc as any).lastAutoTable.finalY;
      
      // Check if we need a new page
      if (finalY3 > 220) {
        doc.addPage();
        finalY3 = 20;
      }

      doc.setFontSize(16);
      doc.text('4. Top 15 Dead Stock Items (30 Days Stagnant)', 14, finalY3 + 15);
      
      autoTable(doc, {
        startY: finalY3 + 20,
        head: [['Rank', 'Item Name', 'Quantity', 'Value (Cost)']],
        body: analytics.deadStock.map((i, idx) => [
          idx + 1, 
          i.name, 
          i.quantity, 
          `$${(i.cost_price * i.quantity).toLocaleString()}`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [239, 68, 68] } // red-500
      });

      doc.save(`Executive_Financial_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      alert('Failed to generate PDF. Check console for details.');
    }
  };

  const generateInvestorReport = () => {
    setIsGeneratingInvestorReport(true);
    try {
      const doc = new jsPDF();
      const now = new Date();
      let startDate = new Date();

      switch (reportTimeframe) {
        case 'daily': startDate.setDate(now.getDate() - 1); break;
        case 'weekly': startDate.setDate(now.getDate() - 7); break;
        case 'monthly': startDate.setMonth(now.getMonth() - 1); break;
        case 'semi-annual': startDate.setMonth(now.getMonth() - 6); break;
        case 'annual': startDate.setFullYear(now.getFullYear() - 1); break;
      }

      const filteredSales = ledger.filter(l => 
        l.transaction_type === 'sale' && 
        new Date(l.created_at) >= startDate
      );

      // Group by Category
      const categorySales: Record<string, { revenue: number, items: number, transactions: number }> = {};
      
      filteredSales.forEach(sale => {
        const item = inventory.find(i => i.id === sale.inventory_item_id);
        const categoryName = item?.category || 'Uncategorized';
        
        if (!categorySales[categoryName]) {
          categorySales[categoryName] = { revenue: 0, items: 0, transactions: 0 };
        }
        
        categorySales[categoryName].revenue += (sale.amount || 0);
        categorySales[categoryName].items += (sale.quantity || 1);
        categorySales[categoryName].transactions += 1;
      });

      // Header
      doc.setFontSize(24);
      doc.setTextColor(15, 23, 42);
      doc.text('Investor-Grade Sales Analysis', 14, 25);
      
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Reporting Period: ${startDate.toLocaleDateString()} - ${now.toLocaleDateString()} (${reportTimeframe.toUpperCase()})`, 14, 35);
      doc.text(`Generated for: Strategic Investment & Loan Assessment`, 14, 42);

      // Executive Summary Table
      const totalRevenue = Object.values(categorySales).reduce((acc, c) => acc + c.revenue, 0);
      const totalItems = Object.values(categorySales).reduce((acc, c) => acc + c.items, 0);
      const totalTransactions = Object.values(categorySales).reduce((acc, c) => acc + c.transactions, 0);

      autoTable(doc, {
        startY: 55,
        head: [['Metric', 'Consolidated Value']],
        body: [
          ['Total Gross Revenue', `$${totalRevenue.toLocaleString()}`],
          ['Total Units Sold', totalItems.toLocaleString()],
          ['Transaction Volume', totalTransactions.toLocaleString()],
          ['Average Transaction Value', `$${(totalTransactions > 0 ? totalRevenue / totalTransactions : 0).toLocaleString()}`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });

      // Category Breakdown
      let finalY = (doc as any).lastAutoTable.finalY;
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text('Sales Performance by Category', 14, finalY + 15);

      autoTable(doc, {
        startY: finalY + 20,
        head: [['Category', 'Units Sold', 'Transactions', 'Revenue Contribution', '% of Total']],
        body: Object.entries(categorySales).map(([name, data]) => [
          name,
          data.items.toLocaleString(),
          data.transactions.toLocaleString(),
          `$${data.revenue.toLocaleString()}`,
          `${((data.revenue / totalRevenue) * 100).toFixed(1)}%`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] }
      });

      // Verification Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('Confidential Document - For Authorized Use Only. Data sourced from RetailOS Ledger.', 14, pageHeight - 10);
      doc.text(`Timestamp: ${now.toISOString()}`, 160, pageHeight - 10);

      doc.save(`Investor_Sales_Report_${reportTimeframe}_${now.toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Investor Report Error:', err);
      alert('Failed to generate investor report.');
    } finally {
      setIsGeneratingInvestorReport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFD700]"></div>
      </div>
    );
  }

  if (!analytics || analytics.totalRevenue === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <BarChart3 size={64} className="text-slate-800 mb-4" />
        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Insufficient Data for Analysis</h2>
        <p className="text-slate-500 mt-2 max-w-md text-sm font-medium">
          We need more sales and ledger data to generate an executive report. Start processing sales in the POS to see insights here.
        </p>
      </div>
    );
  }

  const totalPercentage = partnerA + partnerB + reinvestment;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Executive Intelligence</h1>
          <p className="text-slate-500 font-medium">Business performance, financial health, and strategic projections.</p>
        </div>
        <button 
          onClick={generatePDF}
          className="flex items-center gap-2 bg-[#FFD700] text-[#0a0a0a] px-6 py-3 rounded-2xl hover:bg-[#FFD700]/90 transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)] font-black uppercase tracking-widest text-xs"
        >
          <Download size={20} />
          Generate Executive Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="vault-card p-6 group hover:gold-glow transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl border border-emerald-500/20">
              <TrendingUp size={24} />
            </div>
            <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20 uppercase tracking-widest">
              P&L
            </span>
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Net Profit (Summary)</p>
          <h3 className="text-2xl font-black text-white mt-1 group-hover:gold-text transition-colors">
            ${analytics.netProfit.toLocaleString()}
          </h3>
        </div>

        <div className="vault-card p-6 group hover:gold-glow transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/20">
              <BarChart3 size={24} />
            </div>
            <span className="text-[10px] font-black text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full border border-blue-500/20 uppercase tracking-widest">
              Growth
            </span>
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Growth Rate (MoM)</p>
          <h3 className="text-2xl font-black text-white mt-1 group-hover:gold-text transition-colors">
            {analytics.growthRate.toFixed(1)}%
          </h3>
        </div>

        <div className="vault-card p-6 group hover:gold-glow transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-500/10 text-purple-500 rounded-xl border border-purple-500/20">
              <Package size={24} />
            </div>
            <span className="text-[10px] font-black text-purple-500 bg-purple-500/10 px-2 py-1 rounded-full border border-purple-500/20 uppercase tracking-widest">
              Valuation
            </span>
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Total Asset Valuation</p>
          <h3 className="text-2xl font-black text-white mt-1 group-hover:gold-text transition-colors">
            ${analytics.totalAssetValuation.toLocaleString()}
          </h3>
        </div>

        <div className="vault-card p-6 group hover:gold-glow transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20">
              <AlertTriangle size={24} />
            </div>
            {analytics.deadStockRatio > 0.3 ? (
              <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-1 rounded-full border border-rose-500/20 uppercase tracking-widest">
                High Risk
              </span>
            ) : (
              <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20 uppercase tracking-widest">
                Monitoring
              </span>
            )}
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Dead Stock Ratio</p>
          <h3 className="text-2xl font-black text-white mt-1 group-hover:gold-text transition-colors">
            {(analytics.deadStockRatio * 100).toFixed(1)}%
          </h3>
        </div>
      </div>

      {/* Strategic Intelligence Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Marketing: Demand Velocity */}
        <div className="vault-card p-6 border-l-4 border-[#FFD700]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[#FFD700]/10 text-[#FFD700] rounded-lg">
              <TrendingUp size={20} />
            </div>
            <h3 className="font-black text-white uppercase tracking-tighter">Marketing: Demand Velocity</h3>
          </div>
          <div className="space-y-4">
            {analytics.demandVelocity.map((cat, idx) => (
              <div key={cat.name} className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-bold">{cat.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#FFD700]" 
                      style={{ width: `${(cat.velocity / (analytics.demandVelocity[0]?.velocity || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-[#FFD700]">{cat.velocity} units</span>
                </div>
              </div>
            ))}
            {analytics.demandVelocity.length === 0 && (
              <p className="text-xs text-slate-600 italic">No recent category data available.</p>
            )}
          </div>
        </div>

        {/* Financial: Profit Margin & Revenue vs Cost */}
        <div className="vault-card p-6 border-l-4 border-emerald-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <DollarSign size={20} />
            </div>
            <h3 className="font-black text-white uppercase tracking-tighter">Financial: Profit Health</h3>
          </div>
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center py-2">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-white/5"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={364.4}
                    strokeDashoffset={364.4 - (364.4 * Math.min(100, analytics.profitMargin)) / 100}
                    className="text-emerald-500 transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-white">{analytics.profitMargin.toFixed(1)}%</span>
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Margin</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Revenue</p>
                <p className="text-sm font-black text-white">${analytics.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">COGS</p>
                <p className="text-sm font-black text-rose-500">${analytics.totalCostOfGoodsSold.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Operations: Load & Dead Stock */}
        <div className="vault-card p-6 border-l-4 border-blue-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
              <Package size={20} />
            </div>
            <h3 className="font-black text-white uppercase tracking-tighter">Operations: Efficiency</h3>
          </div>
          <div className="space-y-6">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Operational Load</p>
                <span className="text-xs font-black text-blue-500">{analytics.operationalLoad.toFixed(2)} tx/day</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500" 
                  style={{ width: `${Math.min(100, (analytics.operationalLoad / 50) * 100)}%` }}
                />
              </div>
            </div>
            <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
              <div className="flex items-center gap-2 text-rose-500 font-black text-[10px] mb-1 uppercase tracking-widest">
                <AlertTriangle size={14} />
                Dead Stock Detector
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                <span className="text-rose-500 font-black">{analytics.deadStock.length} items</span> have zero movement. 
                Capital locked: <span className="text-white font-black">${analytics.deadStockValue.toLocaleString()}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Support: Refund/Return Proxy */}
        <div className="vault-card p-6 border-l-4 border-rose-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg">
              <CheckCircle2 size={20} />
            </div>
            <h3 className="font-black text-white uppercase tracking-tighter">Support: Satisfaction</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-4">
            <div className="text-4xl font-black text-white mb-2">{analytics.refundCount}</div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 text-center">Refund/Return Events (Ledger Proxy)</p>
            <div className="w-full p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2">Satisfaction Index</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500" 
                    style={{ width: `${Math.max(0, 100 - (analytics.refundCount * 2))}%` }}
                  />
                </div>
                <span className="text-[10px] font-black text-emerald-500">{Math.max(0, 100 - (analytics.refundCount * 2))}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Executive: Growth & Valuation */}
        <div className="vault-card p-6 border-l-4 border-purple-500 md:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <h3 className="font-black text-white uppercase tracking-tighter">Executive: Strategic Position</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Growth Trajectory</p>
              <div className="flex items-end gap-3">
                <div className="text-4xl font-black text-white">{analytics.growthRate.toFixed(1)}%</div>
                <div className={cn(
                  "flex items-center gap-1 text-xs font-black mb-1 px-2 py-0.5 rounded-full",
                  analytics.growthRate >= 0 ? "text-emerald-500 bg-emerald-500/10" : "text-rose-500 bg-rose-500/10"
                )}>
                  {analytics.growthRate >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {analytics.growthRate >= 0 ? 'Expansion' : 'Contraction'}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">Month-over-Month revenue comparison based on ledger sales data.</p>
            </div>
            <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Enterprise Value</p>
              <div className="text-4xl font-black text-[#FFD700]">${analytics.totalAssetValuation.toLocaleString()}</div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Assets: ${analytics.assetValuation.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Profit: ${analytics.netProfit.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Investor-Grade Sales Reports Card */}
        <div className="lg:col-span-3 vault-card overflow-hidden">
          <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#FFD700] text-[#0a0a0a] rounded-xl shadow-[0_0_20px_rgba(255,215,0,0.2)]">
                <FileText size={20} />
              </div>
              <div>
                <h2 className="font-black text-white uppercase tracking-tighter">Investor-Grade Sales Analysis</h2>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Generate detailed sales performance reports for loan applications and investors.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
              {(['daily', 'weekly', 'monthly', 'semi-annual', 'annual'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setReportTimeframe(t)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    reportTimeframe === t 
                      ? "bg-white/10 text-[#FFD700] shadow-sm border border-white/10" 
                      : "text-slate-600 hover:text-slate-400"
                  )}
                >
                  {t.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Target Period</p>
                  <div className="flex items-center gap-2 text-white font-black uppercase tracking-tighter">
                    <Calendar size={16} className="text-[#FFD700]" />
                    <span>Last {reportTimeframe.replace('-', ' ')}</span>
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Report Purpose</p>
                  <div className="flex items-center gap-2 text-white font-black uppercase tracking-tighter">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span>Strategic Investment</span>
                  </div>
                </div>
              </div>
              <div className="bg-[#FFD700]/5 border border-[#FFD700]/10 p-4 rounded-2xl">
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  This report provides a consolidated view of sales grouped by category, including revenue contribution percentages and unit volume. It is designed to meet the documentation standards required for business loan assessments and investor due diligence.
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-4">
              <button 
                onClick={generateInvestorReport}
                disabled={isGeneratingInvestorReport}
                className="w-full flex items-center justify-center gap-3 bg-[#FFD700] text-[#0a0a0a] px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#FFD700]/90 transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)] disabled:opacity-50"
              >
                {isGeneratingInvestorReport ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current" />
                ) : (
                  <>
                    <Download size={20} />
                    Download Investor Report
                  </>
                )}
              </button>
              <p className="text-[10px] text-center text-slate-600 font-black uppercase tracking-widest">
                Format: PDF • Standard: Financial Grade
              </p>
            </div>
          </div>
        </div>

        {/* Projection Tool */}
        <div className="lg:col-span-2 vault-card overflow-hidden flex flex-col">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
            <div className="flex items-center gap-2">
              <PieChartIcon className="text-slate-500" size={20} />
              <h2 className="font-black text-white uppercase tracking-tighter">Projection & Distribution</h2>
            </div>
            {totalPercentage !== 100 && (
              <span className="text-[10px] font-black text-rose-500 flex items-center gap-1 uppercase tracking-widest">
                <AlertTriangle size={12} />
                Total must be 100%
              </span>
            )}
          </div>
          <div className="p-8 flex-1 grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Partner A Split (%)</label>
                  <span className="text-xs font-black text-emerald-500">
                    ${((analytics.netProfit * partnerA) / 100).toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <input 
                    type="number" 
                    value={partnerA}
                    onChange={(e) => handlePartnerAChange(parseInt(e.target.value) || 0)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-black text-white focus:border-[#FFD700]/50 outline-none transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 font-black">%</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Partner B Split (%)</label>
                  <span className="text-xs font-black text-blue-500">
                    ${((analytics.netProfit * partnerB) / 100).toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <input 
                    type="number" 
                    value={partnerB}
                    onChange={(e) => handlePartnerBChange(parseInt(e.target.value) || 0)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-black text-white focus:border-[#FFD700]/50 outline-none transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 font-black">%</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reinvestment (%)</label>
                  <span className="text-xs font-black text-amber-500">
                    ${((analytics.netProfit * reinvestment) / 100).toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <input 
                    type="number" 
                    value={reinvestment}
                    onChange={(e) => setReinvestment(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-black text-white focus:border-[#FFD700]/50 outline-none transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 font-black">%</div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] text-slate-600 uppercase tracking-widest font-black">
                    {totalPercentage === 100 ? (
                      <CheckCircle2 size={14} className="text-emerald-500" />
                    ) : (
                      <AlertTriangle size={14} className="text-rose-500" />
                    )}
                    Total: {totalPercentage}%
                  </div>
                  <button 
                    onClick={() => {
                      setPartnerA(40);
                      setPartnerB(40);
                      setReinvestment(20);
                    }}
                    className="text-[10px] font-black text-slate-600 hover:text-[#FFD700] uppercase tracking-widest transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <div className="h-[300px] flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `$${value.toLocaleString()}`}
                    contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="text-center mt-4">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Profit Pool</p>
                <p className="text-xl font-black text-white">${analytics.netProfit.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Inventory Velocity */}
        <div className="vault-card overflow-hidden flex flex-col">
          <div className="p-6 border-b border-white/5 bg-white/5">
            <h2 className="font-black text-white uppercase tracking-tighter">Inventory Velocity</h2>
          </div>
          <div className="p-6 space-y-6 flex-1">
            <div>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Fast-Moving (Top 5)</h3>
              <div className="space-y-3">
                {analytics.fastMoving.map((item, idx) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group hover:border-[#FFD700]/30 transition-all">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-white/5 rounded-full text-[10px] font-black text-slate-500 border border-white/10 group-hover:text-[#FFD700]">
                        0{idx + 1}
                      </span>
                      <span className="text-xs font-black text-slate-400 truncate max-w-[120px] uppercase tracking-tighter group-hover:text-white transition-colors">{item.name}</span>
                    </div>
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{item.count} sold</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-white/5">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Dead Stock Analysis</h3>
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-amber-500 font-black text-[10px] mb-1 uppercase tracking-widest">
                  <AlertTriangle size={16} />
                  {analytics.deadStock.length} Items Stagnant
                </div>
                <p className="text-[10px] text-amber-500/70 leading-relaxed font-medium uppercase tracking-tighter">
                  These items have had zero sales in the last 30 days, tying up 
                  <span className="font-black text-amber-500"> ${analytics.deadStockValue.toLocaleString()}</span> in capital.
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white/5 border-t border-white/5">
            <button className="w-full flex items-center justify-center gap-2 text-[10px] font-black text-slate-600 hover:text-[#FFD700] transition-colors uppercase tracking-widest">
              View Full Health
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
