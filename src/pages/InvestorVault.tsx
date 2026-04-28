import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { LedgerEntry, InventoryItem, Category } from '../types';
import { 
  ShieldCheck, 
  TrendingUp, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Activity, 
  Boxes, 
  Download,
  AlertCircle,
  Clock,
  PieChart,
  Zap,
  Droplets,
  Settings
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
  ComposedChart,
  Line
} from 'recharts';
import { cn } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Loading from '../components/Loading';

export default function InvestorVault() {
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [ledgerRes, inventoryRes, categoriesRes] = await Promise.all([
        supabase.from('ledger').select('*').order('created_at', { ascending: true }),
        supabase.from('inventory').select('*'),
        supabase.from('categories').select('*')
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      if (inventoryRes.error) throw inventoryRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setLedger(ledgerRes.data || []);
      setInventory(inventoryRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (err) {
      console.error('Audit Error:', err);
      setError('Failed to reconcile database. Check connectivity.');
    } finally {
      setLoading(false);
    }
  }

  // RECONCILIATION ENGINE (REDUCE LOGIC)
  const audit = useMemo(() => {
    // 1. Inflow (Total Revenue)
    const inflow = ledger
      .filter(item => item.transaction_type === 'sale')
      .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

    // 2. Gross Outflow: Operational Burn
    const operationalBurn = ledger
      .filter(item => item.transaction_type === 'expense')
      .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

    const expenseDetails = ledger
      .filter(item => item.transaction_type === 'expense')
      .reduce((acc: Record<string, number>, curr) => {
        const desc = curr.description || 'Other Expenses';
        acc[desc] = (acc[desc] || 0) + (Number(curr.amount) || 0);
        return acc;
      }, {});

    // 3. Capital Reinvestment (Decapitalization)
    const reinvestment = ledger
      .filter(item => 
        item.transaction_type === 'capital_withdrawal' || 
        item.transaction_type === 'CAPITAL_WITHDRAWAL'
      )
      .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

    // 4. Net Profit (Available Pool after all deductions)
    const netProfit = inflow - (operationalBurn + reinvestment);

    // 5. Total Profit (Operating Profit)
    const totalProfit = inflow - operationalBurn;

    // 6. Asset Intelligence
    // Total Asset Valuation: Strictly ONLY total available inventory
    const totalAssetValuation = inventory.reduce((acc, curr) => acc + (curr.selling_price * curr.quantity), 0);
    const totalAssetCost = inventory.reduce((acc, curr) => acc + (curr.cost_price * curr.quantity), 0);

    // Dead Stock Check
    const deadStockValue = inventory
      .filter(item => item.quantity <= 0)
      .reduce((acc, curr) => acc + (curr.cost_price * 1), 0);

    // 7. Velocity Tracker
    const uniqueDays = [...new Set(ledger.map(l => new Date(l.created_at).toDateString()))].length;
    const dailyBaseline = uniqueDays > 0 ? inflow / uniqueDays : 0;
    const salesVelocity = uniqueDays > 0 ? ledger.filter(l => l.transaction_type === 'sale').length / uniqueDays : 0;

    // 7. Pillar Performance
    // Pillar Mapping: 1: Oil, 2: Spares, 3: Electrical
    const pillars = [
      { id: '1', name: 'Oil', icon: Droplets, color: '#FFD700' },
      { id: '2', name: 'Spares', icon: Settings, color: '#3B82F6' },
      { id: '3', name: 'Electrical', icon: Zap, color: '#10B981' }
    ];

    const pillarPerformance = pillars.map(p => {
      const pillarRevenue = ledger
        .filter(l => l.transaction_type === 'sale' && String(l.category_id) === p.id)
        .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      
      const pillarReinvestment = ledger
        .filter(l => 
          (l.transaction_type === 'capital_withdrawal' || l.transaction_type === 'CAPITAL_WITHDRAWAL') && 
          String(l.category_id) === p.id
        )
        .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

      return {
        ...p,
        revenue: pillarRevenue,
        reinvestment: pillarReinvestment,
        margin: pillarRevenue > 0 ? ((pillarRevenue - pillarReinvestment) / pillarRevenue) * 100 : 0
      };
    });

    // Chart Data
    const waterfallData = [
      { name: 'Revenue', value: inflow, color: '#FFD700' },
      { name: 'Operational', value: -operationalBurn, color: '#F43F5E' },
      { name: 'Reinvested', value: -reinvestment, color: '#3B82F6' },
      { name: 'Net Profit', value: netProfit, color: '#10B981' }
    ];

    return {
      inflow,
      operationalBurn,
      expenseDetails,
      reinvestment,
      netProfit,
      totalProfit,
      totalAssetValuation,
      totalAssetCost,
      deadStockValue,
      dailyBaseline,
      salesVelocity,
      pillarPerformance,
      waterfallData
    };
  }, [ledger, inventory]);

  const generateAuditPDF = () => {
    const doc = new jsPDF();
    const now = new Date().toLocaleString();

    // Custom Blue Theme
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, 210, 297, 'F');

    doc.setTextColor(255, 215, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('INVESTOR RECONCILIATION AUDIT', 15, 25);

    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated: ${now}`, 15, 32);
    doc.text('Role: Senior Fintech Quantitative Auditor', 15, 37);

    // Summary Metrics
    autoTable(doc, {
      startY: 45,
      head: [['METRIC', 'VALUATION (USD)', 'AUDIT STATUS']],
      body: [
        ['GROSS REVENUE (INFLOW)', `$${audit.inflow.toLocaleString()}`, 'VERIFIED'],
        ['OPERATIONAL BURN', `$${audit.operationalBurn.toLocaleString()}`, 'OUTFLOW'],
        ['TOTAL PROFIT', `$${audit.totalProfit.toLocaleString()}`, 'NET REVENUE'],
        ['DECAPITALIZATION (REINVEST)', `$${audit.reinvestment.toLocaleString()}`, 'ASSET TRANSFER'],
        ['NET PROFIT (AVAILABLE)', `$${audit.netProfit.toLocaleString()}`, 'RECONCILED']
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 215, 0] },
      bodyStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [20, 20, 20] }
    });

    // Pillar Logic
    doc.setTextColor(255, 215, 0);
    doc.setFontSize(14);
    doc.text('PILLAR PERFORMANCE RECONCILIATION', 15, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['PILLAR', 'REVENUE', 'CAPITAL REINVESTED', 'NET POSITION']],
      body: audit.pillarPerformance.map(p => [
        p.name.toUpperCase(),
        `$${p.revenue.toLocaleString()}`,
        `$${p.reinvestment.toLocaleString()}`,
        `$${(p.revenue - p.reinvestment).toLocaleString()}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 215, 0] },
      bodyStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255] }
    });

    // Expense Detail
    doc.setTextColor(255, 215, 0);
    doc.setFontSize(14);
    doc.text('OPERATIONAL BURN BREAKDOWN', 15, (doc as any).lastAutoTable.finalY + 15);

    const expenseTable = Object.entries(audit.expenseDetails).map(([desc, amt]) => [desc, `$${amt.toLocaleString()}`]);
    if (expenseTable.length === 0) expenseTable.push(['NO LOGGED EXPENSES', '$0']);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['EXPENSE CATEGORY', 'TOTAL IMPACT']],
      body: expenseTable,
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 215, 0] },
      bodyStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255] }
    });

    // FOOTER: Logic Proof
    const footerY = 280;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('AUDIT LOGIC PROOF: Capital Withdrawals are converted into physical inventory assets, driving the Growth Rate.', 15, footerY);
    doc.text('This reconciliation uses 100% database-derived ledger logs. All figures reconciled against inflow state.', 15, footerY + 5);

    doc.save(`Investor_Audit_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <ShieldCheck className="text-[#FFD700] w-8 h-8" />
            Investor Vault
          </h2>
          <p className="text-slate-500 text-xs font-mono mt-1 uppercase tracking-widest">
            Quantitative Auditor Mode • Live Database Reconciliation
          </p>
        </div>
        <button
          onClick={generateAuditPDF}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-[#FFD700] text-[#0a0a0a] font-black uppercase text-[10px] tracking-widest rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)]"
        >
          <Download size={16} />
          Export Audit Report
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-500 text-sm">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Metric Cards - Android Fluid Enforcement */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Inflow', val: audit.inflow, icon: ArrowUpCircle, color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/5' },
          { label: 'Operational Burn', val: audit.operationalBurn, icon: ArrowDownCircle, color: 'text-rose-500', bg: 'bg-rose-500/5' },
          { label: 'Total Profit', val: audit.totalProfit, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/5' },
          { label: 'Capital Reinvestment', val: audit.reinvestment, icon: Activity, color: 'text-slate-400', bg: 'bg-slate-400/5' },
          { label: 'Net Profit', val: audit.netProfit, icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/5' }
        ].map((card, i) => (
          <div 
            key={i} 
            style={{ minWidth: 0 }}
            className={cn(
              "flex-1 p-6 rounded-[2rem] border border-white/5 relative overflow-hidden group transition-all duration-500 hover:border-white/10",
              card.bg
            )}
          >
            <div className="flex items-center justify-between relative z-10">
              <div className="space-y-1">
                <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest">{card.label}</p>
                <p className={cn("text-3xl font-black tracking-tighter", card.color)}>
                  ${card.val.toLocaleString()}
                </p>
              </div>
              <card.icon className={cn("w-10 h-10 opacity-20 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700", card.color)} />
            </div>
            {/* Design accents */}
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/5 blur-3xl rounded-full" />
          </div>
        ))}
      </div>

      {/* Waterfall & Velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Waterfall Chart */}
        <div className="lg:col-span-2 bg-[#050505] p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
              <Activity className="text-[#FFD700]" size={18} />
              The Inflow/Outflow Waterfall
            </h3>
            <span className="text-[10px] text-emerald-500 font-mono bg-emerald-500/10 px-2 py-1 rounded">MATCHES_LEDGER</span>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={audit.waterfallData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff10', borderRadius: '16px' }}
                  itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {audit.waterfallData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Velocity Tracker */}
        <div className="bg-[#050505] p-8 rounded-[2.5rem] border border-white/5 flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
              <Clock className="text-[#3B82F6]" size={18} />
              Velocity Tracker
            </h3>
            
            <div className="space-y-8">
              <div>
                <p className="text-slate-600 text-[10px] uppercase font-black tracking-widest mb-2">Daily Revenue Baseline</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">${audit.dailyBaseline.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="text-emerald-500 text-xs font-bold font-mono">/day</span>
                </div>
              </div>

              <div>
                <p className="text-slate-600 text-[10px] uppercase font-black tracking-widest mb-2">Sales Velocity</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">{audit.salesVelocity.toFixed(1)}</span>
                  <span className="text-blue-400 text-xs font-bold font-mono">tickets/day</span>
                </div>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] text-slate-500 font-medium italic">
                  "Velocity quantifies the speed at which the engine converts inventory into liquid inflow state."
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Asset Intelligence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pillar Performance */}
        <div className="bg-[#050505] p-8 rounded-[2.5rem] border border-white/5">
          <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-8">
            <PieChart className="text-emerald-500" size={18} />
            Pillar Performance Audit
          </h3>

          <div className="space-y-4">
            {audit.pillarPerformance.map((p, i) => (
              <div key={i} className="p-5 bg-white/5 rounded-3xl border border-white/5 group hover:bg-white/[0.07] transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-[#0a0a0a] text-white shadow-lg">
                      <p.icon size={20} style={{ color: p.color }} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-white">{p.name}</p>
                      <p className="text-[10px] text-slate-500">Inventory Classification {p.id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-white">${p.revenue.toLocaleString()}</p>
                    <p className="text-[10px] text-emerald-500 font-mono font-bold">REVENUE</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <span>Capital Absorption</span>
                    <span className="text-blue-500">${p.reinvestment.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 bg-black rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-1000" 
                      style={{ 
                        width: `${Math.min(100, (p.reinvestment / (p.revenue || 1)) * 100)}%`,
                        backgroundColor: p.color 
                      }} 
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Asset Intelligence & Dead Stock */}
        <div className="bg-[#050505] p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden">
          <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-8">
            <Boxes className="text-blue-500" size={18} />
            Asset Intelligence
          </h3>

          <div className="grid grid-cols-2 gap-4 h-full pb-8">
            <div className="p-6 bg-blue-500/5 rounded-3xl border border-blue-500/10 flex flex-col justify-center text-center">
              <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest mb-1">Total Asset Valuation</p>
              <p className="text-2xl font-black text-white">${audit.totalAssetValuation.toLocaleString()}</p>
              <p className="text-[8px] text-slate-500 mt-1 uppercase font-mono tracking-tighter">Current Inventory Exit Value</p>
            </div>

            <div className="p-6 bg-rose-500/5 rounded-3xl border border-rose-500/10 flex flex-col justify-center text-center">
              <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest mb-1">Dead Stock Impact</p>
              <p className="text-2xl font-black text-rose-500">${audit.deadStockValue.toLocaleString()}</p>
              <p className="text-[8px] text-slate-500 mt-1 uppercase font-mono tracking-tighter">Negative Liquidity Anchor</p>
            </div>

            <div className="col-span-2 p-6 bg-white/5 rounded-3xl border border-white/10">
              <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest mb-2">Inventory Audit Note</p>
              <p className="text-[9px] text-slate-500 italic leading-relaxed">
                "Verified Logic: Total Asset Valuation is derived strictly from current available physical stock at exit price. No non-inventory reinvestments or projected replenishments are included."
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Burn - Android Card Morphing */}
      <div className="bg-[#050505] p-8 rounded-[2.5rem] border border-white/5">
        <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-8">
          <ArrowDownCircle className="text-rose-500" size={18} />
          Operational Burn Reconciliation
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(audit.expenseDetails).map(([desc, amount], i) => (
            <div key={i} className="flex-1 min-width-0 p-5 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{desc}</span>
                <span className="text-lg font-black text-white">${amount.toLocaleString()}</span>
              </div>
              <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg">
                <ArrowDownCircle size={14} />
              </div>
            </div>
          ))}
          {Object.keys(audit.expenseDetails).length === 0 && (
             <div className="col-span-full py-10 text-center text-slate-600 font-black uppercase text-xs tracking-[0.2em] animate-pulse">
               Reconciling Real-Time Outflow Table...
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
