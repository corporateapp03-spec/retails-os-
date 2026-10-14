import React, { useState, useEffect, useMemo } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { InventoryItem } from '../types';
import { 
  CreditSale, 
  CreditSaleItem, 
  CreditPayment, 
  CreditReminder, 
  DebtDashboardMetrics 
} from '../types/debtPos';
import { 
  fetchCreditSales, 
  createCreditSale, 
  recordCreditPayment, 
  cancelCreditSale, 
  recordAndLaunchSmsReminder, 
  computeDebtDashboardMetrics, 
  calculateDueStatus, 
  formatTZS, 
  safeNum, 
  checkCreditTablesExist,
  postFullyPaidToSalesArchive,
  subscribeToDebtPosRealtime
} from '../lib/debtPosService';
import { 
  CreditCard, 
  Wallet, 
  DollarSign, 
  AlertCircle, 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Search, 
  Plus, 
  Check, 
  X, 
  ChevronRight, 
  ArrowUpRight, 
  Send, 
  MessageSquare, 
  ShieldAlert, 
  CheckCircle2, 
  History, 
  FileText, 
  RefreshCw, 
  Activity, 
  Database, 
  Copy, 
  ExternalLink,
  Package,
  Layers,
  Sparkles,
  AlertTriangle,
  Receipt,
  BadgeAlert,
  Loader2,
  Tag
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

type DebtPosTab = 
  | 'dashboard' 
  | 'new-sale' 
  | 'outstanding' 
  | 'payments' 
  | 'due-today' 
  | 'overdue' 
  | 'completed' 
  | 'reminders';

export default function DebtPOS() {
  const [activeTab, setActiveTab] = useState<DebtPosTab>('dashboard');
  const [sales, setSales] = useState<CreditSale[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tablesExist, setTablesExist] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selected Debt for View / Payment / SMS
  const [selectedSale, setSelectedSale] = useState<CreditSale | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Search and Filters
  const [searchTerm, setSearchTerm] = useState('');

  // New Credit Sale Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [saleCart, setSaleCart] = useState<Array<{
    item: InventoryItem;
    quantity: number;
    customPrice?: number;
  }>>([]);
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [isCreatingSale, setIsCreatingSale] = useState(false);

  // Load Data and Subscribe to Realtime Cloud Updates across all devices
  useEffect(() => {
    loadAllData();

    // 1. Subscribe to Supabase Realtime for Debt POS tables
    const unsubscribe = subscribeToDebtPosRealtime(() => {
      console.log('Realtime cloud update detected from Supabase, refreshing Debt POS...');
      loadAllData();
    });

    // 2. Periodic multi-device background sync (every 6 seconds)
    const pollInterval = setInterval(() => {
      fetchCreditSales().then(({ sales: freshSales, tablesExist: exists, error: fetchErr }) => {
        if (!fetchErr && freshSales) {
          setSales(freshSales);
          setTablesExist(exists);
        }
      });
    }, 6000);

    // 3. Also refresh when window or tab regains focus
    const handleFocus = () => {
      loadAllData();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  async function loadAllData() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch inventory items (read-only)
      let invData: InventoryItem[] = [];
      if (isConfigured) {
        const { data: rawInv } = await supabase
          .from('inventory')
          .select('*')
          .order('name', { ascending: true });
        invData = rawInv || [];
      } else {
        const cached = localStorage.getItem('retailos_inventory_cache');
        if (cached) invData = JSON.parse(cached);
      }
      setInventory(invData);

      // 2. Fetch credit sales
      const { sales: creditData, tablesExist: exists, error: fetchErr } = await fetchCreditSales();
      if (fetchErr) setError(fetchErr);
      setSales(creditData);
      setTablesExist(exists);
    } catch (err: any) {
      console.error('Error loading Debt POS data:', err);
      setError(err.message || 'Failed to load Debt POS records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
  };

  // Dashboard Metrics
  const metrics = useMemo<DebtDashboardMetrics>(() => {
    return computeDebtDashboardMetrics(sales);
  }, [sales]);

  // Filtered Sales Lists
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchSearch = 
        s.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.customer_phone && s.customer_phone.includes(searchTerm)) ||
        s.id.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      if (activeTab === 'outstanding') return s.status === 'pending' || s.status === 'partial';
      if (activeTab === 'due-today') {
        if (s.status !== 'pending' && s.status !== 'partial') return false;
        return calculateDueStatus(s.due_date).category === 'today';
      }
      if (activeTab === 'overdue') {
        if (s.status !== 'pending' && s.status !== 'partial') return false;
        return calculateDueStatus(s.due_date).category === 'overdue';
      }
      if (activeTab === 'completed') return s.status === 'paid';
      return true;
    });
  }, [sales, searchTerm, activeTab]);

  // All Payments across all sales (Chronological)
  const allPayments = useMemo(() => {
    const list: Array<{ payment: CreditPayment; sale: CreditSale }> = [];
    sales.forEach(sale => {
      (sale.payments || []).forEach(p => {
        list.push({ payment: p, sale });
      });
    });
    return list.sort((a, b) => new Date(b.payment.created_at).getTime() - new Date(a.payment.created_at).getTime());
  }, [sales]);

  // All Reminders
  const allReminders = useMemo(() => {
    const list: Array<{ reminder: CreditReminder; sale: CreditSale }> = [];
    sales.forEach(sale => {
      (sale.reminders || []).forEach(r => {
        list.push({ reminder: r, sale });
      });
    });
    return list.sort((a, b) => new Date(b.reminder.created_at).getTime() - new Date(a.reminder.created_at).getTime());
  }, [sales]);

  // New Credit Sale Totals
  const newSaleTotals = useMemo(() => {
    let totalCapital = 0;
    let totalAmount = 0;

    saleCart.forEach(({ item, quantity, customPrice }) => {
      const qty = safeNum(quantity);
      const cost = safeNum(item.cost_price);
      const price = customPrice !== undefined ? customPrice : safeNum(item.selling_price);

      totalCapital += cost * qty;
      totalAmount += price * qty;
    });

    const totalProfit = totalAmount - totalCapital;

    return {
      totalCapital,
      totalAmount,
      totalProfit
    };
  }, [saleCart]);

  // Cart Management
  const addToCart = (item: InventoryItem) => {
    setSaleCart(prev => {
      const existing = prev.find(c => c.item.id === item.id);
      if (existing) {
        if (existing.quantity >= safeNum(item.quantity)) return prev;
        return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { item, quantity: 1, customPrice: safeNum(item.selling_price) }];
    });
  };

  const updateCartQty = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(itemId);
      return;
    }
    setSaleCart(prev => prev.map(c => {
      if (c.item.id === itemId) {
        const maxStock = safeNum(c.item.quantity);
        return { ...c, quantity: Math.min(newQty, maxStock > 0 ? maxStock : newQty) };
      }
      return c;
    }));
  };

  const updateCartCustomPrice = (itemId: string, newPrice: number) => {
    setSaleCart(prev => prev.map(c => {
      if (c.item.id === itemId) {
        return { ...c, customPrice: Math.max(0, newPrice) };
      }
      return c;
    }));
  };

  const removeFromCart = (itemId: string) => {
    setSaleCart(prev => prev.filter(c => c.item.id !== itemId));
  };

  // Submit New Credit Sale
  const handleCreateSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError('Customer name is required');
      return;
    }
    if (saleCart.length === 0) {
      setError('Please add at least one item to the credit sale');
      return;
    }

    setIsCreatingSale(true);
    setError(null);
    try {
      const payload = {
        customer_name: customerName,
        customer_phone: customerPhone,
        due_date: dueDate || undefined,
        notes: saleNotes,
        items: saleCart.map(c => ({
          inventory_item_id: c.item.id,
          item_name: c.item.name,
          quantity: c.quantity,
          cost_price: safeNum(c.item.cost_price),
          selling_price: c.customPrice !== undefined ? c.customPrice : safeNum(c.item.selling_price),
          category_id: c.item.category_id
        }))
      };

      const { creditSale, error: createErr } = await createCreditSale(payload);
      if (createErr) throw new Error(createErr);

      setSuccessMessage(`Credit sale for ${creditSale.customer_name} created successfully! Total: ${formatTZS(creditSale.total_amount)}`);
      setTimeout(() => setSuccessMessage(null), 5000);

      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setDueDate('');
      setSaleNotes('');
      setSaleCart([]);
      setActiveTab('outstanding');
      setSelectedSale(creditSale);

      // Refresh
      await loadAllData();
    } catch (err: any) {
      console.error('Error creating credit sale:', err);
      setError(err.message || 'Failed to create credit sale');
    } finally {
      setIsCreatingSale(false);
    }
  };

  // Live Payment Allocation Preview in Modal
  const paymentAllocationPreview = useMemo(() => {
    if (!selectedSale || paymentAmount <= 0) {
      return { capital: 0, profit: 0, newRemaining: selectedSale?.remaining_amount || 0 };
    }
    const capRemaining = Math.max(0, selectedSale.total_capital - selectedSale.capital_recovered);
    const capital = Math.min(paymentAmount, capRemaining);
    const profit = Math.max(0, paymentAmount - capital);
    const newRemaining = Math.max(0, selectedSale.remaining_amount - paymentAmount);
    return { capital, profit, newRemaining };
  }, [selectedSale, paymentAmount]);

  // Submit Payment
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;

    if (paymentAmount <= 0) {
      setError('Payment amount must be greater than zero');
      return;
    }
    if (paymentAmount > selectedSale.remaining_amount) {
      setError(`Payment cannot exceed remaining debt (${formatTZS(selectedSale.remaining_amount)})`);
      return;
    }

    setPaymentSubmitting(true);
    setError(null);
    try {
      const { payment, updatedSale, error: payErr } = await recordCreditPayment(selectedSale, {
        credit_sale_id: selectedSale.id,
        amount: paymentAmount,
        payment_method: paymentMethod,
        reference: paymentReference,
        notes: paymentNotes
      });

      if (payErr) throw new Error(payErr);

      setSuccessMessage(`Payment of ${formatTZS(payment.amount)} recorded! Capital recovered: ${formatTZS(payment.capital_allocated)}, Profit: ${formatTZS(payment.profit_allocated)}`);
      setTimeout(() => setSuccessMessage(null), 6000);

      setSelectedSale(updatedSale);
      setIsPaymentModalOpen(false);
      setPaymentAmount(0);
      setPaymentReference('');
      setPaymentNotes('');

      await loadAllData();
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to record payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Launch SMS Reminder
  const handleSendSms = async (sale: CreditSale) => {
    try {
      const { message, launched } = await recordAndLaunchSmsReminder(sale);
      setSuccessMessage(`SMS reminder prepared for ${sale.customer_name}. Copied to clipboard!`);
      setTimeout(() => setSuccessMessage(null), 5000);
      await loadAllData();
    } catch (err: any) {
      setError('Failed to prepare SMS reminder');
    }
  };

  // Cancel Credit Sale
  const handleCancelSale = async (sale: CreditSale) => {
    if (!window.confirm(`Are you sure you want to cancel the credit sale for "${sale.customer_name}"? Goods will be restored to inventory.`)) {
      return;
    }

    try {
      const { success, error: cancelErr } = await cancelCreditSale(sale);
      if (cancelErr) throw new Error(cancelErr);

      setSuccessMessage(`Credit sale for ${sale.customer_name} marked as cancelled and stock restored.`);
      setTimeout(() => setSuccessMessage(null), 5000);
      if (selectedSale?.id === sale.id) setSelectedSale(null);
      await loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel credit sale');
    }
  };

  // Manual Post to Sales Archive
  const handlePostToArchive = async (sale: CreditSale) => {
    try {
      const { success, error: postErr } = await postFullyPaidToSalesArchive(sale);
      if (postErr) throw new Error(postErr);
      setSuccessMessage(`Settled sale for ${sale.customer_name} successfully posted into the Sales Archive!`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to post to Sales Archive');
    }
  };

  const copySqlMigration = () => {
    const sqlText = `-- Copy and run in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.credit_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    total_capital NUMERIC NOT NULL DEFAULT 0 CHECK (total_capital >= 0),
    total_profit NUMERIC NOT NULL DEFAULT 0 CHECK (total_profit >= 0),
    amount_paid NUMERIC NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    remaining_amount NUMERIC NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
    capital_recovered NUMERIC NOT NULL DEFAULT 0 CHECK (capital_recovered >= 0),
    profit_recovered NUMERIC NOT NULL DEFAULT 0 CHECK (profit_recovered >= 0),
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.credit_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL,
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    cost_price NUMERIC NOT NULL CHECK (cost_price >= 0),
    selling_price NUMERIC NOT NULL CHECK (selling_price >= 0),
    capital_amount NUMERIC NOT NULL CHECK (capital_amount >= 0),
    profit_amount NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    capital_allocated NUMERIC NOT NULL DEFAULT 0 CHECK (capital_allocated >= 0),
    profit_allocated NUMERIC NOT NULL DEFAULT 0 CHECK (profit_allocated >= 0),
    payment_method TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL CHECK (reminder_type IN ('due', 'overdue')),
    scheduled_date DATE NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage credit_sales" ON public.credit_sales
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage credit_sale_items" ON public.credit_sale_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage credit_payments" ON public.credit_payments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage credit_reminders" ON public.credit_reminders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_sales, public.credit_sale_items, public.credit_payments, public.credit_reminders TO authenticated;
REVOKE ALL ON public.credit_sales, public.credit_sale_items, public.credit_payments, public.credit_reminders FROM anon;`;

    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  if (loading && sales.length === 0) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      
      {/* Top Header & Migration Notice */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD700] animate-pulse shadow-[0_0_10px_rgba(255,215,0,0.8)]" />
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
              Debt POS <span className="text-[#FFD700] text-lg font-mono">/ Credit Sales Engine</span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Completely isolated credit ledger • Capital-first recovery • Automatic overdue & SMS reminders
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!tablesExist && (
            <button
              onClick={() => setIsSqlModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold hover:bg-amber-500/20 transition-all animate-pulse"
            >
              <Database size={14} />
              Setup Supabase Tables
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#FFD700]' : ''} />
            <span>Sync</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('new-sale');
              setSelectedSale(null);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#FFD700] text-[#0a0a0a] rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#FFD700]/90 transition-all shadow-[0_0_20px_rgba(255,215,0,0.25)] active:scale-95"
          >
            <Plus size={16} />
            New Credit Sale
          </button>
        </div>
      </div>

      {/* Cloud Synchronization Status Banner */}
      {tablesExist ? (
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            <span className="font-bold text-white uppercase tracking-wider text-[11px]">
              Authoritative Supabase Cloud Synchronized
            </span>
            <span className="text-slate-400 font-mono text-[10px] hidden md:inline">
              (Project: wnzbavrtgnuchdovndxm.supabase.co • Realtime Active)
            </span>
          </div>
          <span className="text-[11px] text-emerald-300 font-mono font-bold flex items-center gap-1.5">
            <Activity size={12} />
            Device A ↔ Device B Realtime Live
          </span>
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="flex items-start gap-3">
            <ShieldAlert size={22} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-amber-300 uppercase tracking-wider text-xs flex items-center gap-2">
                Action Required: Initialize Supabase Cloud Tables for Multi-Device Sync
              </p>
              <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                The 4 new isolated tables (<code className="text-[#FFD700]">credit_sales</code>, <code className="text-[#FFD700]">credit_sale_items</code>, <code className="text-[#FFD700]">credit_payments</code>, <code className="text-[#FFD700]">credit_reminders</code>) need to be initialized in cloud project <code className="text-white font-mono">wnzbavrtgnuchdovndxm</code> so all devices read and write the exact same shared records.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSqlModalOpen(true)}
            className="px-4 py-2.5 bg-[#FFD700] hover:bg-[#FFD700]/90 text-black font-black text-xs rounded-xl uppercase tracking-wider shrink-0 transition-all shadow-[0_0_15px_rgba(255,215,0,0.3)] flex items-center gap-1.5"
          >
            <Database size={14} />
            View & Copy SQL Migration
          </button>
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in">
          <AlertTriangle className="text-rose-500 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-xs font-black text-rose-500 uppercase tracking-wider">Notice</p>
            <p className="text-xs text-rose-300 mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500/50 hover:text-rose-500">
            <X size={16} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in">
          <CheckCircle2 className="text-emerald-400 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-xs font-black text-emerald-400 uppercase tracking-wider">Success</p>
            <p className="text-xs text-emerald-200 mt-0.5">{successMessage}</p>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500/50 hover:text-emerald-400">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Navigation Subtabs (All 8 requested views) */}
      <div className="vault-card p-2 flex gap-1.5 overflow-x-auto custom-scrollbar">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: Activity, count: null },
          { id: 'new-sale', label: 'New Credit Sale', icon: Plus, count: null },
          { id: 'outstanding', label: 'Outstanding Debts', icon: Wallet, count: metrics.totalCreditSalesCount - metrics.paidCount },
          { id: 'payments', label: 'Payment Records', icon: History, count: allPayments.length },
          { id: 'due-today', label: 'Due Today', icon: Clock, count: metrics.dueTodayCount, alert: metrics.dueTodayCount > 0 },
          { id: 'overdue', label: 'Overdue Debts', icon: ShieldAlert, count: metrics.overdueCount, danger: metrics.overdueCount > 0 },
          { id: 'completed', label: 'Settled Sales', icon: CheckCircle2, count: metrics.paidCount },
          { id: 'reminders', label: 'SMS Reminders', icon: MessageSquare, count: allReminders.length }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as DebtPosTab);
              if (tab.id !== 'outstanding' && tab.id !== 'due-today' && tab.id !== 'overdue' && tab.id !== 'completed') {
                setSelectedSale(null);
              }
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
              activeTab === tab.id 
                ? "bg-[#FFD700] text-[#0a0a0a] shadow-[0_0_15px_rgba(255,215,0,0.25)]" 
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <tab.icon size={15} />
            <span>{tab.label}</span>
            {tab.count !== null && tab.count > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-md text-[10px] font-mono font-black",
                activeTab === tab.id 
                  ? "bg-black/20 text-black" 
                  : tab.danger 
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" 
                    : tab.alert 
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" 
                      : "bg-white/10 text-slate-300"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* 1. DASHBOARD OVERVIEW */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Executive Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            
            {/* Total Outstanding (Money Owed to Us) */}
            <div className="bg-[#050505] border border-amber-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/10 blur-[45px] rounded-full pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  <Wallet size={13} className="text-amber-400" />
                  Total Outstanding Debt
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {metrics.totalCreditSalesCount - metrics.paidCount} active debts
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-amber-300">
                  {formatTZS(metrics.totalOutstanding)}
                </h3>
                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  Total credit extended: <span className="text-white font-bold">{formatTZS(metrics.totalCreditSalesVolume)}</span>
                </p>
              </div>
            </div>

            {/* Total Collected */}
            <div className="bg-[#050505] border border-emerald-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/10 blur-[45px] rounded-full pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  Total Collected To Date
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {metrics.totalCreditSalesVolume > 0 ? ((metrics.totalCollected / metrics.totalCreditSalesVolume) * 100).toFixed(0) : 0}% settled
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-emerald-400">
                  {formatTZS(metrics.totalCollected)}
                </h3>
                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  Settled sales: <span className="text-white font-bold">{metrics.paidCount}</span>
                </p>
              </div>
            </div>

            {/* Capital Pending Recovery */}
            <div className="bg-[#050505] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/10 blur-[45px] rounded-full pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  <Package size={13} className="text-cyan-400" />
                  Capital Pending Recovery
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  COGS Protection
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-cyan-300">
                  {formatTZS(metrics.capitalPendingRecovery)}
                </h3>
                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  Profit pending: <span className="text-[#FFD700] font-bold">{formatTZS(metrics.profitPendingRecovery)}</span>
                </p>
              </div>
            </div>

            {/* Overdue Alert */}
            <div className={cn(
              "bg-[#050505] border rounded-3xl p-6 shadow-2xl relative overflow-hidden group",
              metrics.overdueCount > 0 ? "border-rose-500/40" : "border-white/10"
            )}>
              <div className={cn(
                "absolute top-0 right-0 w-28 h-28 blur-[45px] rounded-full pointer-events-none",
                metrics.overdueCount > 0 ? "bg-rose-500/10" : "bg-white/5"
              )} />
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  <ShieldAlert size={13} className={metrics.overdueCount > 0 ? "text-rose-500" : "text-slate-400"} />
                  Overdue Debts
                </span>
                {metrics.overdueCount > 0 && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                    Action Required
                  </span>
                )}
              </div>
              <div className="mt-3">
                <h3 className={cn("text-2xl font-black", metrics.overdueCount > 0 ? "text-rose-400" : "text-white")}>
                  {formatTZS(metrics.overdueAmount)}
                </h3>
                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  Due today: <span className="text-amber-300 font-bold">{formatTZS(metrics.dueTodayAmount)} ({metrics.dueTodayCount})</span>
                </p>
              </div>
            </div>

          </div>

          {/* Quick Actions & Recent Outstanding */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Actionable Debts List */}
            <div className="lg:col-span-2 vault-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <Clock size={18} className="text-[#FFD700]" />
                    Urgent Collection Priority
                  </h3>
                  <p className="text-xs text-slate-500">Debts requiring immediate attention (Overdue or Due Today)</p>
                </div>
                <button
                  onClick={() => setActiveTab('outstanding')}
                  className="text-xs text-[#FFD700] hover:underline font-bold uppercase tracking-wider"
                >
                  View All Debts →
                </button>
              </div>

              {sales.filter(s => (s.status === 'pending' || s.status === 'partial') && ['today', 'overdue'].includes(calculateDueStatus(s.due_date).category)).length === 0 ? (
                <div className="p-8 text-center bg-white/5 rounded-2xl border border-white/5">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-400 mb-2" />
                  <p className="text-xs font-bold text-slate-300 uppercase">No Urgent Overdue Accounts</p>
                  <p className="text-[11px] text-slate-500 mt-1">All customers are in good credit standing.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sales
                    .filter(s => (s.status === 'pending' || s.status === 'partial') && ['today', 'overdue'].includes(calculateDueStatus(s.due_date).category))
                    .slice(0, 5)
                    .map(sale => {
                      const dueStatus = calculateDueStatus(sale.due_date);
                      return (
                        <div key={sale.id} className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{sale.customer_name}</span>
                              {sale.customer_phone && (
                                <span className="text-slate-400 text-xs font-mono">({sale.customer_phone})</span>
                              )}
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                                dueStatus.category === 'overdue' 
                                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" 
                                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              )}>
                                {dueStatus.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                              <span>Remaining: <strong className="text-white">{formatTZS(sale.remaining_amount)}</strong></span>
                              <span>•</span>
                              <span>Capital At Risk: <strong className="text-cyan-300">{formatTZS(Math.max(0, sale.total_capital - sale.capital_recovered))}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedSale(sale);
                                setPaymentAmount(Math.min(sale.remaining_amount, 50000));
                                setIsPaymentModalOpen(true);
                              }}
                              className="px-3 py-1.5 bg-[#FFD700] text-black text-xs font-black rounded-xl hover:bg-[#FFD700]/90 transition-all uppercase tracking-wider"
                            >
                              Record Payment
                            </button>
                            <button
                              onClick={() => handleSendSms(sale)}
                              className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-all"
                              title="Send SMS"
                            >
                              <Send size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Right Col: Capital Recovery Rule Matrix */}
            <div className="vault-card p-6 space-y-4">
              <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                <Receipt size={18} className="text-emerald-400" />
                Capital Recovery Protocol
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Debt POS strictly enforces <strong className="text-white">Capital-First Recovery</strong>. Payments immediately cover the underlying cost of goods sold before any profit is released.
              </p>

              <div className="space-y-3 pt-2">
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-cyan-300 font-bold uppercase text-[10px]">Step 1: Capital Recovery</span>
                    <span className="font-mono text-cyan-200">{metrics.totalCapitalPending !== undefined ? '' : ''}</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Recovered: <strong className="text-cyan-300">{formatTZS(sales.reduce((s, x) => s + x.capital_recovered, 0))}</strong> of {formatTZS(sales.reduce((s, x) => s + x.total_capital, 0))} total capital.
                  </p>
                </div>

                <div className="p-3 bg-[#FFD700]/10 border border-[#FFD700]/20 rounded-xl space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#FFD700] font-bold uppercase text-[10px]">Step 2: Profit Realization</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Recovered: <strong className="text-[#FFD700]">{formatTZS(sales.reduce((s, x) => s + x.profit_recovered, 0))}</strong> of {formatTZS(sales.reduce((s, x) => s + x.total_profit, 0))} total profit.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <button
                  onClick={() => setActiveTab('new-sale')}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-white/10 flex items-center justify-center gap-2"
                >
                  <Plus size={14} className="text-[#FFD700]" />
                  Open New Credit Sale
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. NEW CREDIT SALE */}
      {/* ========================================================================= */}
      {activeTab === 'new-sale' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Customer Info & Cart Items (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Customer Header Form */}
            <div className="vault-card p-6 space-y-4">
              <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                <User size={18} className="text-[#FFD700]" />
                Customer & Credit Terms
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Customer Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe / Transport Co."
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Customer Phone (for SMS reminders)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +255 712 345 678"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Agreed Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:border-[#FFD700]/50 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Notes & Collateral / Reference
                </label>
                <input
                  type="text"
                  placeholder="Optional notes or vehicle plate / guarantor..."
                  value={saleNotes}
                  onChange={e => setSaleNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none"
                />
              </div>
            </div>

            {/* Selected Credit Cart Items */}
            <div className="vault-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <Package size={18} className="text-[#FFD700]" />
                  Selected Products for Credit ({saleCart.length})
                </h3>
                {saleCart.length > 0 && (
                  <button
                    onClick={() => setSaleCart([])}
                    className="text-xs text-rose-400 hover:text-rose-300 uppercase font-bold"
                  >
                    Clear Cart
                  </button>
                )}
              </div>

              {saleCart.length === 0 ? (
                <div className="py-10 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                  <Package size={36} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-xs font-bold text-slate-400 uppercase">Cart is Empty</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Select items from the catalog on the right to add them.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10 text-[10px] text-slate-400 uppercase font-black">
                        <th className="p-3">Product</th>
                        <th className="p-3">Quantity</th>
                        <th className="p-3">Unit Cost</th>
                        <th className="p-3">Unit Price</th>
                        <th className="p-3">Capital</th>
                        <th className="p-3">Profit</th>
                        <th className="p-3">Total</th>
                        <th className="p-3 text-right">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium">
                      {saleCart.map(c => {
                        const cost = safeNum(c.item.cost_price);
                        const price = c.customPrice !== undefined ? c.customPrice : safeNum(c.item.selling_price);
                        const capital = cost * c.quantity;
                        const profit = (price - cost) * c.quantity;
                        const lineTotal = price * c.quantity;

                        return (
                          <tr key={c.item.id} className="hover:bg-white/5">
                            <td className="p-3 font-bold text-white">
                              {c.item.name}
                              <span className="text-[10px] text-slate-500 font-mono block">{c.item.code || 'N/A'}</span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => updateCartQty(c.item.id, c.quantity - 1)}
                                  className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={c.quantity}
                                  onChange={e => updateCartQty(c.item.id, parseInt(e.target.value) || 1)}
                                  className="w-12 px-1.5 py-0.5 bg-white/5 border border-white/10 text-center font-bold text-white rounded"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateCartQty(c.item.id, c.quantity + 1)}
                                  className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-slate-400">{formatTZS(cost)}</td>
                            <td className="p-3">
                              <input
                                type="number"
                                value={price}
                                onChange={e => updateCartCustomPrice(c.item.id, parseFloat(e.target.value) || 0)}
                                className="w-20 px-1.5 py-0.5 bg-white/5 border border-white/10 font-bold text-[#FFD700] rounded text-xs"
                              />
                            </td>
                            <td className="p-3 font-mono text-cyan-300">{formatTZS(capital)}</td>
                            <td className="p-3 font-mono text-emerald-300">{formatTZS(profit)}</td>
                            <td className="p-3 font-black text-white">{formatTZS(lineTotal)}</td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => removeFromCart(c.item.id)}
                                className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                              >
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Inventory Picker & Checkout Summary (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Live Financial Breakdown Card */}
            <div className="bg-[#050505] border-2 border-[#FFD700]/30 rounded-3xl p-6 shadow-2xl space-y-4">
              <h3 className="text-sm font-black text-[#FFD700] uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={16} />
                Credit Financial Preview
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Total Capital Investment (COGS):</span>
                  <span className="font-mono font-bold text-cyan-300">{formatTZS(newSaleTotals.totalCapital)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Anticipated Gross Profit:</span>
                  <span className="font-mono font-bold text-emerald-300">+{formatTZS(newSaleTotals.totalProfit)}</span>
                </div>
                <div className="pt-2 border-t border-white/10 flex justify-between items-baseline">
                  <span className="font-black text-white uppercase text-xs">Total Credit Debt:</span>
                  <span className="text-xl font-black text-[#FFD700]">{formatTZS(newSaleTotals.totalAmount)}</span>
                </div>
              </div>

              <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Initial Paid:</span>
                  <span className="font-bold text-white">TZS 0</span>
                </div>
                <div className="flex justify-between">
                  <span>Starting Remaining:</span>
                  <span className="font-bold text-amber-300">{formatTZS(newSaleTotals.totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Initial Status:</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase text-[9px]">
                    Pending
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateSaleSubmit}
                disabled={isCreatingSale || saleCart.length === 0 || !customerName.trim()}
                className="w-full py-4 bg-[#FFD700] hover:bg-[#FFD700]/90 text-black rounded-2xl font-black uppercase tracking-wider text-xs shadow-[0_0_25px_rgba(255,215,0,0.3)] transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
              >
                {isCreatingSale ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Confirm & Create Credit Sale
              </button>
            </div>

            {/* Inventory Item Picker */}
            <div className="vault-card p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <Search size={16} className="text-slate-400" />
                  Available Inventory Catalog
                </h3>
                <input
                  type="text"
                  placeholder="Filter products..."
                  value={itemSearchTerm}
                  onChange={e => setItemSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none"
                />
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                {inventory
                  .filter(i => 
                    (i.name || '').toLowerCase().includes(itemSearchTerm.toLowerCase()) ||
                    (i.code || '').toLowerCase().includes(itemSearchTerm.toLowerCase())
                  )
                  .map(item => {
                    const isAdded = saleCart.some(c => c.item.id === item.id);
                    const stock = safeNum(item.quantity);

                    return (
                      <div
                        key={item.id}
                        onClick={() => addToCart(item)}
                        className={cn(
                          "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs",
                          isAdded 
                            ? "bg-[#FFD700]/10 border-[#FFD700]/40 text-white" 
                            : "bg-white/5 border-white/5 hover:border-white/20 text-slate-300"
                        )}
                      >
                        <div>
                          <p className="font-bold text-white">{item.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span>Cost: {formatTZS(safeNum(item.cost_price))}</span>
                            <span>•</span>
                            <span className="text-[#FFD700]">Price: {formatTZS(safeNum(item.selling_price))}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold block",
                            stock <= 0 ? "bg-rose-500/20 text-rose-300" : "bg-white/10 text-slate-300"
                          )}>
                            {stock} in stock
                          </span>
                          <span className="text-[10px] text-[#FFD700] uppercase font-bold mt-1 block">
                            {isAdded ? '+ Add more' : '+ Select'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 3, 5, 6, 7. DEBTS LIST (OUTSTANDING / DUE TODAY / OVERDUE / COMPLETED) */}
      {/* ========================================================================= */}
      {['outstanding', 'due-today', 'overdue', 'completed'].includes(activeTab) && (
        <div className="space-y-4">
          
          {/* Controls: Search and Title */}
          <div className="vault-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                type="text"
                placeholder="Search by customer name, phone, or reference ID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>Showing: <strong className="text-white">{filteredSales.length}</strong> records</span>
            </div>
          </div>

          {/* Debts Table */}
          <div className="vault-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-[10px] text-slate-400 uppercase font-black tracking-wider">
                    <th className="p-4">Customer & Phone</th>
                    <th className="p-4">Sale Amount</th>
                    <th className="p-4">Paid / Remaining</th>
                    <th className="p-4">Capital (Rec. / Rem.)</th>
                    <th className="p-4">Profit (Rec. / Rem.)</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-500">
                        <Wallet size={36} className="mx-auto text-slate-700 mb-2" />
                        <p className="font-bold uppercase text-xs">No records found</p>
                        <p className="text-[11px] mt-0.5">Check search filters or create a new credit sale.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map(sale => {
                      const dueStatus = calculateDueStatus(sale.due_date);
                      const capRem = Math.max(0, sale.total_capital - sale.capital_recovered);
                      const profRem = Math.max(0, sale.total_profit - sale.profit_recovered);

                      return (
                        <tr 
                          key={sale.id}
                          className={cn(
                            "hover:bg-white/5 transition-colors cursor-pointer",
                            selectedSale?.id === sale.id && "bg-[#FFD700]/5 border-l-2 border-[#FFD700]"
                          )}
                          onClick={() => setSelectedSale(sale)}
                        >
                          {/* Customer */}
                          <td className="p-4">
                            <span className="font-bold text-white text-sm block">{sale.customer_name}</span>
                            {sale.customer_phone ? (
                              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                                <Phone size={11} className="text-slate-500" />
                                {sale.customer_phone}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-600 font-mono">No phone</span>
                            )}
                          </td>

                          {/* Sale Amount */}
                          <td className="p-4 font-black text-white text-sm">
                            {formatTZS(sale.total_amount)}
                          </td>

                          {/* Paid / Remaining */}
                          <td className="p-4">
                            <div className="font-bold text-emerald-400">
                              Paid: {formatTZS(sale.amount_paid)}
                            </div>
                            <div className="font-black text-amber-300 mt-0.5">
                              Rem: {formatTZS(sale.remaining_amount)}
                            </div>
                          </td>

                          {/* Capital (Recovered / Remaining) */}
                          <td className="p-4 font-mono text-xs">
                            <div className="text-cyan-300">
                              Rec: {formatTZS(sale.capital_recovered)}
                            </div>
                            <div className="text-slate-400">
                              Rem: {formatTZS(capRem)}
                            </div>
                          </td>

                          {/* Profit (Recovered / Remaining) */}
                          <td className="p-4 font-mono text-xs">
                            <div className="text-[#FFD700]">
                              Rec: {formatTZS(sale.profit_recovered)}
                            </div>
                            <div className="text-slate-400">
                              Rem: {formatTZS(profRem)}
                            </div>
                          </td>

                          {/* Due Date & Category */}
                          <td className="p-4">
                            <span className="text-slate-300 block font-mono">
                              {sale.due_date ? new Date(sale.due_date).toLocaleDateString() : 'N/A'}
                            </span>
                            {sale.status !== 'paid' && sale.status !== 'cancelled' && (
                              <span className={cn(
                                "text-[10px] font-bold block mt-0.5",
                                dueStatus.category === 'overdue' 
                                  ? "text-rose-400" 
                                  : dueStatus.category === 'today' 
                                    ? "text-amber-400 font-black animate-pulse" 
                                    : "text-slate-500"
                              )}>
                                {dueStatus.label}
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="p-4">
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                              sale.status === 'paid' 
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                                : sale.status === 'partial' 
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" 
                                  : sale.status === 'cancelled' 
                                    ? "bg-slate-800 text-slate-400" 
                                    : "bg-white/10 text-slate-300 border border-white/10"
                            )}>
                              {sale.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              {sale.status !== 'paid' && sale.status !== 'cancelled' && (
                                <>
                                  <button
                                    onClick={() => {
                                      setSelectedSale(sale);
                                      setPaymentAmount(Math.min(sale.remaining_amount, 50000));
                                      setIsPaymentModalOpen(true);
                                    }}
                                    className="px-2.5 py-1.5 bg-[#FFD700] text-black text-xs font-black rounded-xl hover:bg-[#FFD700]/90 uppercase tracking-wider transition-all"
                                  >
                                    Pay
                                  </button>
                                  <button
                                    onClick={() => handleSendSms(sale)}
                                    className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl"
                                    title="Send SMS"
                                  >
                                    <Send size={14} />
                                  </button>
                                </>
                              )}

                              {sale.status === 'paid' && (
                                <button
                                  onClick={() => handlePostToArchive(sale)}
                                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider"
                                >
                                  Sync Archive
                                </button>
                              )}

                              {sale.status === 'pending' && sale.amount_paid === 0 && (
                                <button
                                  onClick={() => handleCancelSale(sale)}
                                  className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-xl"
                                  title="Cancel Debt & Restore Stock"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected Debt Detail Drawer */}
          {selectedSale && (
            <div className="bg-[#050505] border-2 border-[#FFD700]/40 rounded-3xl p-6 shadow-2xl space-y-6 animate-in slide-in-from-bottom-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-black text-white">{selectedSale.customer_name}</h3>
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                      selectedSale.status === 'paid' ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                    )}>
                      {selectedSale.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    Ref ID: {selectedSale.id} • Created: {new Date(selectedSale.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {selectedSale.status !== 'paid' && selectedSale.status !== 'cancelled' && (
                    <button
                      onClick={() => {
                        setPaymentAmount(Math.min(selectedSale.remaining_amount, 50000));
                        setIsPaymentModalOpen(true);
                      }}
                      className="px-5 py-2.5 bg-[#FFD700] text-black font-black text-xs rounded-xl hover:bg-[#FFD700]/90 uppercase tracking-wider transition-all"
                    >
                      Record Payment
                    </button>
                  )}
                  <button
                    onClick={() => handleSendSms(selectedSale)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10"
                  >
                    <Send size={14} />
                    SMS Reminder
                  </button>
                  <button
                    onClick={() => setSelectedSale(null)}
                    className="p-2 text-slate-500 hover:text-white rounded-xl"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Recovery Status Bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Debt Settlement
                  </span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-emerald-400">Paid: {formatTZS(selectedSale.amount_paid)}</span>
                    <span className="text-xs text-slate-400">of {formatTZS(selectedSale.total_amount)}</span>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mt-2">
                    <div 
                      className="bg-emerald-400 h-full rounded-full transition-all"
                      style={{ width: `${selectedSale.total_amount > 0 ? (selectedSale.amount_paid / selectedSale.total_amount) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300 block mb-1">
                    Capital Recovery (COGS)
                  </span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-cyan-300">{formatTZS(selectedSale.capital_recovered)}</span>
                    <span className="text-xs text-slate-400">Target: {formatTZS(selectedSale.total_capital)}</span>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mt-2">
                    <div 
                      className="bg-cyan-400 h-full rounded-full transition-all"
                      style={{ width: `${selectedSale.total_capital > 0 ? (selectedSale.capital_recovered / selectedSale.total_capital) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 bg-[#FFD700]/10 rounded-2xl border border-[#FFD700]/20">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#FFD700] block mb-1">
                    Profit Realization
                  </span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-[#FFD700]">{formatTZS(selectedSale.profit_recovered)}</span>
                    <span className="text-xs text-slate-400">Target: {formatTZS(selectedSale.total_profit)}</span>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mt-2">
                    <div 
                      className="bg-[#FFD700] h-full rounded-full transition-all"
                      style={{ width: `${selectedSale.total_profit > 0 ? (selectedSale.profit_recovered / selectedSale.total_profit) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Items & Chronological Payment History Side-by-Side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                
                {/* Items in Credit Sale */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Purchased Items on Credit
                  </h4>
                  <div className="border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
                    {(selectedSale.items || []).map((item, idx) => (
                      <div key={idx} className="p-3 bg-white/5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-white">{item.item_name}</p>
                          <p className="text-[10px] font-mono text-slate-400">
                            Qty: {item.quantity} × {formatTZS(safeNum(item.selling_price))} (Cost: {formatTZS(safeNum(item.cost_price))})
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-[#FFD700]">{formatTZS(safeNum(item.selling_price) * item.quantity)}</span>
                          <span className="text-[10px] font-mono text-cyan-300 block">Cap: {formatTZS(item.capital_amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Permanent Chronological Payment History */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Chronological Payment History ({selectedSale.payments?.length || 0})
                  </h4>

                  {(selectedSale.payments?.length || 0) === 0 ? (
                    <div className="p-6 text-center bg-white/5 rounded-2xl border border-white/5 text-xs text-slate-500">
                      No payments recorded yet.
                    </div>
                  ) : (
                    <div className="border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
                      {selectedSale.payments?.map((p, idx) => (
                        <div key={p.id} className="p-3 bg-white/5 flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-emerald-400">Payment {idx + 1}: {formatTZS(p.amount)}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-mono">
                                {p.payment_method || 'Cash'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {new Date(p.payment_date).toLocaleString()} {p.reference ? `• Ref: ${p.reference}` : ''}
                            </p>
                          </div>

                          <div className="text-right text-xs font-mono">
                            <span className="text-cyan-300 block">Capital: {formatTZS(p.capital_allocated)}</span>
                            <span className="text-[#FFD700] block">Profit: {formatTZS(p.profit_allocated)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. ALL PAYMENTS VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="vault-card p-6">
            <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2 mb-4">
              <History size={18} className="text-emerald-400" />
              All Permanent Credit Payment Transactions ({allPayments.length})
            </h3>

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-[10px] text-slate-400 uppercase font-black">
                    <th className="p-3">Payment Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Amount Paid</th>
                    <th className="p-3">Capital Allocated</th>
                    <th className="p-3">Profit Allocated</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Reference / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium">
                  {allPayments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-500">
                        No payments recorded across any credit sales yet.
                      </td>
                    </tr>
                  ) : (
                    allPayments.map(({ payment: p, sale }) => (
                      <tr key={p.id} className="hover:bg-white/5">
                        <td className="p-3 font-mono text-slate-400">
                          {new Date(p.payment_date).toLocaleString()}
                        </td>
                        <td className="p-3 font-bold text-white">
                          {sale.customer_name}
                        </td>
                        <td className="p-3 font-black text-emerald-400">
                          {formatTZS(p.amount)}
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          {formatTZS(p.capital_allocated)}
                        </td>
                        <td className="p-3 font-mono text-[#FFD700]">
                          {formatTZS(p.profit_allocated)}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 text-[10px] font-mono">
                            {p.payment_method || 'Cash'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400 text-xs">
                          {p.reference || p.notes || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. SMS REMINDERS VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'reminders' && (
        <div className="space-y-4">
          <div className="vault-card p-6">
            <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2 mb-4">
              <MessageSquare size={18} className="text-cyan-400" />
              SMS Reminders Prepared & Sent ({allReminders.length})
            </h3>

            <div className="space-y-3">
              {allReminders.length === 0 ? (
                <div className="p-10 text-center text-slate-500 bg-white/5 rounded-2xl border border-white/5">
                  No SMS reminders recorded yet. Use the "Send SMS" button on any outstanding debt.
                </div>
              ) : (
                allReminders.map(({ reminder: r, sale }) => (
                  <div key={r.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{sale.customer_name}</span>
                        <span className="text-xs text-slate-400 font-mono">({sale.customer_phone || 'No phone'})</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                          r.reminder_type === 'overdue' ? "bg-rose-500/20 text-rose-300" : "bg-cyan-500/20 text-cyan-300"
                        )}>
                          {r.reminder_type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-2 bg-black/30 p-2.5 rounded-xl border border-white/5 font-mono">
                        "{r.message}"
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-1">
                        Prepared at: {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>

                    <button
                      onClick={() => handleSendSms(sale)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 shrink-0 flex items-center gap-1.5"
                    >
                      <Send size={14} />
                      Resend
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RECORD PAYMENT MODAL */}
      {/* ========================================================================= */}
      {isPaymentModalOpen && selectedSale && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-md" onClick={() => setIsPaymentModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-[#0a0a0a] border border-[#FFD700]/30 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 animate-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <DollarSign size={20} className="text-[#FFD700]" />
                  Record Customer Debt Payment
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Customer: <strong className="text-white">{selectedSale.customer_name}</strong> • Remaining: <strong className="text-amber-300">{formatTZS(selectedSale.remaining_amount)}</strong>
                </p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-xl">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Payment Amount (TZS) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="1"
                    max={selectedSale.remaining_amount}
                    step="any"
                    value={paymentAmount || ''}
                    onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    className="w-full pl-4 pr-16 py-3 bg-white/5 border border-white/10 rounded-2xl text-lg font-black text-[#FFD700] focus:border-[#FFD700]/50 outline-none"
                    placeholder="e.g. 30000"
                  />
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(selectedSale.remaining_amount)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black px-2 py-1 rounded bg-[#FFD700]/20 text-[#FFD700] uppercase"
                  >
                    Pay Full
                  </button>
                </div>
              </div>

              {/* Real-Time Capital vs Profit Allocation Preview */}
              <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-2 text-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Enforced Allocation Preview
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-400">1. Capital Recovery (COGS):</span>
                  <span className="font-mono font-bold text-cyan-300">+{formatTZS(paymentAllocationPreview.capital)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">2. Profit Recovered:</span>
                  <span className="font-mono font-bold text-[#FFD700]">+{formatTZS(paymentAllocationPreview.profit)}</span>
                </div>
                <div className="pt-2 border-t border-white/5 flex justify-between font-bold">
                  <span className="text-slate-400">New Remaining Debt:</span>
                  <span className="font-mono text-amber-300">{formatTZS(paymentAllocationPreview.newRemaining)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="M-Pesa / Mobile">M-Pesa / Mobile Money</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card">Card</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Reference / Receipt #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MPESA-12345"
                    value={paymentReference}
                    onChange={e => setPaymentReference(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Optional payment notes..."
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 outline-none"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-400 rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentSubmitting || paymentAmount <= 0}
                  className="flex-1 py-3 bg-[#FFD700] hover:bg-[#FFD700]/90 text-black rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {paymentSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Confirm Payment
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUPABASE SQL MIGRATION MODAL (INSPECTION & HELPER) */}
      {/* ========================================================================= */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-md" onClick={() => setIsSqlModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-[#FFD700]/40 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <Database size={20} className="text-[#FFD700]" />
                  Supabase Database Setup for Debt POS
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Run this SQL in your Supabase SQL Editor to create the 4 new isolated tables.
                </p>
              </div>
              <button onClick={() => setIsSqlModalOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-xl">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                This script creates only the new tables: <code className="text-[#FFD700]">credit_sales</code>, <code className="text-[#FFD700]">credit_sale_items</code>, <code className="text-[#FFD700]">credit_payments</code>, and <code className="text-[#FFD700]">credit_reminders</code> with strict non-negative constraints and Row Level Security. It leaves all existing tables untouched.
              </p>

              <div className="relative bg-[#050505] border border-white/10 rounded-2xl p-4 max-h-[260px] overflow-y-auto font-mono text-[11px] text-slate-300">
                <pre className="whitespace-pre-wrap">{`-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.credit_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    total_capital NUMERIC NOT NULL DEFAULT 0 CHECK (total_capital >= 0),
    total_profit NUMERIC NOT NULL DEFAULT 0 CHECK (total_profit >= 0),
    amount_paid NUMERIC NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    remaining_amount NUMERIC NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
    capital_recovered NUMERIC NOT NULL DEFAULT 0 CHECK (capital_recovered >= 0),
    profit_recovered NUMERIC NOT NULL DEFAULT 0 CHECK (profit_recovered >= 0),
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.credit_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL,
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    cost_price NUMERIC NOT NULL CHECK (cost_price >= 0),
    selling_price NUMERIC NOT NULL CHECK (selling_price >= 0),
    capital_amount NUMERIC NOT NULL CHECK (capital_amount >= 0),
    profit_amount NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    capital_allocated NUMERIC NOT NULL DEFAULT 0 CHECK (capital_allocated >= 0),
    profit_allocated NUMERIC NOT NULL DEFAULT 0 CHECK (profit_allocated >= 0),
    payment_method TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL CHECK (reminder_type IN ('due', 'overdue')),
    scheduled_date DATE NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage credit_sales" ON public.credit_sales
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage credit_sale_items" ON public.credit_sale_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage credit_payments" ON public.credit_payments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage credit_reminders" ON public.credit_reminders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_sales, public.credit_sale_items, public.credit_payments, public.credit_reminders TO authenticated;
REVOKE ALL ON public.credit_sales, public.credit_sale_items, public.credit_payments, public.credit_reminders FROM anon;`}</pre>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 font-mono">
                {copiedSql ? '✓ Copied to clipboard!' : 'Click to copy full migration SQL'}
              </span>
              <button
                onClick={copySqlMigration}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#FFD700] text-black font-black text-xs rounded-xl uppercase tracking-wider hover:bg-[#FFD700]/90 transition-all shadow-[0_0_15px_rgba(255,215,0,0.2)]"
              >
                <Copy size={14} />
                {copiedSql ? 'Copied!' : 'Copy SQL Script'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
