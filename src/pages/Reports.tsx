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
import 'jspdf-autotable';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [summaries, setSummaries] = useState<BusinessSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Projection Sliders
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
    const netProfit = totalRevenue - totalExpenses;

    const assetValuation = inventory.reduce((acc, item) => acc + (item.cost_price * item.quantity), 0);
    const cashOnHand = summaries.reduce((acc, s) => acc + (s.total_profit || 0), 0); // Profit is available cash

    // Inventory Velocity
    const salesEntries = ledger.filter(l => l.transaction_type === 'sale');
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
      .slice(0, 5);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deadStock = inventory.filter(item => {
      const hasRecentSales = ledger.some(l => 
        l.inventory_item_id === item.id && 
        l.transaction_type === 'sale' && 
        new Date(l.created_at) > thirtyDaysAgo
      );
      return !hasRecentSales;
    });

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
      deadStockRatio
    };
  }, [summaries, inventory, ledger]);

  const handleSliderChange = (type: 'A' | 'B' | 'R', value: number) => {
    if (type === 'A') {
      const remaining = 100 - value;
      const ratio = partnerB + reinvestment === 0 ? 0.5 : partnerB / (partnerB + reinvestment);
      setPartnerA(value);
      setPartnerB(Math.round(remaining * ratio));
      setReinvestment(100 - value - Math.round(remaining * ratio));
    } else if (type === 'B') {
      const remaining = 100 - value;
      const ratio = partnerA + reinvestment === 0 ? 0.5 : partnerA / (partnerA + reinvestment);
      setPartnerB(value);
      setPartnerA(Math.round(remaining * ratio));
      setReinvestment(100 - value - Math.round(remaining * ratio));
    } else {
      const remaining = 100 - value;
      const ratio = partnerA + partnerB === 0 ? 0.5 : partnerA / (partnerA + partnerB);
      setReinvestment(value);
      setPartnerA(Math.round(remaining * ratio));
      setPartnerB(100 - value - Math.round(remaining * ratio));
    }
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

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Executive Business Report', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    // P&L Section
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text('1. Profit & Loss Statement', 14, 45);
    
    (doc as any).autoTable({
      startY: 50,
      head: [['Metric', 'Amount']],
      body: [
        ['Total Revenue', `$${analytics.totalRevenue.toLocaleString()}`],
        ['Total Expenses', `$${analytics.totalExpenses.toLocaleString()}`],
        ['Net Profit', `$${analytics.netProfit.toLocaleString()}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    // Distribution Section
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(16);
    doc.text('2. Distribution Plan', 14, finalY + 15);
    
    (doc as any).autoTable({
      startY: finalY + 20,
      head: [['Entity', 'Percentage', 'Projected Amount']],
      body: [
        ['Partner A', `${partnerA}%`, `$${((analytics.netProfit * partnerA) / 100).toLocaleString()}`],
        ['Partner B', `${partnerB}%`, `$${((analytics.netProfit * partnerB) / 100).toLocaleString()}`],
        ['Reinvestment', `${reinvestment}%`, `$${((analytics.netProfit * reinvestment) / 100).toLocaleString()}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }
    });

    // Inventory Health
    const finalY2 = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(16);
    doc.text('3. Inventory Health', 14, finalY2 + 15);
    
    doc.setFontSize(12);
    doc.text(`Total Asset Valuation: $${analytics.assetValuation.toLocaleString()}`, 14, finalY2 + 25);
    doc.text(`Dead Stock Value: $${analytics.deadStockValue.toLocaleString()} (${(analytics.deadStockRatio * 100).toFixed(1)}%)`, 14, finalY2 + 32);

    doc.setFontSize(14);
    doc.text('Fast-Moving Items (Top 5)', 14, finalY2 + 45);
    (doc as any).autoTable({
      startY: finalY2 + 50,
      head: [['Item Name', 'Sales Volume']],
      body: analytics.fastMoving.map(i => [i.name, i.count]),
      theme: 'plain'
    });

    doc.save(`Executive_Report_${new Date().toISOString().split('T')[0]}.pdf`);
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
          <p className="text-slate-500 text-sm font-medium">Net Profit</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">
            ${analytics.netProfit.toLocaleString()}
          </h3>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <DollarSign size={24} />
            </div>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
              Liquidity
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">Cash on Hand</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">
            ${analytics.cashOnHand.toLocaleString()}
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
          </div>
          <div className="p-8 flex-1 grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-slate-700">Partner A Split</label>
                  <span className="text-sm font-bold text-emerald-600">{partnerA}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={partnerA}
                  onChange={(e) => handleSliderChange('A', parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-slate-700">Partner B Split</label>
                  <span className="text-sm font-bold text-blue-600">{partnerB}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={partnerB}
                  onChange={(e) => handleSliderChange('B', parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-slate-700">Reinvestment</label>
                  <span className="text-sm font-bold text-amber-600">{reinvestment}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={reinvestment}
                  onChange={(e) => handleSliderChange('R', parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-50">
                <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider font-bold">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  Total Distribution: 100%
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
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Future Slice</p>
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
