// ==============================================================================
// DEBT POS / CREDIT SALES SERVICE & ENGINE
// Completely isolated from existing accounting and inventory calculations.
// Reads existing inventory using standard queries and uses approved stock updates.
// ==============================================================================

import { supabase, isConfigured } from './supabase';
import { CreditSale, CreditSaleItem, CreditPayment, CreditReminder, DebtDashboardMetrics } from '../types/debtPos';

const STORAGE_KEYS = {
  SALES: 'retailos_credit_sales_cache',
  ITEMS: 'retailos_credit_sale_items_cache',
  PAYMENTS: 'retailos_credit_payments_cache',
  REMINDERS: 'retailos_credit_reminders_cache',
  TABLES_EXIST: 'retailos_credit_tables_exist_flag'
};

// Safe numerical helper
export const safeNum = (val: any): number => {
  const n = parseFloat(String(val ?? 0));
  return isNaN(n) ? 0 : n;
};

// Format currency as TZS
export const formatTZS = (amount: number): string => {
  return `TZS ${Math.round(amount).toLocaleString('en-US')}`;
};

// Check if Supabase credit tables exist in database
export async function checkCreditTablesExist(): Promise<boolean> {
  if (!isConfigured) return false;
  try {
    const { error } = await supabase.from('credit_sales').select('id').limit(1);
    const exists = !error || (error.code !== 'PGRST205' && !error.message?.includes('schema cache'));
    localStorage.setItem(STORAGE_KEYS.TABLES_EXIST, exists ? 'true' : 'false');
    return exists;
  } catch {
    return false;
  }
}

// Local storage fallback helpers for 100% resilient operation
function getLocal<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLocal<T>(key: string, data: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`Failed to save ${key} to localStorage:`, err);
  }
}

// Calculate Due Date Status
export interface DueStatus {
  category: 'future' | 'today' | 'overdue' | 'none';
  daysDiff: number;
  label: string;
}

export function calculateDueStatus(dueDateStr?: string | null): DueStatus {
  if (!dueDateStr) {
    return { category: 'none', daysDiff: 0, label: 'No due date set' };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const [y, m, d] = dueDateStr.split('-').map(Number);
  const due = new Date(y, m - 1, d);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { category: 'today', daysDiff: 0, label: 'Due today' };
  } else if (diffDays > 0) {
    return { 
      category: 'future', 
      daysDiff: diffDays, 
      label: diffDays === 1 ? 'Due tomorrow' : `Due in ${diffDays} days` 
    };
  } else {
    const overdueDays = Math.abs(diffDays);
    return { 
      category: 'overdue', 
      daysDiff: overdueDays, 
      label: overdueDays === 1 ? 'Overdue by 1 day' : `Overdue by ${overdueDays} days` 
    };
  }
}

// Fetch all Credit Sales with hydrated items, payments, and reminders
export async function fetchCreditSales(): Promise<{ sales: CreditSale[]; tablesExist: boolean; error: string | null }> {
  let tablesExist = false;
  try {
    tablesExist = await checkCreditTablesExist();
  } catch {
    tablesExist = false;
  }

  if (tablesExist && isConfigured) {
    try {
      const [salesRes, itemsRes, paymentsRes, remindersRes] = await Promise.all([
        supabase.from('credit_sales').select('*').order('created_at', { ascending: false }),
        supabase.from('credit_sale_items').select('*'),
        supabase.from('credit_payments').select('*').order('created_at', { ascending: true }),
        supabase.from('credit_reminders').select('*').order('created_at', { ascending: false })
      ]);

      if (salesRes.error) throw salesRes.error;

      const rawSales = salesRes.data || [];
      const rawItems = itemsRes.data || [];
      const rawPayments = paymentsRes.data || [];
      const rawReminders = remindersRes.data || [];

      // Save to local cache for offline resilience
      saveLocal(STORAGE_KEYS.SALES, rawSales);
      saveLocal(STORAGE_KEYS.ITEMS, rawItems);
      saveLocal(STORAGE_KEYS.PAYMENTS, rawPayments);
      saveLocal(STORAGE_KEYS.REMINDERS, rawReminders);

      const hydrated: CreditSale[] = rawSales.map(sale => ({
        ...sale,
        total_amount: safeNum(sale.total_amount),
        total_capital: safeNum(sale.total_capital),
        total_profit: safeNum(sale.total_profit),
        amount_paid: safeNum(sale.amount_paid),
        remaining_amount: safeNum(sale.remaining_amount),
        capital_recovered: safeNum(sale.capital_recovered),
        profit_recovered: safeNum(sale.profit_recovered),
        items: rawItems.filter(i => i.credit_sale_id === sale.id),
        payments: rawPayments.filter(p => p.credit_sale_id === sale.id),
        reminders: rawReminders.filter(r => r.credit_sale_id === sale.id)
      }));

      return { sales: hydrated, tablesExist: true, error: null };
    } catch (err: any) {
      console.warn('Supabase fetch failed, falling back to local cache:', err);
    }
  }

  // Fallback to local storage cache
  const localSales = getLocal<CreditSale>(STORAGE_KEYS.SALES);
  const localItems = getLocal<CreditSaleItem>(STORAGE_KEYS.ITEMS);
  const localPayments = getLocal<CreditPayment>(STORAGE_KEYS.PAYMENTS);
  const localReminders = getLocal<CreditReminder>(STORAGE_KEYS.REMINDERS);

  const hydrated = localSales.map(sale => ({
    ...sale,
    total_amount: safeNum(sale.total_amount),
    total_capital: safeNum(sale.total_capital),
    total_profit: safeNum(sale.total_profit),
    amount_paid: safeNum(sale.amount_paid),
    remaining_amount: safeNum(sale.remaining_amount),
    capital_recovered: safeNum(sale.capital_recovered),
    profit_recovered: safeNum(sale.profit_recovered),
    items: localItems.filter(i => i.credit_sale_id === sale.id),
    payments: localPayments.filter(p => p.credit_sale_id === sale.id),
    reminders: localReminders.filter(r => r.credit_sale_id === sale.id)
  }));

  return { sales: hydrated, tablesExist, error: null };
}

// Create a new Credit Sale with exact financial formulas and approved inventory deduction
export interface NewCreditSalePayload {
  customer_name: string;
  customer_phone?: string;
  due_date?: string;
  notes?: string;
  items: Array<{
    inventory_item_id: string;
    item_name: string;
    quantity: number;
    cost_price: number;
    selling_price: number;
    category_id?: number;
  }>;
}

export async function createCreditSale(payload: NewCreditSalePayload): Promise<{ creditSale: CreditSale; error: string | null }> {
  if (!payload.customer_name?.trim()) {
    return { creditSale: null as any, error: 'Customer name is required' };
  }

  if (!payload.items || payload.items.length === 0) {
    return { creditSale: null as any, error: 'At least one item is required for a credit sale' };
  }

  // 1. Calculate per-item capital and profit
  let total_capital = 0;
  let total_amount = 0;

  const saleId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const preparedItems: CreditSaleItem[] = payload.items.map(item => {
    const qty = safeNum(item.quantity);
    const cost = safeNum(item.cost_price);
    const price = safeNum(item.selling_price);

    const capital_amount = cost * qty;
    const profit_amount = (price - cost) * qty;

    total_capital += capital_amount;
    total_amount += price * qty;

    return {
      id: crypto.randomUUID(),
      credit_sale_id: saleId,
      inventory_item_id: item.inventory_item_id,
      item_name: item.item_name,
      quantity: qty,
      cost_price: cost,
      selling_price: price,
      capital_amount,
      profit_amount,
      created_at: createdAt,
      category_id: item.category_id
    };
  });

  const total_profit = total_amount - total_capital;
  const remaining_amount = total_amount;

  const creditSale: CreditSale = {
    id: saleId,
    customer_name: payload.customer_name.trim(),
    customer_phone: payload.customer_phone?.trim() || null,
    total_amount,
    total_capital,
    total_profit,
    amount_paid: 0,
    remaining_amount,
    capital_recovered: 0,
    profit_recovered: 0,
    due_date: payload.due_date || null,
    status: 'pending',
    notes: payload.notes?.trim() || null,
    created_at: createdAt,
    completed_at: null,
    items: preparedItems,
    payments: [],
    reminders: []
  };

  // 2. Inventory Deduction: Follows approved existing application pattern (POS.tsx)
  if (isConfigured) {
    try {
      await Promise.all(payload.items.map(async (cartItem) => {
        const { data: latest } = await supabase
          .from('inventory')
          .select('quantity')
          .eq('id', cartItem.inventory_item_id)
          .single();

        const currentStock = safeNum(latest?.quantity);
        const newStock = Math.max(0, currentStock - cartItem.quantity);

        await supabase
          .from('inventory')
          .update({ quantity: newStock })
          .eq('id', cartItem.inventory_item_id);
      }));
    } catch (err: any) {
      console.warn('Inventory deduction warning on server:', err);
    }
  }

  // 3. Persist to Supabase if tables exist
  const tablesExist = await checkCreditTablesExist();
  if (tablesExist && isConfigured) {
    try {
      const { error: saleErr } = await supabase.from('credit_sales').insert([{
        id: creditSale.id,
        customer_name: creditSale.customer_name,
        customer_phone: creditSale.customer_phone,
        total_amount: creditSale.total_amount,
        total_capital: creditSale.total_capital,
        total_profit: creditSale.total_profit,
        amount_paid: creditSale.amount_paid,
        remaining_amount: creditSale.remaining_amount,
        capital_recovered: creditSale.capital_recovered,
        profit_recovered: creditSale.profit_recovered,
        due_date: creditSale.due_date,
        status: creditSale.status,
        notes: creditSale.notes,
        created_at: creditSale.created_at
      }]);

      if (saleErr) throw saleErr;

      const { error: itemsErr } = await supabase.from('credit_sale_items').insert(
        preparedItems.map(i => ({
          id: i.id,
          credit_sale_id: i.credit_sale_id,
          inventory_item_id: i.inventory_item_id,
          item_name: i.item_name,
          quantity: i.quantity,
          cost_price: i.cost_price,
          selling_price: i.selling_price,
          capital_amount: i.capital_amount,
          profit_amount: i.profit_amount,
          created_at: i.created_at
        }))
      );

      if (itemsErr) throw itemsErr;
    } catch (err: any) {
      console.warn('Supabase credit sale insert error, using local fallback:', err);
    }
  }

  // 4. Update local cache
  const localSales = getLocal<CreditSale>(STORAGE_KEYS.SALES);
  const localItems = getLocal<CreditSaleItem>(STORAGE_KEYS.ITEMS);
  saveLocal(STORAGE_KEYS.SALES, [creditSale, ...localSales]);
  saveLocal(STORAGE_KEYS.ITEMS, [...preparedItems, ...localItems]);

  return { creditSale, error: null };
}

// Record a Payment with Capital-First Recovery Logic
export interface NewPaymentPayload {
  credit_sale_id: string;
  amount: number;
  payment_method?: string;
  reference?: string;
  notes?: string;
}

export async function recordCreditPayment(
  sale: CreditSale, 
  payload: NewPaymentPayload
): Promise<{ payment: CreditPayment; updatedSale: CreditSale; error: string | null }> {
  const paymentAmount = safeNum(payload.amount);

  if (paymentAmount <= 0) {
    return { payment: null as any, updatedSale: sale, error: 'Payment amount must be greater than zero' };
  }

  if (paymentAmount > sale.remaining_amount) {
    return { 
      payment: null as any, 
      updatedSale: sale, 
      error: `Payment amount (${formatTZS(paymentAmount)}) exceeds remaining debt (${formatTZS(sale.remaining_amount)})` 
    };
  }

  // EXACT CAPITAL-FIRST RECOVERY FORMULA
  // capital_remaining_before_payment = total_capital - capital_recovered
  // capital_allocated = MIN(payment_amount, capital_remaining_before_payment)
  // profit_allocated = payment_amount - capital_allocated
  const capital_remaining_before = Math.max(0, sale.total_capital - sale.capital_recovered);
  const capital_allocated = Math.min(paymentAmount, capital_remaining_before);
  const profit_allocated = paymentAmount - capital_allocated;

  // New Totals
  const new_amount_paid = sale.amount_paid + paymentAmount;
  const new_remaining_amount = Math.max(0, sale.total_amount - new_amount_paid);
  const new_capital_recovered = Math.min(sale.total_capital, sale.capital_recovered + capital_allocated);
  const new_profit_recovered = Math.min(sale.total_profit, sale.profit_recovered + profit_allocated);

  // Status transitions:
  // if remaining_amount == 0 => 'paid'
  // else => 'partial'
  const new_status: 'paid' | 'partial' = new_remaining_amount === 0 ? 'paid' : 'partial';
  const completed_at = new_remaining_amount === 0 ? new Date().toISOString() : null;

  const paymentId = crypto.randomUUID();
  const paymentDate = new Date().toISOString();

  const newPayment: CreditPayment = {
    id: paymentId,
    credit_sale_id: sale.id,
    amount: paymentAmount,
    capital_allocated,
    profit_allocated,
    payment_method: payload.payment_method || 'Cash',
    payment_date: paymentDate,
    reference: payload.reference?.trim() || null,
    notes: payload.notes?.trim() || null,
    created_at: paymentDate
  };

  const updatedSale: CreditSale = {
    ...sale,
    amount_paid: new_amount_paid,
    remaining_amount: new_remaining_amount,
    capital_recovered: new_capital_recovered,
    profit_recovered: new_profit_recovered,
    status: new_status,
    completed_at,
    payments: [...(sale.payments || []), newPayment]
  };

  // If fully paid, optionally post to the existing Sales Archive via ledger integration
  if (new_status === 'paid') {
    try {
      await postFullyPaidToSalesArchive(updatedSale);
      updatedSale.posted_to_ledger = true;
    } catch (archiveErr) {
      console.warn('Notice: Sales Archive posting will be available on demand:', archiveErr);
    }
  }

  // Persist to Supabase if tables exist
  const tablesExist = await checkCreditTablesExist();
  if (tablesExist && isConfigured) {
    try {
      // 1. Insert permanent payment record
      const { error: payErr } = await supabase.from('credit_payments').insert([{
        id: newPayment.id,
        credit_sale_id: newPayment.credit_sale_id,
        amount: newPayment.amount,
        capital_allocated: newPayment.capital_allocated,
        profit_allocated: newPayment.profit_allocated,
        payment_method: newPayment.payment_method,
        payment_date: newPayment.payment_date,
        reference: newPayment.reference,
        notes: newPayment.notes,
        created_at: newPayment.created_at
      }]);

      if (payErr) throw payErr;

      // 2. Update credit sale header
      const { error: updateErr } = await supabase
        .from('credit_sales')
        .update({
          amount_paid: new_amount_paid,
          remaining_amount: new_remaining_amount,
          capital_recovered: new_capital_recovered,
          profit_recovered: new_profit_recovered,
          status: new_status,
          completed_at
        })
        .eq('id', sale.id);

      if (updateErr) throw updateErr;
    } catch (err: any) {
      console.warn('Supabase payment recording error, using local fallback:', err);
    }
  }

  // Update local cache
  const localSales = getLocal<CreditSale>(STORAGE_KEYS.SALES);
  const updatedLocalSales = localSales.map(s => s.id === sale.id ? updatedSale : s);
  saveLocal(STORAGE_KEYS.SALES, updatedLocalSales);

  const localPayments = getLocal<CreditPayment>(STORAGE_KEYS.PAYMENTS);
  saveLocal(STORAGE_KEYS.PAYMENTS, [...localPayments, newPayment]);

  return { payment: newPayment, updatedSale, error: null };
}

// Isolated Integration: Post Fully Paid Credit Sale to Existing Sales Archive
// Uses standard ledger table insert without altering schema or Sales.tsx logic
export async function postFullyPaidToSalesArchive(sale: CreditSale): Promise<{ success: boolean; error: string | null }> {
  if (sale.remaining_amount > 0 || sale.status !== 'paid') {
    return { success: false, error: 'Only fully settled credit sales can be posted to the Sales Archive' };
  }

  if (!isConfigured) {
    return { success: true, error: null };
  }

  try {
    // Check if already posted by checking reference in ledger
    const { data: existing } = await supabase
      .from('ledger')
      .select('id')
      .ilike('description', `%Credit Ref: ${sale.id}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: true, error: null }; // Already posted
    }

    const items = sale.items || [];
    if (items.length === 0) return { success: true, error: null };

    const ledgerEntries = items.map(item => ({
      category_id: item.category_id || 1,
      inventory_item_id: item.inventory_item_id,
      quantity: safeNum(item.quantity),
      amount: safeNum(item.selling_price) * safeNum(item.quantity),
      cost_price: safeNum(item.cost_price),
      transaction_type: 'sale' as const,
      fund_source: 'Credit Settlement',
      description: `Settled Credit Sale: ${item.item_name} (x${item.quantity}) - Customer: ${sale.customer_name} (Credit Ref: ${sale.id})`,
      created_at: sale.completed_at || new Date().toISOString()
    }));

    const { error: ledgerError } = await supabase.from('ledger').insert(ledgerEntries);
    if (ledgerError) throw ledgerError;

    return { success: true, error: null };
  } catch (err: any) {
    console.error('Error posting settled credit sale to ledger:', err);
    return { success: false, error: err.message || 'Failed to post to Sales Archive' };
  }
}

// Cancel a Credit Sale (Mark as cancelled, never delete, restore stock)
export async function cancelCreditSale(sale: CreditSale): Promise<{ success: boolean; error: string | null }> {
  if (sale.amount_paid > 0) {
    return { success: false, error: 'Cannot cancel a credit sale that has recorded payments' };
  }

  // Restore inventory using established pattern from Sales.tsx
  if (isConfigured && sale.items) {
    try {
      await Promise.all(sale.items.map(async (item) => {
        const { data: latest } = await supabase
          .from('inventory')
          .select('quantity')
          .eq('id', item.inventory_item_id)
          .single();

        const currentStock = safeNum(latest?.quantity);
        const restoredStock = currentStock + safeNum(item.quantity);

        await supabase
          .from('inventory')
          .update({ quantity: restoredStock })
          .eq('id', item.inventory_item_id);
      }));
    } catch (err) {
      console.warn('Failed to restore inventory on cancel:', err);
    }
  }

  const tablesExist = await checkCreditTablesExist();
  if (tablesExist && isConfigured) {
    try {
      await supabase
        .from('credit_sales')
        .update({ status: 'cancelled' })
        .eq('id', sale.id);
    } catch (err) {
      console.warn('Failed to update status to cancelled on server:', err);
    }
  }

  // Update local cache
  const localSales = getLocal<CreditSale>(STORAGE_KEYS.SALES);
  const updated = localSales.map(s => s.id === sale.id ? { ...s, status: 'cancelled' as const } : s);
  saveLocal(STORAGE_KEYS.SALES, updated);

  return { success: true, error: null };
}

// Send / Generate SMS Reminder
export async function recordAndLaunchSmsReminder(sale: CreditSale): Promise<{ message: string; launched: boolean }> {
  const dueStatus = calculateDueStatus(sale.due_date);
  const amountStr = formatTZS(sale.remaining_amount);
  const dateFormatted = sale.due_date 
    ? new Date(sale.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'as agreed';

  let message = '';
  let reminderType: 'due' | 'overdue' = 'due';

  if (dueStatus.category === 'overdue') {
    reminderType = 'overdue';
    message = `Dear ${sale.customer_name}, your outstanding balance of ${amountStr} is overdue by ${dueStatus.daysDiff} days. Kindly arrange payment as soon as possible. Thank you.`;
  } else {
    reminderType = 'due';
    message = `Dear ${sale.customer_name}, your outstanding balance is ${amountStr}. Your payment is due on ${dateFormatted}. Kindly arrange payment. Thank you.`;
  }

  const reminderId = crypto.randomUUID();
  const sentAt = new Date().toISOString();

  const newReminder: CreditReminder = {
    id: reminderId,
    credit_sale_id: sale.id,
    reminder_type: reminderType,
    scheduled_date: sale.due_date || new Date().toISOString().slice(0, 10),
    message,
    sent_at: sentAt,
    status: 'sent',
    created_at: sentAt
  };

  // Persist reminder to Supabase
  const tablesExist = await checkCreditTablesExist();
  if (tablesExist && isConfigured) {
    try {
      await supabase.from('credit_reminders').insert([{
        id: newReminder.id,
        credit_sale_id: newReminder.credit_sale_id,
        reminder_type: newReminder.reminder_type,
        scheduled_date: newReminder.scheduled_date,
        message: newReminder.message,
        sent_at: newReminder.sent_at,
        status: newReminder.status,
        created_at: newReminder.created_at
      }]);
    } catch (err) {
      console.warn('Failed to insert reminder into Supabase:', err);
    }
  }

  // Update local cache
  const localReminders = getLocal<CreditReminder>(STORAGE_KEYS.REMINDERS);
  saveLocal(STORAGE_KEYS.REMINDERS, [newReminder, ...localReminders]);

  // Copy to clipboard
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(message);
    }
  } catch {}

  // Launch device SMS app if phone is available
  let launched = false;
  if (sale.customer_phone) {
    const cleanPhone = sale.customer_phone.replace(/[^0-9+]/g, '');
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
    try {
      window.location.href = smsUrl;
      launched = true;
    } catch (e) {
      console.warn('Failed to launch native SMS:', e);
    }
  }

  return { message, launched };
}

// Compute All Debt Dashboard Metrics
export function computeDebtDashboardMetrics(sales: CreditSale[]): DebtDashboardMetrics {
  const activeSales = sales.filter(s => s.status !== 'cancelled');

  let totalCreditSalesVolume = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let capitalPendingRecovery = 0;
  let profitPendingRecovery = 0;

  let dueTodayCount = 0;
  let dueTodayAmount = 0;
  let dueWithin7DaysCount = 0;
  let dueWithin7DaysAmount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let paidCount = 0;

  activeSales.forEach(sale => {
    totalCreditSalesVolume += sale.total_amount;
    totalCollected += sale.amount_paid;
    totalOutstanding += sale.remaining_amount;

    // Remaining capital pending recovery
    const capRemaining = Math.max(0, sale.total_capital - sale.capital_recovered);
    capitalPendingRecovery += capRemaining;

    // Remaining profit pending recovery
    const profRemaining = Math.max(0, sale.total_profit - sale.profit_recovered);
    profitPendingRecovery += profRemaining;

    if (sale.status === 'paid') {
      paidCount++;
    } else if (sale.status === 'pending' || sale.status === 'partial') {
      const dueStatus = calculateDueStatus(sale.due_date);
      if (dueStatus.category === 'today') {
        dueTodayCount++;
        dueTodayAmount += sale.remaining_amount;
      } else if (dueStatus.category === 'overdue') {
        overdueCount++;
        overdueAmount += sale.remaining_amount;
      } else if (dueStatus.category === 'future' && dueStatus.daysDiff <= 7) {
        dueWithin7DaysCount++;
        dueWithin7DaysAmount += sale.remaining_amount;
      }
    }
  });

  return {
    totalCreditSalesCount: activeSales.length,
    totalCreditSalesVolume,
    totalCollected,
    totalOutstanding,
    capitalPendingRecovery,
    profitPendingRecovery,
    dueTodayCount,
    dueTodayAmount,
    dueWithin7DaysCount,
    dueWithin7DaysAmount,
    overdueCount,
    overdueAmount,
    paidCount
  };
}
