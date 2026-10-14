// ==============================================================================
// DEBT POS / CREDIT SALES SERVICE & ENGINE
// Authoritative Cloud Implementation using Supabase (wnzbavrtgnuchdovndxm.supabase.co)
// Direct multi-device synchronization with Supabase Realtime.
// Zero local-only authoritative storage.
// ==============================================================================

import { supabase, isConfigured } from './supabase';
import { CreditSale, CreditSaleItem, CreditPayment, CreditReminder, DebtDashboardMetrics } from '../types/debtPos';

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
    if (!error) return true;
    if (
      error.code === 'PGRST205' || 
      error.message?.includes('schema cache') ||
      error.message?.includes('does not exist')
    ) {
      return false;
    }
    // If table exists but has RLS policy / permission error (e.g. 42501), the table DOES exist in Postgres
    return true;
  } catch {
    return false;
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

// Fetch all Credit Sales DIRECTLY from Supabase (No local-only authoritative storage)
export async function fetchCreditSales(): Promise<{ sales: CreditSale[]; tablesExist: boolean; error: string | null }> {
  if (!isConfigured) {
    return { sales: [], tablesExist: false, error: 'Supabase credentials are not configured.' };
  }

  try {
    const [salesRes, itemsRes, paymentsRes, remindersRes] = await Promise.all([
      supabase.from('credit_sales').select('*').order('created_at', { ascending: false }),
      supabase.from('credit_sale_items').select('*'),
      supabase.from('credit_payments').select('*').order('created_at', { ascending: true }),
      supabase.from('credit_reminders').select('*').order('created_at', { ascending: false })
    ]);

    // Check if tables are missing or permission is denied
    if (salesRes.error) {
      const isMissing = 
        salesRes.error.code === 'PGRST205' || 
        salesRes.error.message?.includes('schema cache') ||
        salesRes.error.message?.includes('does not exist');

      if (isMissing) {
        return { 
          sales: [], 
          tablesExist: false, 
          error: 'Supabase table "credit_sales" does not exist in the database. Please run the SQL migration in Supabase SQL Editor.' 
        };
      }

      if (salesRes.error.code === '42501') {
        return {
          sales: [],
          tablesExist: true,
          error: 'Access restricted (42501): Please ensure you are logged into RetailOS with an authenticated user account to access Debt POS.'
        };
      }

      throw salesRes.error;
    }

    if (itemsRes.error) {
      console.warn('credit_sale_items fetch warning:', itemsRes.error);
    }
    if (paymentsRes.error) {
      console.warn('credit_payments fetch warning:', paymentsRes.error);
    }
    if (remindersRes.error) {
      console.warn('credit_reminders fetch warning:', remindersRes.error);
    }

    const rawSales = salesRes.data || [];
    const rawItems = itemsRes.data || [];
    const rawPayments = paymentsRes.data || [];
    const rawReminders = remindersRes.data || [];

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
    console.error('Error fetching credit sales directly from Supabase:', err);
    const isMissing = 
      err?.code === 'PGRST205' || 
      err?.message?.includes('schema cache') ||
      err?.message?.includes('does not exist');

    return { 
      sales: [], 
      tablesExist: !isMissing, 
      error: err.message || 'Failed to load cloud credit sales from Supabase.' 
    };
  }
}

// Create a new Credit Sale DIRECTLY in Supabase
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
  if (!isConfigured) {
    return { creditSale: null as any, error: 'Supabase credentials are not configured.' };
  }

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

  const total_profit = Math.max(0, total_amount - total_capital);
  const remaining_amount = total_amount;

  const validDueDate = payload.due_date && /^\d{4}-\d{2}-\d{2}$/.test(payload.due_date) 
    ? payload.due_date 
    : null;

  const creditSaleData = {
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
    due_date: validDueDate,
    status: 'pending' as const,
    notes: payload.notes?.trim() || null,
    created_at: createdAt,
    completed_at: null
  };

  // 2. Perform Supabase Database Transaction:
  // Step A: Insert credit_sales in Supabase
  const { error: saleErr } = await supabase.from('credit_sales').insert([creditSaleData]);
  if (saleErr) {
    console.error('Supabase credit_sales insert error:', saleErr);
    if (
      saleErr.code === 'PGRST205' || 
      saleErr.message?.includes('schema cache') ||
      saleErr.message?.includes('does not exist')
    ) {
      return { 
        creditSale: null as any, 
        error: 'Supabase table "credit_sales" does not exist in the database. Please run the SQL migration in Supabase SQL Editor first.' 
      };
    }
    if (saleErr.code === '42501') {
      return {
        creditSale: null as any,
        error: 'Permission denied (42501): Please ensure you are logged into RetailOS with an authenticated account.'
      };
    }
    return { creditSale: null as any, error: saleErr.message || 'Failed to insert credit sale into Supabase.' };
  }

  // Step B: Insert credit_sale_items in Supabase
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

  if (itemsErr) {
    console.error('Supabase credit_sale_items insert error:', itemsErr);
    // Cleanup parent to prevent orphan
    await supabase.from('credit_sales').delete().eq('id', saleId);
    return { creditSale: null as any, error: itemsErr.message || 'Failed to insert credit sale items into Supabase.' };
  }

  // Step C: Inventory Deduction in Supabase using established mechanism (POS.tsx)
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
  } catch (invErr) {
    console.warn('Inventory stock deduction notice:', invErr);
  }

  const completeCreditSale: CreditSale = {
    ...creditSaleData,
    items: preparedItems,
    payments: [],
    reminders: []
  };

  return { creditSale: completeCreditSale, error: null };
}

// Record a Payment DIRECTLY in Supabase with Capital-First Recovery Logic
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
  if (!isConfigured) {
    return { payment: null as any, updatedSale: sale, error: 'Supabase credentials are not configured.' };
  }

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

  // 1. Insert payment directly into Supabase
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

  if (payErr) {
    console.error('Supabase credit_payments insert error:', payErr);
    if (payErr.code === '42501') {
      return { payment: null as any, updatedSale: sale, error: 'Permission denied (42501): Authenticated user session required to record payments.' };
    }
    return { payment: null as any, updatedSale: sale, error: payErr.message || 'Failed to record payment in Supabase.' };
  }

  // 2. Update credit_sales directly in Supabase
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

  if (updateErr) {
    console.error('Supabase credit_sales update error:', updateErr);
    if (updateErr.code === '42501') {
      return { payment: null as any, updatedSale: sale, error: 'Permission denied (42501): Authenticated user session required to update credit sale balance.' };
    }
    return { payment: null as any, updatedSale: sale, error: updateErr.message || 'Failed to update credit sale balance in Supabase.' };
  }

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

  // If fully paid, post to Sales Archive via ledger integration
  if (new_status === 'paid') {
    try {
      await postFullyPaidToSalesArchive(updatedSale);
      updatedSale.posted_to_ledger = true;
    } catch (archiveErr) {
      console.warn('Notice: Sales Archive posting error:', archiveErr);
    }
  }

  return { payment: newPayment, updatedSale, error: null };
}

// Cancel a Credit Sale directly in Supabase (Mark as cancelled, never delete, restore stock)
export async function cancelCreditSale(sale: CreditSale): Promise<{ success: boolean; error: string | null }> {
  if (!isConfigured) {
    return { success: false, error: 'Supabase credentials are not configured.' };
  }

  if (sale.amount_paid > 0) {
    return { success: false, error: 'Cannot cancel a credit sale that has recorded payments' };
  }

  // Restore inventory using established pattern from Sales.tsx
  if (sale.items) {
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

  // Update status to 'cancelled' in Supabase
  const { error: cancelErr } = await supabase
    .from('credit_sales')
    .update({ status: 'cancelled' })
    .eq('id', sale.id);

  if (cancelErr) {
    return { success: false, error: cancelErr.message || 'Failed to cancel credit sale in Supabase.' };
  }

  return { success: true, error: null };
}

// Send / Record SMS Reminder directly in Supabase
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

  // Persist reminder directly to Supabase
  if (isConfigured) {
    try {
      await supabase.from('credit_reminders').insert([{
        id: reminderId,
        credit_sale_id: sale.id,
        reminder_type: reminderType,
        scheduled_date: sale.due_date || new Date().toISOString().slice(0, 10),
        message,
        sent_at: sentAt,
        status: 'sent',
        created_at: sentAt
      }]);
    } catch (err) {
      console.warn('Failed to insert reminder into Supabase:', err);
    }
  }

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

// Post Fully Paid Credit Sale to Existing Sales Archive via Ledger
export async function postFullyPaidToSalesArchive(sale: CreditSale): Promise<{ success: boolean; error: string | null }> {
  if (sale.remaining_amount > 0 || sale.status !== 'paid') {
    return { success: false, error: 'Only fully settled credit sales can be posted to the Sales Archive' };
  }

  if (!isConfigured) {
    return { success: true, error: null };
  }

  try {
    // Check if already posted
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

// Realtime Subscription: Listens for postgres_changes on the 4 Debt POS tables
export function subscribeToDebtPosRealtime(onDataChange: () => void): () => void {
  if (!isConfigured) return () => {};

  const channelName = `debt-pos-realtime-${Date.now()}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'credit_sales' },
      (payload) => {
        console.log('Realtime change in credit_sales:', payload);
        onDataChange();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'credit_payments' },
      (payload) => {
        console.log('Realtime change in credit_payments:', payload);
        onDataChange();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'credit_sale_items' },
      (payload) => {
        console.log('Realtime change in credit_sale_items:', payload);
        onDataChange();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'credit_reminders' },
      (payload) => {
        console.log('Realtime change in credit_reminders:', payload);
        onDataChange();
      }
    )
    .subscribe((status) => {
      console.log('Debt POS Realtime channel status:', status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
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
