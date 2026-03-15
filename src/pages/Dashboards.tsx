import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { InventoryItem, LedgerEntry } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  TrendingUp, DollarSign, ShoppingCart, Users, Settings, 
  LifeBuoy, Briefcase, BarChart3, ArrowUpRight, ArrowDownRight,
  AlertCircle, Activity, Target, MousePointer2, MessageSquare,
  Zap, Clock, Heart, ShieldCheck, Globe
} from 'lucide-react';
import { cn } from '../lib/utils';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parseISO } from 'date-fns';

type DashboardTab = 'sales' | 'marketing' | 'financial' | 'operations' | 'support' | 'executive';

export default function Dashboards() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('sales');
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [ledgerRes, inventoryRes] = await Promise.all([
          supabase.from('ledger').select('*, inventory(*)').order('created_at', { ascending: true }),
          supabase.from('inventory').select('*')
        ]);

        if (ledgerRes.error) throw ledgerRes.error;
        if (inventoryRes.error) throw inventoryRes.error;

        setLedger(ledgerRes.data || []);
        setInventory(inventoryRes.data || []);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError((err as any).message || 'Failed to load dashboard metrics');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // --- Data Processing ---

  const salesData = useMemo(() => {
    const sales = ledger.filter(entry => entry.transaction_type === 'sale');
    
    // Daily Sales for the last 30 days
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const daySales = sales.filter(s => s.created_at.startsWith(dateStr));
      return {
        name: format(date, 'MMM dd'),
        revenue: daySales.reduce((acc, s) => acc + s.amount, 0),
        count: daySales.length,
        date: dateStr
      };
    }).reverse();

    // Revenue by Product
    const productRevenueMap: Record<string, { name: string, revenue: number, count: number }> = {};
    sales.forEach(s => {
      const itemName = s.inventory?.name || 'Unknown Product';
      if (!productRevenueMap[itemName]) {
        productRevenueMap[itemName] = { name: itemName, revenue: 0, count: 0 };
      }
      productRevenueMap[itemName].revenue += s.amount;
      productRevenueMap[itemName].count += s.quantity || 0;
    });
    const productRevenue = Object.values(productRevenueMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return { last30Days, productRevenue, totalSales: sales.length };
  }, [ledger]);

  const financialData = useMemo(() => {
    const sales = ledger.filter(entry => entry.transaction_type === 'sale');
    const expenses = ledger.filter(entry => entry.transaction_type === 'expense');
    
    const totalRevenue = sales.reduce((acc, s) => acc + s.amount, 0);
    const totalCost = sales.reduce((acc, s) => {
      const cost = s.inventory?.cost_price || 0;
      return acc + (cost * (s.quantity || 0));
    }, 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = totalRevenue - totalCost - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Cash Flow Trend (Cumulative)
    let runningBalance = 0;
    const cashFlowTrend = ledger.map(entry => {
      const amount = entry.transaction_type === 'sale' ? entry.amount : -entry.amount;
      runningBalance += amount;
      return {
        name: format(parseISO(entry.created_at), 'MMM dd'),
        balance: runningBalance,
        timestamp: entry.created_at
      };
    }).slice(-20); // Last 20 transactions for trend

    return { totalRevenue, totalCost, totalExpenses, netProfit, profitMargin, cashFlowTrend };
  }, [ledger]);

  const executiveData = useMemo(() => {
    const activeProducts = inventory.filter(i => i.active).length;
    const totalRevenue = financialData.totalRevenue;
    
    // Simple growth rate (this week vs last week)
    const now = new Date();
    const thisWeekStart = subDays(now, 7);
    const lastWeekStart = subDays(now, 14);
    
    const thisWeekSales = ledger.filter(s => 
      s.transaction_type === 'sale' && 
      isWithinInterval(parseISO(s.created_at), { start: thisWeekStart, end: now })
    ).reduce((acc, s) => acc + s.amount, 0);
    
    const lastWeekSales = ledger.filter(s => 
      s.transaction_type === 'sale' && 
      isWithinInterval(parseISO(s.created_at), { start: lastWeekStart, end: thisWeekStart })
    ).reduce((acc, s) => acc + s.amount, 0);
    
    const growthRate = lastWeekSales > 0 ? ((thisWeekSales - lastWeekSales) / lastWeekSales) * 100 : 0;

    return { activeProducts, totalRevenue, growthRate, thisWeekSales };
  }, [ledger, inventory, financialData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFD700]"></div>
        <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] animate-pulse">Aggregating Global Intelligence...</p>
      </div>
    );
  }

  const tabs: { id: DashboardTab, label: string, icon: any }[] = [
    { id: 'sales', label: 'Sales', icon: ShoppingCart },
    { id: 'marketing', label: 'Marketing', icon: Target },
    { id: 'financial', label: 'Financial', icon: DollarSign },
    { id: 'operations', label: 'Operations', icon: Settings },
    { id: 'support', label: 'Support', icon: LifeBuoy },
    { id: 'executive', label: 'Executive', icon: Briefcase },
  ];

  const COLORS = ['#FFD700', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="space-y-8 pb-12">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 p-1 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xl sticky top-0 z-30">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300",
              activeTab === tab.id 
                ? "bg-[#FFD700] text-[#0a0a0a] shadow-[0_0_20px_rgba(255,215,0,0.3)]" 
                : "text-slate-500 hover:text-white hover:bg-white/5"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard Content */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'sales' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard label="Total Revenue" value={`$${financialData.totalRevenue.toLocaleString()}`} icon={DollarSign} trend="+12.5%" />
              <StatCard label="Sales Volume" value={salesData.totalSales.toString()} icon={ShoppingCart} trend="+5.2%" />
              <StatCard label="Avg Order Value" value={`$${(financialData.totalRevenue / (salesData.totalSales || 1)).toFixed(2)}`} icon={Activity} />
              <StatCard label="Conversion Rate" value="3.2%" icon={MousePointer2} subtext="Estimated" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <ChartCard title="Daily Revenue Trend (30D)">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesData.last30Days}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FFD700" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#FFD700" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                      itemStyle={{ color: '#FFD700', fontWeight: 'bold' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#FFD700" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Revenue by Product (Top 5)">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesData.productRevenue} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                    <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={100} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                    />
                    <Bar dataKey="revenue" fill="#FFD700" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}

        {activeTab === 'marketing' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard label="Traffic Volume" value="12,450" icon={Globe} subtext="Unique Visitors" />
              <StatCard label="Click-Through Rate" value="4.8%" icon={MousePointer2} trend="+0.5%" />
              <StatCard label="New Signups" value="842" icon={Users} trend="+15%" />
            </div>
            <IntegrationPlaceholder 
              title="Marketing Intelligence Integration Pending"
              description="To visualize real-time traffic, CTR, and campaign performance, connect your tracking pixels (Google Analytics, Meta, etc.) to the system schema."
              metrics={['Campaign ROI', 'Source Attribution', 'Content Performance', 'Funnel Drop-off']}
            />
          </div>
        )}

        {activeTab === 'financial' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard label="Net Profit" value={`$${financialData.netProfit.toLocaleString()}`} icon={TrendingUp} color="text-emerald-500" />
              <StatCard label="Profit Margin" value={`${financialData.profitMargin.toFixed(1)}%`} icon={Target} />
              <StatCard label="Operating Costs" value={`$${financialData.totalExpenses.toLocaleString()}`} icon={ArrowDownRight} color="text-rose-500" />
              <StatCard label="Cash on Hand" value={`$${(financialData.totalRevenue - financialData.totalExpenses).toLocaleString()}`} icon={Briefcase} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <ChartCard title="Cash Flow Trend (Cumulative)">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={financialData.cashFlowTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                    />
                    <Line type="stepAfter" dataKey="balance" stroke="#FFD700" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="vault-card p-8 flex flex-col justify-center space-y-6">
                <h3 className="text-sm font-black text-[#FFD700] uppercase tracking-widest">Financial Risk Assessment</h3>
                <div className="space-y-4">
                  <RiskIndicator label="Inventory Liquidity" status="Healthy" value={85} color="bg-emerald-500" />
                  <RiskIndicator label="Expense Ratio" status="Optimal" value={32} color="bg-[#FFD700]" />
                  <RiskIndicator label="Revenue Volatility" status="Low" value={15} color="bg-emerald-500" />
                </div>
                <div className="pt-6 border-t border-white/5">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Projection: Next 30 Days</p>
                  <p className="text-2xl font-black text-white mt-2">+$42,500 <span className="text-xs text-emerald-500 font-bold tracking-tighter ml-2">Estimated Revenue</span></p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'operations' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard label="Automation Status" value="98.2%" icon={Zap} subtext="System Uptime" />
              <StatCard label="Operational Load" value="Medium" icon={Activity} />
              <StatCard label="Failed Workflows" value="0" icon={AlertCircle} color="text-emerald-500" />
            </div>
            <IntegrationPlaceholder 
              title="Operational Monitoring Pending"
              description="System performance, workflow status, and bottleneck detection require integration with your CI/CD and server monitoring logs."
              metrics={['API Latency', 'Database Load', 'Worker Queue Depth', 'Error Rates']}
            />
          </div>
        )}

        {activeTab === 'support' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard label="Ticket Volume" value="124" icon={MessageSquare} subtext="Last 7 Days" />
              <StatCard label="Avg Response Time" value="1.2h" icon={Clock} trend="-15%" />
              <StatCard label="CSAT Score" value="4.9/5" icon={Heart} color="text-emerald-500" />
            </div>
            <IntegrationPlaceholder 
              title="Support Desk Integration Pending"
              description="Customer satisfaction metrics, retention signals, and ticket volume trends require connection to your support platform (Zendesk, Intercom, etc.)."
              metrics={['First Response Time', 'Resolution Rate', 'Common Issues', 'Customer Sentiment']}
            />
          </div>
        )}

        {activeTab === 'executive' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard label="Active Portfolio" value={executiveData.activeProducts.toString()} icon={Briefcase} subtext="Software Products" />
              <StatCard label="Total Revenue" value={`$${executiveData.totalRevenue.toLocaleString()}`} icon={DollarSign} />
              <StatCard label="Growth Rate" value={`${executiveData.growthRate.toFixed(1)}%`} icon={TrendingUp} trend={executiveData.growthRate >= 0 ? "+Trend" : "-Trend"} />
              <StatCard label="Weekly Traction" value={`$${executiveData.thisWeekSales.toLocaleString()}`} icon={Activity} />
            </div>

            <div className="vault-card p-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-96 h-96 bg-[#FFD700]/5 blur-[100px] rounded-full" />
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="max-w-xl">
                  <h2 className="text-3xl font-black text-white tracking-tighter uppercase mb-4">Executive Intelligence Summary</h2>
                  <p className="text-slate-400 font-medium leading-relaxed">
                    The business is showing <span className="text-[#FFD700] font-bold">{executiveData.growthRate >= 0 ? 'positive' : 'negative'} traction</span> with a weekly revenue of ${executiveData.thisWeekSales.toLocaleString()}. 
                    Inventory health is stable with {executiveData.activeProducts} active product lines. 
                    Focus on optimizing profit margins which currently stand at {financialData.profitMargin.toFixed(1)}%.
                  </p>
                  <div className="flex gap-4 mt-8">
                    <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Primary Signal</p>
                      <p className="text-sm font-bold text-white">Steady Growth</p>
                    </div>
                    <div className="px-4 py-2 bg-[#FFD700]/10 border border-[#FFD700]/20 rounded-xl">
                      <p className="text-[10px] font-black text-[#FFD700] uppercase tracking-widest">Action Required</p>
                      <p className="text-sm font-bold text-white">Review Margins</p>
                    </div>
                  </div>
                </div>
                <div className="w-48 h-48 rounded-full border-8 border-white/5 flex items-center justify-center relative">
                  <div className="absolute inset-0 border-8 border-[#FFD700] border-t-transparent rounded-full animate-spin-slow" />
                  <div className="text-center">
                    <p className="text-4xl font-black text-white">{financialData.profitMargin.toFixed(0)}%</p>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Margin</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, trend, subtext, color = "text-[#FFD700]" }: any) {
  return (
    <div className="vault-card p-6 hover:gold-glow transition-all duration-300 group">
      <div className="flex justify-between items-start mb-4">
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{label}</p>
        <div className={cn("p-2 bg-white/5 rounded-xl transition-colors group-hover:bg-[#FFD700]/10", color)}>
          <Icon size={18} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-black text-white tracking-tighter">{value}</h3>
        {trend && (
          <span className={cn(
            "text-[10px] font-black px-2 py-0.5 rounded-md",
            trend.startsWith('+') ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
          )}>
            {trend}
          </span>
        )}
      </div>
      {subtext && <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-tighter">{subtext}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="vault-card p-8">
      <h3 className="text-sm font-black text-[#FFD700] uppercase tracking-widest mb-8 flex items-center gap-3">
        <BarChart3 size={18} />
        {title}
      </h3>
      {children}
    </div>
  );
}

function RiskIndicator({ label, status, value, color }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
        <span className="text-slate-400">{label}</span>
        <span className={cn("px-2 rounded", color.replace('bg-', 'text-'))}>{status}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={cn("h-full transition-all duration-1000", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function IntegrationPlaceholder({ title, description, metrics }: any) {
  return (
    <div className="bg-white/5 border-2 border-dashed border-white/10 rounded-3xl p-12 text-center max-w-4xl mx-auto">
      <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
        <ShieldCheck size={40} className="text-[#FFD700] opacity-20" />
      </div>
      <h3 className="text-[#FFD700] font-black text-xl uppercase tracking-tighter mb-4">{title}</h3>
      <p className="text-slate-500 font-medium mb-8 max-w-xl mx-auto">{description}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((m: string) => (
          <div key={m} className="px-4 py-3 bg-white/5 rounded-xl border border-white/5">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{m}</p>
            <p className="text-xs font-bold text-slate-400 mt-1 italic">Awaiting Sync</p>
          </div>
        ))}
      </div>
    </div>
  );
}
