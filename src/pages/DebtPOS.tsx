import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
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
  Wallet, 
  DollarSign, 
  Clock, 
  Phone, 
  Search, 
  Plus, 
  Check, 
  X, 
  ChevronRight, 
  Send, 
  ShieldAlert, 
  CheckCircle2, 
  History, 
  RefreshCw, 
  Database, 
  Copy, 
  Package, 
  AlertTriangle, 
  Loader2,
  ArrowLeft,
  Calendar,
  Layers,
  User
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

type DebtFilterType = 'all' | 'due-today' | 'overdue' | 'completed';

export default function DebtPOS() {
  const [sales, setSales] = useState<CreditSale[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tablesExist, setTablesExist] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // View & Filter States
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<DebtFilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Selected Debt for View & Actions
  const [selectedSale, setSelectedSale] = useState<CreditSale | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Payment Form State (string-backed input preserves typing and decimals)
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const paymentAmount = useMemo(() => safeNum(paymentAmountInput), [paymentAmountInput]);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

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
  const deferredItemSearchTerm = useDeferredValue(itemSearchTerm);
  const [initialPaidInput, setInitialPaidInput] = useState<string>('');
  const initialPaidAmount = useMemo(() => safeNum(initialPaidInput), [initialPaidInput]);
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

      // Update selectedSale instance if it's currently open
      if (selectedSale) {
        const updated = creditData.find(s => s.id === selectedSale.id);
        if (updated) setSelectedSale(updated);
      }
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
    const term = deferredSearchTerm.trim().toLowerCase();
    return sales.filter(s => {
      const matchSearch = !term ||
        s.customer_name.toLowerCase().includes(term) ||
        (s.customer_phone && s.customer_phone.includes(term)) ||
        s.id.toLowerCase().includes(term);

      if (!matchSearch) return false;

      if (statusFilter === 'due-today') {
        if (s.status !== 'pending' && s.status !== 'partial') return false;
        return calculateDueStatus(s.due_date).category === 'today';
      }
      if (statusFilter === 'overdue') {
        if (s.status !== 'pending' && s.status !== 'partial') return false;
        return calculateDueStatus(s.due_date).category === 'overdue';
      }
      if (statusFilter === 'completed') {
        return s.status === 'paid';
      }

      // 'all' shows all active debts (pending/partial), plus completed if searched
      return true;
    });
  }, [sales, deferredSearchTerm, statusFilter]);

  // Memoized Filtered Inventory Items for New Credit Sale Quick-add
  const filteredInventoryItems = useMemo(() => {
    const term = deferredItemSearchTerm.trim().toLowerCase();
    if (!term) return inventory.slice(0, 15);
    return inventory.filter(i => 
      (i.name || '').toLowerCase().includes(term) ||
      (i.code || '').toLowerCase().includes(term)
    ).slice(0, 15);
  }, [inventory, deferredItemSearchTerm]);

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

    const totalProfit = Math.max(0, totalAmount - totalCapital);

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
      setError('Please add at least one product to the credit sale');
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

      let finalSale = creditSale;
      if (initialPaidAmount > 0) {
        const { updatedSale } = await recordCreditPayment(creditSale, {
          credit_sale_id: creditSale.id,
          amount: Math.min(initialPaidAmount, creditSale.total_amount),
          payment_method: 'Cash',
          notes: 'Initial payment at credit sale creation'
        });
        if (updatedSale) {
          finalSale = updatedSale;
        }
      }

      setSuccessMessage(
        `Credit sale for ${finalSale.customer_name} saved successfully! Total: ${formatTZS(finalSale.total_amount)}${
          initialPaidAmount > 0 ? ` (Initial paid: ${formatTZS(initialPaidAmount)})` : ''
        }`
      );
      setTimeout(() => setSuccessMessage(null), 5000);

      // Reset form & return to list with new sale selected
      setCustomerName('');
      setCustomerPhone('');
      setDueDate('');
      setSaleNotes('');
      setInitialPaidInput('');
      setSaleCart([]);
      setIsNewSaleOpen(false);
      setSelectedSale(finalSale);

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
      setPaymentAmountInput('');
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
      await recordAndLaunchSmsReminder(sale);
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
      const { error: cancelErr } = await cancelCreditSale(sale);
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
      const { error: postErr } = await postFullyPaidToSalesArchive(sale);
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
    <div className="space-y-5 max-w-7xl mx-auto px-2 sm:px-4 pb-12">
      
      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER & ACTIONS */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            Debt POS
            <span className="text-[#FFD700] text-sm font-normal">/ Credit Manager</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Cloud-synchronized credit sales and payment recovery
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!tablesExist && (
            <button
              onClick={() => setIsSqlModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold hover:bg-amber-500/20 transition-all"
            >
              <Database size={14} />
              <span>Setup Tables</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-xl text-xs font-bold transition-all disabled:opacity-50 min-h-[44px]"
            title="Refresh and sync cloud data"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#FFD700]' : ''} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          <button
            onClick={() => {
              setIsNewSaleOpen(!isNewSaleOpen);
              setSelectedSale(null);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FFD700] text-black font-black text-xs uppercase tracking-wider rounded-xl hover:bg-[#FFD700]/90 transition-all shadow-[0_0_15px_rgba(255,215,0,0.2)] active:scale-95 min-h-[44px]"
          >
            {isNewSaleOpen ? (
              <>
                <ArrowLeft size={16} />
                <span>Back to Debts</span>
              </>
            ) : (
              <>
                <Plus size={16} />
                <span>New Credit Sale</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alert Notices */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/25 rounded-2xl p-3.5 flex items-start gap-3">
          <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={16} />
          <div className="flex-1 text-xs">
            <span className="font-bold text-rose-300">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-3.5 flex items-start gap-3">
          <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={16} />
          <div className="flex-1 text-xs">
            <span className="font-bold text-emerald-300">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. SIMPLE DASHBOARD (EXACTLY FOUR SUMMARY CARDS) */}
      {/* ------------------------------------------------------------- */}
      {!isNewSaleOpen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          {/* Card 1: Total Outstanding */}
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={cn(
              "text-left p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden",
              statusFilter === 'all'
                ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                : "bg-[#0a0a0a] border-white/10 hover:border-white/20"
            )}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="text-[11px] uppercase tracking-wider font-bold">Total Outstanding</span>
              <Wallet size={16} className="text-amber-400" />
            </div>
            <div className="mt-2">
              <div className="text-lg sm:text-2xl font-black text-amber-300 truncate">
                {formatTZS(metrics.totalOutstanding)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {metrics.totalCreditSalesCount - metrics.paidCount} active debts
              </div>
            </div>
          </button>

          {/* Card 2: Due Today */}
          <button
            type="button"
            onClick={() => setStatusFilter('due-today')}
            className={cn(
              "text-left p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden",
              statusFilter === 'due-today'
                ? "bg-[#FFD700]/10 border-[#FFD700]/50 shadow-[0_0_20px_rgba(255,215,0,0.15)]"
                : "bg-[#0a0a0a] border-white/10 hover:border-white/20"
            )}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="text-[11px] uppercase tracking-wider font-bold">Due Today</span>
              <Clock size={16} className="text-[#FFD700]" />
            </div>
            <div className="mt-2">
              <div className="text-lg sm:text-2xl font-black text-white truncate">
                {metrics.dueTodayCount} <span className="text-xs sm:text-sm font-normal text-slate-400">debts</span>
              </div>
              <div className="text-[11px] text-amber-300 font-mono mt-0.5 truncate">
                {formatTZS(metrics.dueTodayAmount)}
              </div>
            </div>
          </button>

          {/* Card 3: Overdue */}
          <button
            type="button"
            onClick={() => setStatusFilter('overdue')}
            className={cn(
              "text-left p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden",
              statusFilter === 'overdue'
                ? "bg-rose-500/10 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                : "bg-[#0a0a0a] border-white/10 hover:border-white/20"
            )}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="text-[11px] uppercase tracking-wider font-bold">Overdue</span>
              <ShieldAlert size={16} className={metrics.overdueCount > 0 ? "text-rose-400" : "text-slate-500"} />
            </div>
            <div className="mt-2">
              <div className={cn("text-lg sm:text-2xl font-black truncate", metrics.overdueCount > 0 ? "text-rose-400" : "text-white")}>
                {metrics.overdueCount} <span className="text-xs sm:text-sm font-normal text-slate-400">debts</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                {formatTZS(metrics.overdueAmount)}
              </div>
            </div>
          </button>

          {/* Card 4: Completed */}
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={cn(
              "text-left p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden",
              statusFilter === 'completed'
                ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                : "bg-[#0a0a0a] border-white/10 hover:border-white/20"
            )}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="text-[11px] uppercase tracking-wider font-bold">Completed</span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
            <div className="mt-2">
              <div className="text-lg sm:text-2xl font-black text-emerald-400 truncate">
                {metrics.paidCount} <span className="text-xs sm:text-sm font-normal text-slate-400">settled</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                {formatTZS(metrics.totalCollected)} collected
              </div>
            </div>
          </button>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. SIMPLE CREDIT SALE FORM (TOP-TO-BOTTOM ORDER 1 TO 8) */}
      {/* ------------------------------------------------------------- */}
      {isNewSaleOpen && (
        <div className="bg-[#0a0a0a] border border-[#FFD700]/30 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                <Plus size={20} className="text-[#FFD700]" />
                New Credit Sale
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Customer credit agreement & inventory allocation
              </p>
            </div>
            <button
              onClick={() => setIsNewSaleOpen(false)}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleCreateSaleSubmit} className="space-y-6">
            
            {/* ========================================================= */}
            {/* 1. CUSTOMER DETAILS */}
            {/* ========================================================= */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                <User size={15} className="text-[#FFD700]" />
                <span>1. Customer Details</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ali Hassan"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none min-h-[44px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300">
                    Customer Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +255 712 345 678"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* 2. ADD ITEMS */}
            {/* ========================================================= */}
            <div className="space-y-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Search size={15} className="text-[#FFD700]" />
                  <span>2. Add Items</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {inventory.length} items in catalog
                </span>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                <input
                  type="text"
                  placeholder="Search products by name or code to add..."
                  value={itemSearchTerm}
                  onChange={e => setItemSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none min-h-[44px]"
                />
              </div>

              {/* Quick-add inventory catalog list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredInventoryItems.map(item => {
                    const isAdded = saleCart.some(c => c.item.id === item.id);
                    const stock = safeNum(item.quantity);

                    return (
                      <div
                        key={item.id}
                        onClick={() => addToCart(item)}
                        className={cn(
                          "p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs min-h-[48px]",
                          isAdded
                            ? "bg-[#FFD700]/10 border-[#FFD700]/40 text-white"
                            : "bg-white/5 border-white/10 hover:border-white/20 text-slate-300"
                        )}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-white truncate">{item.name}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            <span className="text-[#FFD700] font-mono font-bold">{formatTZS(safeNum(item.selling_price))}</span>
                            <span className="mx-1">·</span>
                            <span>{stock} in stock</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-[#FFD700] px-2 py-1 bg-white/5 rounded-lg shrink-0">
                          {isAdded ? '+ More' : '+ Add'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* ========================================================= */}
            {/* 3. CART: POSITION AT THE TOP */}
            {/* Directly below the item-selection section */}
            {/* ========================================================= */}
            <div className="space-y-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Package size={15} className="text-[#FFD700]" />
                  <span>3. Cart ({saleCart.length} {saleCart.length === 1 ? 'item' : 'items'})</span>
                </span>
                {saleCart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSaleCart([])}
                    className="text-[11px] text-rose-400 hover:underline font-medium"
                  >
                    Clear Cart
                  </button>
                )}
              </div>

              {saleCart.length === 0 ? (
                <div className="py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10 text-xs text-slate-500">
                  Cart is empty. Search and add inventory items above.
                </div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {saleCart.map(c => {
                    const cost = safeNum(c.item.cost_price);
                    const price = c.customPrice !== undefined ? c.customPrice : safeNum(c.item.selling_price);
                    const lineTotal = price * c.quantity;

                    return (
                      <div key={c.item.id} className="p-3 bg-white/5 border border-white/10 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        {/* Item Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white truncate text-sm">{c.item.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            Unit Cost: {formatTZS(cost)} · Line Total: <strong className="text-[#FFD700]">{formatTZS(lineTotal)}</strong>
                          </div>
                        </div>

                        {/* Controls: Unit Price, Quantity Stepper, Subtotal, Remove */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          {/* Unit Price Edit */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500 uppercase">Price:</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={price}
                              onChange={e => updateCartCustomPrice(c.item.id, parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 bg-white/5 border border-white/10 text-[#FFD700] font-bold text-xs rounded-lg text-right outline-none min-h-[36px]"
                            />
                          </div>

                          {/* Quantity Stepper */}
                          <div className="flex items-center bg-white/10 rounded-xl overflow-hidden min-h-[36px]">
                            <button
                              type="button"
                              onClick={() => updateCartQty(c.item.id, c.quantity - 1)}
                              className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 font-black text-sm"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={c.quantity}
                              onChange={e => updateCartQty(c.item.id, parseInt(e.target.value) || 1)}
                              className="w-10 px-1 py-1 bg-transparent text-center font-mono font-bold text-white text-xs outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateCartQty(c.item.id, c.quantity + 1)}
                              className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 font-black text-sm"
                            >
                              +
                            </button>
                          </div>

                          {/* Subtotal */}
                          <div className="text-right min-w-[70px]">
                            <span className="text-[10px] text-slate-500 uppercase block">Subtotal</span>
                            <span className="font-black text-white text-xs sm:text-sm font-mono">{formatTZS(lineTotal)}</span>
                          </div>

                          {/* Remove Button */}
                          <button
                            type="button"
                            onClick={() => removeFromCart(c.item.id)}
                            className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-all"
                            title="Remove item"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ========================================================= */}
            {/* 4. SALE SUMMARY */}
            {/* ========================================================= */}
            <div className="space-y-3 pt-3 border-t border-white/10">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={15} className="text-[#FFD700]" />
                <span>4. Sale Summary</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Sale Amount
                  </span>
                  <span className="text-lg sm:text-2xl font-black text-[#FFD700] block mt-0.5">
                    {formatTZS(newSaleTotals.totalAmount)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider block">
                    Total Capital (COGS)
                  </span>
                  <span className="text-base sm:text-lg font-bold text-cyan-300 font-mono block mt-0.5">
                    {formatTZS(newSaleTotals.totalCapital)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Expected Profit
                  </span>
                  <span className="text-base sm:text-lg font-bold text-emerald-400 font-mono block mt-0.5">
                    +{formatTZS(newSaleTotals.totalProfit)}
                  </span>
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* 5. AMOUNT PAID NOW */}
            {/* Immediately below the sale summary */}
            {/* ========================================================= */}
            <div className="space-y-2 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={15} className="text-[#FFD700]" />
                  <span>5. Amount Paid Now (Initial Payment) *</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInitialPaidInput('0')}
                    className="text-[10px] font-bold px-2 py-1 rounded bg-white/5 text-slate-400 hover:text-white uppercase"
                  >
                    0 (Full Credit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInitialPaidInput(String(newSaleTotals.totalAmount))}
                    className="text-[10px] font-bold px-2 py-1 rounded bg-[#FFD700]/20 text-[#FFD700] uppercase"
                  >
                    Pay Full
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={initialPaidInput}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    setInitialPaidInput(val);
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-2xl text-xl sm:text-2xl font-black text-[#FFD700] focus:border-[#FFD700]/50 outline-none min-h-[50px]"
                />
              </div>
            </div>

            {/* ========================================================= */}
            {/* 6. REMAINING BALANCE */}
            {/* ========================================================= */}
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider block">
                  6. Remaining Balance Due
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-300 font-mono mt-0.5 block">
                  {formatTZS(Math.max(0, newSaleTotals.totalAmount - (initialPaidAmount || 0)))}
                </span>
              </div>
              <div className="text-right text-xs">
                {initialPaidAmount >= newSaleTotals.totalAmount && newSaleTotals.totalAmount > 0 ? (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold uppercase text-[10px]">
                    Fully Paid
                  </span>
                ) : initialPaidAmount > 0 ? (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold uppercase text-[10px]">
                    Partial Down Payment
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-slate-400 font-bold uppercase text-[10px]">
                    100% Credit
                  </span>
                )}
              </div>
            </div>

            {/* ========================================================= */}
            {/* 7. DUE DATE AND NOTES */}
            {/* ========================================================= */}
            <div className="space-y-3 pt-3 border-t border-white/10">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={15} className="text-[#FFD700]" />
                <span>7. Due Date and Notes</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300">
                    Agreed Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:border-[#FFD700]/50 outline-none min-h-[44px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300">
                    Notes & Collateral Reference
                  </label>
                  <input
                    type="text"
                    placeholder="Optional collateral, ID details, guarantor notes..."
                    value={saleNotes}
                    onChange={e => setSaleNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* 8. SAVE CREDIT SALE BUTTON */}
            {/* Primary action at bottom of form */}
            {/* ========================================================= */}
            <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsNewSaleOpen(false)}
                className="w-full sm:w-auto px-5 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all min-h-[48px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingSale || saleCart.length === 0 || !customerName.trim()}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#FFD700] hover:bg-[#FFD700]/90 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(255,215,0,0.25)] disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px] active:scale-95"
              >
                {isCreatingSale ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                <span>Save Credit Sale</span>
              </button>
            </div>

          </form>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. SIMPLE DEBT MANAGEMENT CARD */}
      {/* ------------------------------------------------------------- */}
      {selectedSale && !isNewSaleOpen && (
        <div className="bg-[#0a0a0a] border-2 border-[#FFD700]/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in slide-in-from-top-2">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">{selectedSale.customer_name}</h2>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                  selectedSale.status === 'paid' ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                )}>
                  {selectedSale.status}
                </span>
              </div>
              {selectedSale.customer_phone && (
                <p className="text-xs text-slate-400 mt-0.5 font-mono flex items-center gap-1">
                  <Phone size={12} className="text-slate-500" />
                  {selectedSale.customer_phone}
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setSelectedSale(null);
                setShowHistory(false);
              }}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5"
              title="Close debt details"
            >
              <X size={18} />
            </button>
          </div>

          {/* 6 Key Financial Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            
            {/* 1. Total Sale */}
            <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Sale</span>
              <span className="text-sm sm:text-base font-black text-white mt-1 block">
                {formatTZS(selectedSale.total_amount)}
              </span>
            </div>

            {/* 2. Amount Paid */}
            <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Amount Paid</span>
              <span className="text-sm sm:text-base font-black text-emerald-400 mt-1 block">
                {formatTZS(selectedSale.amount_paid)}
              </span>
            </div>

            {/* 3. Remaining Balance */}
            <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/30">
              <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">Remaining Balance</span>
              <span className="text-sm sm:text-base font-black text-amber-300 mt-1 block">
                {formatTZS(selectedSale.remaining_amount)}
              </span>
            </div>

            {/* 4. Capital Recovered / Remaining */}
            <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
              <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider block">Capital (Rec. / Rem.)</span>
              <div className="text-xs font-mono mt-1">
                <span className="text-cyan-300 font-bold block">{formatTZS(selectedSale.capital_recovered)}</span>
                <span className="text-slate-400 block text-[10px]">Rem: {formatTZS(Math.max(0, selectedSale.total_capital - selectedSale.capital_recovered))}</span>
              </div>
            </div>

            {/* 5. Profit Recovered / Remaining */}
            <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
              <span className="text-[10px] font-bold text-[#FFD700] uppercase tracking-wider block">Profit (Rec. / Rem.)</span>
              <div className="text-xs font-mono mt-1">
                <span className="text-[#FFD700] font-bold block">{formatTZS(selectedSale.profit_recovered)}</span>
                <span className="text-slate-400 block text-[10px]">Rem: {formatTZS(Math.max(0, selectedSale.total_profit - selectedSale.profit_recovered))}</span>
              </div>
            </div>

            {/* 6. Due Date & Status */}
            <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Due Date & Status</span>
              <div className="mt-1">
                <span className="text-xs font-mono text-white block">
                  {selectedSale.due_date ? new Date(selectedSale.due_date).toLocaleDateString() : 'No date'}
                </span>
                {selectedSale.status !== 'paid' && (
                  <span className={cn(
                    "text-[10px] font-bold block mt-0.5",
                    calculateDueStatus(selectedSale.due_date).category === 'overdue' ? "text-rose-400" : "text-amber-400"
                  )}>
                    {calculateDueStatus(selectedSale.due_date).label}
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* EXACTLY THREE PROMINENT ACTIONS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            
            {/* Action 1: Record Payment */}
            <button
              onClick={() => {
                setPaymentAmountInput(String(Math.min(selectedSale.remaining_amount, 50000)));
                setIsPaymentModalOpen(true);
              }}
              disabled={selectedSale.status === 'paid' || selectedSale.status === 'cancelled'}
              className="py-3.5 px-4 bg-[#FFD700] text-black font-black text-xs uppercase tracking-wider rounded-2xl hover:bg-[#FFD700]/90 transition-all shadow-[0_0_15px_rgba(255,215,0,0.25)] flex items-center justify-center gap-2 disabled:opacity-40 min-h-[48px]"
            >
              <DollarSign size={18} />
              <span>Record Payment</span>
            </button>

            {/* Action 2: Send SMS */}
            <button
              onClick={() => handleSendSms(selectedSale)}
              className="py-3.5 px-4 bg-white/10 hover:bg-white/15 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all border border-white/10 flex items-center justify-center gap-2 min-h-[48px]"
            >
              <Send size={16} />
              <span>Send SMS</span>
            </button>

            {/* Action 3: View History */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "py-3.5 px-4 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all border flex items-center justify-center gap-2 min-h-[48px]",
                showHistory 
                  ? "bg-white/20 text-white border-white/30" 
                  : "bg-white/10 hover:bg-white/15 text-white border-white/10"
              )}
            >
              <History size={16} />
              <span>{showHistory ? 'Hide History' : 'View History'}</span>
            </button>

          </div>

          {/* Collapsible History Section */}
          {showHistory && (
            <div className="pt-4 border-t border-white/10 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                
                {/* Purchased Items */}
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    Items on Credit ({selectedSale.items?.length || 0})
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {(selectedSale.items || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1 border-b border-white/5 text-slate-300">
                        <span>{item.quantity}× {item.item_name}</span>
                        <span className="font-mono text-[#FFD700]">{formatTZS(safeNum(item.selling_price) * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chronological Payment History */}
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    Payment History ({selectedSale.payments?.length || 0})
                  </span>
                  {(selectedSale.payments?.length || 0) === 0 ? (
                    <div className="text-xs text-slate-500 py-3">No payments recorded yet.</div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {selectedSale.payments?.map(p => (
                        <div key={p.id} className="p-2 bg-white/5 rounded-xl flex justify-between items-center font-mono">
                          <div>
                            <div className="font-bold text-emerald-400">{formatTZS(p.amount)}</div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(p.payment_date).toLocaleDateString()} · {p.payment_method || 'Cash'}
                            </div>
                          </div>
                          <div className="text-right text-[10px] text-slate-400">
                            <div>Cap: {formatTZS(p.capital_allocated)}</div>
                            <div>Prof: {formatTZS(p.profit_allocated)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Quiet Secondary Options */}
              <div className="flex items-center justify-end gap-3 pt-1 text-xs">
                {selectedSale.status === 'paid' && (
                  <button
                    onClick={() => handlePostToArchive(selectedSale)}
                    className="text-slate-400 hover:text-white underline text-[11px]"
                  >
                    Post to Sales Archive
                  </button>
                )}
                {selectedSale.status === 'pending' && selectedSale.amount_paid === 0 && (
                  <button
                    onClick={() => handleCancelSale(selectedSale)}
                    className="text-rose-400 hover:text-rose-300 underline text-[11px]"
                  >
                    Cancel Debt & Return Stock
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. SIMPLE DEBT LIST */}
      {/* Columns: Customer | Total | Paid | Remaining | Status | Manage */}
      {/* ------------------------------------------------------------- */}
      {!isNewSaleOpen && (
        <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-xl space-y-4 p-4 sm:p-5">
          
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                type="text"
                placeholder="Search customer name, phone, or ID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-[#FFD700]/50 outline-none min-h-[44px]"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'All Active' },
                { id: 'due-today', label: 'Due Today' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'completed', label: 'Completed' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id as DebtFilterType)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[36px]",
                    statusFilter === f.id
                      ? "bg-[#FFD700] text-black"
                      : "bg-white/5 text-slate-400 hover:text-white"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop Table View (Hidden on mobile) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[10px] text-slate-400 uppercase font-black tracking-wider">
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Total</th>
                  <th className="py-3 px-3">Paid</th>
                  <th className="py-3 px-3">Remaining</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No debts found matching the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map(sale => {
                    const isSelected = selectedSale?.id === sale.id;

                    return (
                      <tr
                        key={sale.id}
                        onClick={() => setSelectedSale(sale)}
                        className={cn(
                          "hover:bg-white/5 transition-colors cursor-pointer",
                          isSelected && "bg-[#FFD700]/5 font-bold"
                        )}
                      >
                        {/* Customer */}
                        <td className="py-3.5 px-3">
                          <span className="font-bold text-white text-sm block">{sale.customer_name}</span>
                          {sale.customer_phone && (
                            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                              <Phone size={11} className="text-slate-500" />
                              {sale.customer_phone}
                            </span>
                          )}
                        </td>

                        {/* Total */}
                        <td className="py-3.5 px-3 font-black text-white text-sm">
                          {formatTZS(sale.total_amount)}
                        </td>

                        {/* Paid */}
                        <td className="py-3.5 px-3 font-bold text-emerald-400 text-sm">
                          {formatTZS(sale.amount_paid)}
                        </td>

                        {/* Remaining */}
                        <td className="py-3.5 px-3 font-black text-amber-300 text-sm">
                          {formatTZS(sale.remaining_amount)}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-3">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                            sale.status === 'paid'
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : sale.status === 'partial'
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-white/10 text-slate-300 border border-white/10"
                          )}>
                            {sale.status}
                          </span>
                        </td>

                        {/* Manage Button */}
                        <td className="py-3.5 px-3 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedSale(sale)}
                            className="px-3.5 py-1.5 bg-[#FFD700] hover:bg-[#FFD700]/90 text-black text-xs font-black rounded-xl uppercase tracking-wider transition-all"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (Optimized for touch, zero horizontal scroll) */}
          <div className="md:hidden space-y-3">
            {filteredSales.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs">
                No debts found matching the selected filter.
              </div>
            ) : (
              filteredSales.map(sale => {
                const isSelected = selectedSale?.id === sale.id;

                return (
                  <div
                    key={sale.id}
                    onClick={() => setSelectedSale(sale)}
                    className={cn(
                      "p-4 rounded-2xl border transition-all cursor-pointer space-y-3",
                      isSelected
                        ? "bg-[#FFD700]/10 border-[#FFD700]/40"
                        : "bg-white/5 border-white/5 hover:border-white/15"
                    )}
                  >
                    {/* Top: Customer & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-white text-sm">{sale.customer_name}</h3>
                        {sale.customer_phone && (
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5">{sale.customer_phone}</p>
                        )}
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0",
                        sale.status === 'paid'
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      )}>
                        {sale.status}
                      </span>
                    </div>

                    {/* Stats Grid: Total | Paid | Remaining */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-black/40 rounded-xl text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block">Total</span>
                        <span className="font-bold text-white block truncate">{formatTZS(sale.total_amount)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block">Paid</span>
                        <span className="font-bold text-emerald-400 block truncate">{formatTZS(sale.amount_paid)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-amber-300 uppercase block">Remaining</span>
                        <span className="font-black text-amber-300 block truncate">{formatTZS(sale.remaining_amount)}</span>
                      </div>
                    </div>

                    {/* Manage Button */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedSale(sale);
                      }}
                      className="w-full py-2.5 bg-[#FFD700] text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 min-h-[44px]"
                    >
                      <span>Manage Debt</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. EASY PAYMENT INTERFACE (PROMINENT AMOUNT & CLEAR BALANCE) */}
      {/* ------------------------------------------------------------- */}
      {isPaymentModalOpen && selectedSale && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-md" onClick={() => setIsPaymentModalOpen(false)} />
          <div className="relative w-full max-w-md bg-[#0a0a0a] border border-[#FFD700]/40 rounded-3xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <DollarSign size={20} className="text-[#FFD700]" />
                  Record Payment
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Customer: <strong className="text-white">{selectedSale.customer_name}</strong>
                </p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-xl">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              
              {/* CURRENT BALANCE DISPLAY */}
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider block">
                    Current Balance Due
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-amber-300 font-mono mt-0.5 block">
                    {formatTZS(selectedSale.remaining_amount)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentAmountInput(String(selectedSale.remaining_amount))}
                  className="px-3 py-1.5 bg-[#FFD700] text-black font-black text-xs uppercase tracking-wider rounded-xl hover:bg-[#FFD700]/90 transition-all"
                >
                  Pay Full
                </button>
              </div>

              {/* PROMINENT AMOUNT FIELD */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300">
                  Payment Amount (TZS) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={paymentAmountInput}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      setPaymentAmountInput(val);
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-2xl text-xl sm:text-2xl font-black text-[#FFD700] focus:border-[#FFD700]/50 outline-none min-h-[52px]"
                    placeholder="Enter amount..."
                  />
                </div>
              </div>

              {/* Capital vs Profit Allocation Breakdown */}
              <div className="p-3 bg-white/5 rounded-xl space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Capital Recovered (COGS):</span>
                  <span className="text-cyan-300 font-bold">+{formatTZS(paymentAllocationPreview.capital)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Profit Realized:</span>
                  <span className="text-[#FFD700] font-bold">+{formatTZS(paymentAllocationPreview.profit)}</span>
                </div>
                <div className="pt-1.5 border-t border-white/5 flex justify-between font-bold">
                  <span className="text-slate-400">New Remaining Balance:</span>
                  <span className="text-amber-300">{formatTZS(paymentAllocationPreview.newRemaining)}</span>
                </div>
              </div>

              {/* Payment Method & Reference */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white outline-none min-h-[42px]"
                  >
                    <option value="Cash">Cash</option>
                    <option value="M-Pesa / Mobile">Mobile Money</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card">Card</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Reference #</label>
                  <input
                    type="text"
                    placeholder="e.g. MPESA-123"
                    value={paymentReference}
                    onChange={e => setPaymentReference(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 outline-none min-h-[42px]"
                  />
                </div>
              </div>

              {/* ONE OBVIOUS CONFIRMATION BUTTON */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider min-h-[48px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentSubmitting || paymentAmount <= 0}
                  className="flex-[2] py-3.5 bg-[#FFD700] hover:bg-[#FFD700]/90 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(255,215,0,0.3)] disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
                >
                  {paymentSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  <span>Confirm Payment</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUPABASE SQL MIGRATION MODAL (SETUP HELPER) */}
      {/* ------------------------------------------------------------- */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-md" onClick={() => setIsSqlModalOpen(false)} />
          <div className="relative w-full max-w-xl bg-[#0a0a0a] border border-[#FFD700]/40 rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                <Database size={18} className="text-[#FFD700]" />
                Supabase Tables Setup
              </h3>
              <button onClick={() => setIsSqlModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Copy this SQL script and execute it in your Supabase SQL Editor. It creates the 4 isolated tables with Row Level Security.
            </p>

            <div className="bg-[#050505] border border-white/10 rounded-2xl p-3.5 max-h-[220px] overflow-y-auto font-mono text-[11px] text-slate-300">
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

ALTER TABLE public.credit_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage credit_sales" ON public.credit_sales
    FOR ALL TO authenticated USING (true) WITH CHECK (true);`}</pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 font-mono">
                {copiedSql ? '✓ Copied to clipboard!' : 'Click to copy script'}
              </span>
              <button
                onClick={copySqlMigration}
                className="flex items-center gap-2 px-4 py-2 bg-[#FFD700] text-black font-black text-xs rounded-xl uppercase tracking-wider hover:bg-[#FFD700]/90 transition-all"
              >
                <Copy size={14} />
                <span>{copiedSql ? 'Copied!' : 'Copy SQL'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
