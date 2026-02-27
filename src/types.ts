export interface Category {
  id: string;
  name: string;
  initial_capital: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  code: string;
  category: string;
  cost_price: number;
  selling_price: number;
  quantity: number;
  min_stock_level: number;
  created_at: string;
  active: boolean;
  category_id: number;
}

export interface LedgerEntry {
  id: string;
  category_id: string;
  inventory_item_id?: string;
  quantity?: number;
  amount: number;
  transaction_type: 'sale' | 'expense' | 'capital_deduction';
  fund_source: string;
  created_at: string;
  inventory?: InventoryItem;
}

export interface BusinessSummary {
  category_id: string;
  category_name: string;
  total_revenue: number;
  total_profit: number;
  total_expenses: number;
  capital_health?: number; // Terminology from prompt
}
