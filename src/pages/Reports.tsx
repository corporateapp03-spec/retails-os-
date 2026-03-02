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
  ArrowRight
} from 'lucide-react';
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
      salesVelocity
    };
  }, [summaries, inventory, ledger]);

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
      doc.setTextColor(15, 23, 42); 
      doc.text('Executive Financial Position Report', 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

      // Financial Positions Section
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text('1. Financial Positions & Performance', 14, 45);
      
      autoTable(doc, {
        startY: 50,
        head: [['Financial Metric', 'Value']],
        body: [
          ['Total Revenue', `$${analytics.totalRevenue.toLocaleString()}`],
          ['Total Expenses', `$${analytics.totalExpenses.toLocaleString()}`],
          ['Net Profit (Summary Pool)', `$${analytics.netProfit.toLocaleString()}`],
          ['Cash on Hand (Liquidity)', `$${analytics.cashOnHand.toLocaleString()}`],
          ['Total Asset Valuation (Inventory)', `$${analytics.assetValuation.toLocaleString()}`],
          ['Sales Velocity (30d)', `${analytics.salesVelocity.toFixed(2)} sales/day`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });

      // 2. Distribution Plan
      let finalY = (doc as any).lastAutoTable.finalY;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!analytics || analytics.totalRevenue === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <BarChart3 size={64} className="text-slate-200 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Insufficient Data for Analysis</h2>
        <p className="text-slate-500 mt-2 max-w-md">
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
          <h1 className="text-3xl font-bold text-slate-900">Executive Intelligence</h1>
          <p className="text-slate-500">Business performance, financial health, and strategic projections.</p>
        </div>
        <button 
          onClick={generatePDF}
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
        >
          <Download size={20} />
          Generate Executive Report
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp size={24} />
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
              P&L
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">Net Profit (Summary)</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">
            ${analytics.netProfit.toLocaleString()}
          </h3>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <BarChart3 size={24} />
            </div>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
              Velocity
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">Sales Velocity</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">
            {analytics.salesVelocity.toFixed(2)} <span className="text-sm font-normal text-slate-400">/day</span>
          </h3>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Package size={24} />
            </div>
            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
              Assets
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">Inventory Value</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">
            ${analytics.assetValuation.toLocaleString()}
          </h3>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <AlertTriangle size={24} />
            </div>
            {analytics.deadStockRatio > 0.3 ? (
              <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                High Risk
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                Monitoring
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm font-medium">Dead Stock Ratio</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">
            {(analytics.deadStockRatio * 100).toFixed(1)}%
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Projection Tool */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChartIcon className="text-slate-400" size={20} />
              <h2 className="font-bold text-slate-900">Projection & Distribution Tool</h2>
            </div>
            {totalPercentage !== 100 && (
              <span className="text-xs font-bold text-red-500 flex items-center gap-1">
                <AlertTriangle size={12} />
                Total must be 100% (Current: {totalPercentage}%)
              </span>
            )}
          </div>
          <div className="p-8 flex-1 grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Partner A Split (%)</label>
                  <span className="text-xs font-bold text-emerald-600">
                    ${((analytics.netProfit * partnerA) / 100).toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <input 
                    type="number" 
                    value={partnerA}
                    onChange={(e) => setPartnerA(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Partner B Split (%)</label>
                  <span className="text-xs font-bold text-blue-600">
                    ${((analytics.netProfit * partnerB) / 100).toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <input 
                    type="number" 
                    value={partnerB}
                    onChange={(e) => setPartnerB(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reinvestment (%)</label>
                  <span className="text-xs font-bold text-amber-600">
                    ${((analytics.netProfit * reinvestment) / 100).toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <input 
                    type="number" 
                    value={reinvestment}
                    onChange={(e) => setReinvestment(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider font-bold">
                    {totalPercentage === 100 ? (
                      <CheckCircle2 size={14} className="text-emerald-500" />
                    ) : (
                      <AlertTriangle size={14} className="text-red-500" />
                    )}
                    Total: {totalPercentage}%
                  </div>
                  <button 
                    onClick={() => {
                      setPartnerA(40);
                      setPartnerB(40);
                      setReinvestment(20);
                    }}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-900 uppercase tracking-widest"
                  >
                    Reset to Default
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
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `$${value.toLocaleString()}`}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="text-center mt-4">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Profit Pool</p>
                <p className="text-xl font-bold text-slate-900">${analytics.netProfit.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Inventory Velocity */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Inventory Velocity</h2>
          </div>
          <div className="p-6 space-y-6 flex-1">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Fast-Moving (Top 5)</h3>
              <div className="space-y-3">
                {analytics.fastMoving.map((item, idx) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-white rounded-full text-[10px] font-bold text-slate-400 border border-slate-100">
                        0{idx + 1}
                      </span>
                      <span className="text-sm font-bold text-slate-700 truncate max-w-[120px]">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-600">{item.count} sold</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Dead Stock Analysis</h3>
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-sm mb-1">
                  <AlertTriangle size={16} />
                  {analytics.deadStock.length} Items Stagnant
                </div>
                <p className="text-xs text-amber-600 leading-relaxed">
                  These items have had zero sales in the last 30 days, tying up 
                  <span className="font-bold"> ${analytics.deadStockValue.toLocaleString()}</span> in capital.
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100">
            <button className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors">
              View Full Inventory Health
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
