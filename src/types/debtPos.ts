// Isolated Types for Debt POS / Credit Sales Module
// completely decoupled from existing system types

export type CreditSaleStatus = 'pending' | 'partial' | 'paid' | 'cancelled';
export type ReminderType = 'due' | 'overdue';
export type ReminderStatus = 'pending' | 'sent';

export interface CreditSale {
  id: string;
  customer_name: string;
  customer_phone?: string | null;
  total_amount: number;
  total_capital: number;
  total_profit: number;
  amount_paid: number;
  remaining_amount: number;
  capital_recovered: number;
  profit_recovered: number;
  due_date?: string | null;
  status: CreditSaleStatus;
  notes?: string | null;
  created_at: string;
  completed_at?: string | null;
  // Hydrated joins
  items?: CreditSaleItem[];
  payments?: CreditPayment[];
  reminders?: CreditReminder[];
  posted_to_ledger?: boolean;
}

export interface CreditSaleItem {
  id: string;
  credit_sale_id: string;
  inventory_item_id: string;
  item_name: string;
  quantity: number;
  cost_price: number;
  selling_price: number;
  capital_amount: number;
  profit_amount: number;
  created_at: string;
  category_id?: number;
}

export interface CreditPayment {
  id: string;
  credit_sale_id: string;
  amount: number;
  capital_allocated: number;
  profit_allocated: number;
  payment_method?: string | null;
  payment_date: string;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface CreditReminder {
  id: string;
  credit_sale_id: string;
  reminder_type: ReminderType;
  scheduled_date: string;
  message: string;
  sent_at?: string | null;
  status: ReminderStatus;
  created_at: string;
}

export interface DebtDashboardMetrics {
  totalCreditSalesCount: number;
  totalCreditSalesVolume: number;
  totalCollected: number;
  totalOutstanding: number;
  capitalPendingRecovery: number;
  profitPendingRecovery: number;
  dueTodayCount: number;
  dueTodayAmount: number;
  dueWithin7DaysCount: number;
  dueWithin7DaysAmount: number;
  overdueCount: number;
  overdueAmount: number;
  paidCount: number;
}
