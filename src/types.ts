export interface Category {
  id: string;
  name: string;
  initial_capital: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  code: string;
  cost: number;
  selling_price: number;
  category_id: number;
  min_stock: number;
  max_stock: number;
  quantity?: number;
}

export interface LedgerEntry {
  id: string;
  category_id: string;
  amount: number;
  transaction_type: 'sale' | 'expense' | 'capital_deduction';
  fund_source: string;
  created_at: string;
}

export interface BusinessSummary {
  category_id: string;
  category_name: string;
  total_revenue: number;
  total_profit: number;
  total_expenses: number;
  capital_health?: number; // Terminology from prompt
}
