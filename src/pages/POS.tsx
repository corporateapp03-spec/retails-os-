import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { InventoryItem } from '../types';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  CreditCard, 
  Package, 
  CheckCircle2, 
  WifiOff, 
  Cloud, 
  RefreshCw, 
  Minus, 
  Plus, 
  X,
  AlertCircle,
  ShieldCheck,
  User,
  Users,
  Settings as SettingsIcon,
  Tag,
  Percent,
  Lock,
  Unlock,
  Printer,
  FileText
} from 'lucide-react';
import { cn } from '../lib/utils';

const CATEGORY_MAP: Record<number, string> = {
  1: 'Oils',
  2: 'Spare Parts',
  3: 'Electrical Spares'
};

const safeNum = (val: any) => {
  const n = parseFloat(String(val || 0));
  return isNaN(n) ? 0 : n;
};

interface QueuedSale {
  id: string;
  cart: {
    item: InventoryItem;
    quantity: number;
    customPrice?: number;
  }[];
  paymentMethod: string;
  timestamp: string;
  subtotal: number;
  discount: number;
  discountType: 'percent' | 'flat';
  discountValue: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  discountCategoryId: string | number;
  customerName: string;
  cashierName: string;
  amountPaid?: number;
  changeAmount?: number;
}

interface PosSettings {
  storeName: string;
  taxRate: number;
  cashierName: string;
  receiptFooter: string;
}

interface Customer {
  id: string;
  name: string;
}

const DEFAULT_CUSTOMERS: Customer[] = [
  { id: '1', name: 'Walk-in Customer' },
  { id: '2', name: 'John Doe (VIP)' },
  { id: '3', name: 'Jane Smith (Retail)' }
];

const DEFAULT_SETTINGS: PosSettings = {
  storeName: 'RetailOS Vault',
  taxRate: 0,
  cashierName: 'Cashier A',
  receiptFooter: 'Thank you for your business!'
};

// Memoized Product Item Component for optimal performance
const ProductItem = React.memo(({ item, onAdd }: { item: InventoryItem, onAdd: (item: InventoryItem) => void }) => {
  const isOutOfStock = item.quantity <= 0;
  const isInactive = item.active === false || String(item.active).toLowerCase() === 'false';
  
  return (
    <button
      disabled={isOutOfStock}
      onClick={() => onAdd(item)}
      className={cn(
        "w-full flex items-center justify-between py-2.5 px-3 transition-all text-left border-b border-white/5 last:border-0 group animate-in fade-in duration-200",
        isOutOfStock ? "opacity-30 cursor-not-allowed grayscale" : "hover:bg-[#FFD700]/10 active:scale-[0.99]"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0",
          !isOutOfStock ? "bg-[#FFD700]/10 text-[#FFD700] group-hover:bg-[#FFD700]/20" : "bg-white/5 text-slate-600"
        )}>
          <Package size={16} />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-black text-white text-xs md:text-sm">{item.name}</p>
            {isInactive && (
              <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-500 rounded text-[7px] font-black uppercase tracking-widest leading-none border border-rose-500/20">
                Inactive
              </span>
            )}
          </div>
          <p className="text-[9px] md:text-[10px] text-slate-500 font-medium uppercase tracking-widest">
            {item.code} • {CATEGORY_MAP[item.category_id] || item.category || 'General'}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="font-black text-[#FFD700] text-xs md:text-sm">
          ${safeNum(item.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
        <p className={cn(
          "text-[9px] font-bold uppercase tracking-widest",
          item.quantity > 5 ? "text-emerald-500" : "text-rose-500"
        )}>
          {item.quantity} In Stock
        </p>
      </div>
    </button>
  );
});

export default function POS() {
  const [searchQuery, setSearchQuery] = useState('');
  const [allProducts, setAllProducts] = useState<InventoryItem[]>([]);
  const [cart, setCart] = useState<{item: InventoryItem, quantity: number, customPrice?: number}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queuedSales, setQueuedSales] = useState<QueuedSale[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Credit'>('Cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<QueuedSale | null>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Offline Specific States
  const [role, setRole] = useState<'Cashier' | 'Manager'>('Cashier');
  const [customers, setCustomers] = useState<Customer[]>(DEFAULT_CUSTOMERS);
  const [selectedCustomer, setSelectedCustomer] = useState('Walk-in Customer');
  const [posSettings, setPosSettings] = useState<PosSettings>(DEFAULT_SETTINGS);
  
  // Discount & Paid States
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('flat');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountInput, setDiscountInput] = useState<string>('');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');

  // Modals States
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  
  // PIN Verification Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinPurpose, setPinPurpose] = useState<'switch_role' | 'apply_discount' | 'override_price' | 'flush_cart' | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [onPinApproved, setOnPinApproved] = useState<(() => void) | null>(null);

  // Cart item editing state
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingCartItem, setEditingCartItem] = useState<{ item: InventoryItem; quantity: number; customPrice?: number } | null>(null);
  const [editingCartItemPrice, setEditingCartItemPrice] = useState('');
  const [editingCartItemQty, setEditingCartItemQty] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSyncingRef = useRef(false);

  // Focus search on load
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Monitor Online Status & Initial Local State Loads
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Load Local States
    try {
      const savedQueue = localStorage.getItem('offline_sales_queue');
      if (savedQueue) setQueuedSales(JSON.parse(savedQueue));

      const savedCustomers = localStorage.getItem('retailos_customers_cache');
      if (savedCustomers) {
        setCustomers(JSON.parse(savedCustomers));
      } else {
        localStorage.setItem('retailos_customers_cache', JSON.stringify(DEFAULT_CUSTOMERS));
      }

      const savedSettings = localStorage.getItem('retailos_pos_settings');
      if (savedSettings) {
        setPosSettings(JSON.parse(savedSettings));
      } else {
        localStorage.setItem('retailos_pos_settings', JSON.stringify(DEFAULT_SETTINGS));
      }

      const savedRole = localStorage.getItem('retailos_active_role') as 'Cashier' | 'Manager';
      if (savedRole) setRole(savedRole);
    } catch (e) {
      console.error('Failed to load initial offline state:', e);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load and cache categories dynamically
  const [categories, setCategories] = useState<string[]>(['Oils', 'Spare Parts', 'Electrical Spares']);
  
  useEffect(() => {
    try {
      const savedCategories = localStorage.getItem('retailos_categories_cache');
      if (savedCategories) {
        setCategories(JSON.parse(savedCategories));
      }
    } catch (e) {
      console.warn('Failed to parse cached categories:', e);
    }
    
    const loadCategories = async () => {
      if (!isConfigured || !isOnline) return;
      try {
        const { data } = await supabase.from('business_summary').select('category_name');
        if (data && data.length > 0) {
          const catNames = Array.from(new Set(data.map(d => d.category_name || 'General')));
          setCategories(catNames);
          localStorage.setItem('retailos_categories_cache', JSON.stringify(catNames));
        }
      } catch (err) {
        console.warn('Categories fetch failure:', err);
      }
    };
    loadCategories();
  }, [isOnline]);

  // Fetch all products for local search
  const fetchProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    setFetchError(null);
    let loadedFromCache = false;

    // Load from local cache instantly for absolute speed and offline resilience
    try {
      const cached = localStorage.getItem('retailos_inventory_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAllProducts(parsed);
          loadedFromCache = true;
        }
      }
    } catch (e) {
      console.warn('Failed to parse inventory cache', e);
    }

    if (!isConfigured) {
      setIsLoadingProducts(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      const products = data || [];
      setAllProducts(products);
      
      // Save to cache for offline resilience
      localStorage.setItem('retailos_inventory_cache', JSON.stringify(products));
    } catch (err: any) {
      console.error('Error fetching products:', err);
      setFetchError(err.message || 'Database connection offline.');
      if (!loadedFromCache) {
        console.warn('Database offline or unreachable. No local cache is present.');
      }
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // High-performance local search checking Name, SKU/Code, Category
  const filteredProducts = useMemo(() => {
    try {
      const trimmedQuery = searchQuery.trim().toLowerCase();
      if (!trimmedQuery) {
        return allProducts.slice(0, 100); // Top 100 products for super fast responsive list
      }
      const terms = trimmedQuery.split(/\s+/).filter(Boolean);
      
      return allProducts.filter(p => {
        if (!p) return false;
        const name = String(p.name || '').toLowerCase();
        const code = String(p.code || '').toLowerCase();
        const categoryIdStr = String(p.category_id || '');
        const catIdName = p.category_id ? String(CATEGORY_MAP[p.category_id] || '').toLowerCase() : '';
        const catName = String(p.category || '').toLowerCase();

        // 1. Multi-term search (each term matches at least one field)
        const matchesTerms = terms.every(term => 
          name.includes(term) || 
          code.includes(term) || 
          catIdName.includes(term) || 
          catName.includes(term) ||
          categoryIdStr.includes(term)
        );
        if (matchesTerms) return true;

        // 2. Continuous substring search fallback
        const fullString = `${name} ${code} ${catIdName} ${catName}`;
        if (fullString.includes(trimmedQuery)) return true;

        // 3. Normalized slug/code matching fallback
        const strippedCode = code.replace(/[^a-zA-Z0-9]/g, '');
        const strippedQuery = trimmedQuery.replace(/[^a-zA-Z0-9]/g, '');
        if (strippedQuery && strippedCode.includes(strippedQuery)) return true;

        return false;
      }).slice(0, 80);
    } catch (e) {
      console.error('Error in instant search:', e);
      return allProducts.slice(0, 50);
    }
  }, [searchQuery, allProducts]);

  // Background Sync Trigger
  useEffect(() => {
    if (isOnline && queuedSales.length > 0 && !isSyncing && !isSyncingRef.current) {
      syncQueuedSales();
    }
  }, [isOnline, queuedSales]);

  // Synchronize queued sales on server
  const syncQueuedSales = useCallback(async () => {
    if (isSyncing || isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    
    try {
      const queue = [...queuedSales];
      const failed: QueuedSale[] = [];

      for (const sale of queue) {
        try {
          await processSaleOnServer(sale);
        } catch (err) {
          console.error('Failed to sync sale:', err);
          failed.push(sale);
        }
      }

      setQueuedSales(failed);
      localStorage.setItem('offline_sales_queue', JSON.stringify(failed));
      
      // Pull fresh data from server to align stock numbers fully
      await fetchProducts();
    } catch (err) {
      console.error('Error in sync cycle:', err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [queuedSales, isSyncing, fetchProducts]);

  async function processSaleOnServer(sale: QueuedSale) {
    // 1. Map cart items into standard ledger records
    const entries = sale.cart.map(c => ({
      category_id: c.item.category_id,
      inventory_item_id: c.item.id,
      quantity: safeNum(c.quantity),
      amount: (c.customPrice !== undefined ? c.customPrice : safeNum(c.item.selling_price)) * safeNum(c.quantity),
      transaction_type: 'sale' as const,
      fund_source: sale.paymentMethod,
      description: `Sale: ${c.item.name} (x${c.quantity})` + (sale.customerName ? ` - Customer: ${sale.customerName}` : ''),
      created_at: sale.timestamp
    }));

    // 2. Insert entries to Ledger
    const { error: ledgerError } = await supabase.from('ledger').insert(entries);
    if (ledgerError) throw ledgerError;

    // 3. Post Discount total as one Expense categorized dynamically under highest qty item category
    if (sale.discount && sale.discount > 0) {
      const discountEntry = {
        category_id: sale.discountCategoryId,
        amount: sale.discount,
        transaction_type: 'expense' as const,
        fund_source: 'PROFIT',
        description: `POS Discount Expense (Sale Ref: ${sale.id})`,
        created_at: sale.timestamp
      };
      const { error: discountError } = await supabase.from('ledger').insert([discountEntry]);
      if (discountError) throw discountError;
    }

    // 4. Subtract inventory stock in database safely
    await Promise.all(sale.cart.map(async (cartItem) => {
      const { data: latest } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('id', cartItem.item.id)
        .single();
      
      const currentStock = latest?.quantity || 0;
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ quantity: Math.max(0, currentStock - cartItem.quantity) })
        .eq('id', cartItem.item.id);
      
      if (updateError) throw updateError;
    }));
  }

  // Deduct Local Stock immediately (no lag, 100% offline-first responsive feedback)
  const deductLocalInventory = useCallback((saleCart: typeof cart) => {
    setAllProducts(prev => {
      const updated = prev.map(p => {
        const cartItem = saleCart.find(c => c.item.id === p.id);
        if (cartItem) {
          return {
            ...p,
            quantity: Math.max(0, p.quantity - cartItem.quantity)
          };
        }
        return p;
      });
      localStorage.setItem('retailos_inventory_cache', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Verify Manager PIN and process approved callbacks
  const checkPinAndExecute = useCallback((enteredPin: string) => {
    const correctPin = localStorage.getItem('retailos_manager_pin') || import.meta.env.VITE_MANAGER_PIN || '7007';
    if (enteredPin === correctPin) {
      setPinError('');
      setShowPinModal(false);
      setPinValue('');
      if (pinPurpose === 'switch_role') {
        setRole('Manager');
        localStorage.setItem('retailos_active_role', 'Manager');
      }
      if (onPinApproved) {
        onPinApproved();
      }
    } else {
      setPinError('Incorrect Manager PIN. Please try again.');
    }
  }, [pinPurpose, onPinApproved]);

  // Manager permission execution handler
  const executeWithManagerPermission = useCallback((purpose: typeof pinPurpose, action: () => void) => {
    if (role === 'Manager') {
      action();
    } else {
      setPinPurpose(purpose);
      setOnPinApproved(() => action);
      setPinError('');
      setPinValue('');
      setShowPinModal(true);
    }
  }, [role]);

  // Cart operations
  const addToCart = useCallback((item: InventoryItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id);
      const currentQtyInCart = existing ? existing.quantity : 0;
      
      if (item.quantity <= currentQtyInCart) {
        alert(`Insufficient stock for ${item.name}. Available: ${item.quantity}`);
        return prev;
      }

      if (existing) {
        const filtered = prev.filter(c => c.item.id !== item.id);
        return [...filtered, { ...existing, quantity: existing.quantity + 1 }];
      } else {
        return [...prev, { item, quantity: 1 }];
      }
    });
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  const updateQuantity = useCallback((id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.item.id !== id) return c;
      const newQty = Math.max(0, c.quantity + delta);
      
      if (delta > 0 && c.item.quantity <= c.quantity) {
        alert('Cannot exceed available stock');
        return c;
      }
      
      return { ...c, quantity: newQty };
    }).filter(c => c.quantity > 0));
  }, []);

  // Inline pricing / item editing trigger
  const openEditCartItem = useCallback((cartItem: typeof cart[0]) => {
    setEditingCartItem(cartItem);
    setEditingCartItemPrice(String(cartItem.customPrice !== undefined ? cartItem.customPrice : cartItem.item.selling_price));
    setEditingCartItemQty(String(cartItem.quantity));
    setShowEditItemModal(true);
  }, []);

  // Save Cart Item Edit with strict cashier gating
  const saveCartItemEdit = useCallback(() => {
    if (!editingCartItem) return;
    const price = safeNum(editingCartItemPrice);
    const qty = Math.max(1, parseInt(editingCartItemQty) || 1);
    
    if (qty > editingCartItem.item.quantity) {
      alert(`Cannot exceed stock level. Max available: ${editingCartItem.item.quantity}`);
      return;
    }

    const applyEdit = () => {
      setCart(prev => prev.map(c => {
        if (c.item.id === editingCartItem.item.id) {
          const originalPrice = safeNum(editingCartItem.item.selling_price);
          return {
            ...c,
            quantity: qty,
            customPrice: price !== originalPrice ? price : undefined
          };
        }
        return c;
      }));
      setShowEditItemModal(false);
    };

    const isPriceOverridden = price !== safeNum(editingCartItem.item.selling_price);

    if (isPriceOverridden) {
      executeWithManagerPermission('override_price', applyEdit);
    } else {
      applyEdit();
    }
  }, [editingCartItem, editingCartItemPrice, editingCartItemQty, executeWithManagerPermission]);

  // Determine pricing helper
  const getItemPrice = useCallback((c: { item: InventoryItem, customPrice?: number }) => {
    return c.customPrice !== undefined ? c.customPrice : safeNum(c.item.selling_price);
  }, []);

  // Recalculations
  const subtotal = useMemo(() => {
    return cart.reduce((acc, c) => acc + (getItemPrice(c) * safeNum(c.quantity)), 0);
  }, [cart, getItemPrice]);

  const taxAmount = useMemo(() => {
    return subtotal * (posSettings.taxRate / 100);
  }, [subtotal, posSettings.taxRate]);

  const totalBeforeDiscount = useMemo(() => {
    return subtotal + taxAmount;
  }, [subtotal, taxAmount]);

  const amountPaid = useMemo(() => {
    return amountPaidInput === '' ? 0 : safeNum(amountPaidInput);
  }, [amountPaidInput]);

  const discountAmount = useMemo(() => {
    if (amountPaidInput === '' || amountPaid >= totalBeforeDiscount) {
      return 0;
    }
    return totalBeforeDiscount - amountPaid;
  }, [amountPaidInput, amountPaid, totalBeforeDiscount]);

  const grandTotal = useMemo(() => {
    return totalBeforeDiscount - discountAmount;
  }, [totalBeforeDiscount, discountAmount]);

  const remainingBalance = useMemo(() => {
    if (amountPaidInput === '') return totalBeforeDiscount;
    return 0; // Any underpayment is automatically treated as discount
  }, [amountPaidInput, totalBeforeDiscount]);

  const changeAmount = useMemo(() => {
    if (amountPaidInput === '' || amountPaid <= totalBeforeDiscount) return 0;
    return amountPaid - totalBeforeDiscount;
  }, [amountPaidInput, amountPaid, totalBeforeDiscount]);

  // Determine highest quantity category ID used in transaction
  const resolveDiscountCategoryId = useCallback(async (currentCart: typeof cart) => {
    const catQuantities: Record<string, { qty: number, originalId: string | number }> = {};
    for (const c of currentCart) {
      const catName = c.item.category || CATEGORY_MAP[c.item.category_id] || 'General';
      if (!catQuantities[catName]) {
        catQuantities[catName] = { qty: 0, originalId: c.item.category_id };
      }
      catQuantities[catName].qty += safeNum(c.quantity);
    }

    let highestQty = -1;
    let highestCatName = 'General';
    let highestCatOriginalId: string | number = '';
    
    for (const [catName, data] of Object.entries(catQuantities)) {
      if (data.qty > highestQty) {
        highestQty = data.qty;
        highestCatName = catName;
        highestCatOriginalId = data.originalId;
      }
    }

    let finalCategoryId: string | number = highestCatOriginalId || highestCatName;

    try {
      const { data: summaries } = await supabase.from('business_summary').select('category_id, category_name');
      if (summaries && summaries.length > 0) {
        const matchById = summaries.find(s => String(s.category_id) === String(highestCatOriginalId));
        if (matchById) {
          finalCategoryId = matchById.category_id;
        } else {
          const matchByName = summaries.find(s => s.category_name?.toLowerCase() === highestCatName.toLowerCase() || String(s.category_id).toLowerCase() === highestCatName.toLowerCase());
          if (matchByName) {
            finalCategoryId = matchByName.category_id;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to query categories, using fallback finalCategoryId', e);
    }
    
    return finalCategoryId;
  }, []);

  // Finalize POS Sale Pipeline
  const handleFinalizeSale = async () => {
    if (cart.length === 0 || isProcessing) return;
    setIsProcessing(true);
    
    const currentCart = [...cart];
    const currentSubtotal = subtotal;
    const currentDiscount = discountAmount;
    const currentTax = taxAmount;
    const currentTotal = grandTotal;
    const currentMethod = paymentMethod;
    const currentCustomer = selectedCustomer;
    const currentCashier = posSettings.cashierName;
    const currentAmountPaid = amountPaidInput === '' ? grandTotal : safeNum(amountPaidInput);
    const currentChangeAmount = changeAmount;
    const timestamp = new Date().toISOString();

    try {
      const discountCatId = await resolveDiscountCategoryId(currentCart);

      // Create Sale Object
      const newSale: QueuedSale = {
        id: crypto.randomUUID(),
        cart: currentCart,
        paymentMethod: currentMethod,
        timestamp: timestamp,
        subtotal: currentSubtotal,
        discount: currentDiscount,
        discountType: 'flat',
        discountValue: currentDiscount,
        taxRate: posSettings.taxRate,
        taxAmount: currentTax,
        total: currentTotal,
        discountCategoryId: discountCatId,
        customerName: currentCustomer,
        cashierName: currentCashier,
        amountPaid: currentAmountPaid,
        changeAmount: currentChangeAmount
      };

      // 1. Deduct stock locally IMMEDIATELY (no wait!)
      deductLocalInventory(currentCart);

      // 2. Clear state optimistically
      setCart([]);
      setDiscountValue(0);
      setDiscountInput('');
      setAmountPaidInput('');
      setLastTransaction(newSale);
      setShowReceipt(true);

      // 3. Save completed transaction locally instantly
      const updatedQueue = [...queuedSales, newSale];
      setQueuedSales(updatedQueue);
      localStorage.setItem('offline_sales_queue', JSON.stringify(updatedQueue));

      // 4. If online, trigger background synchronization cycle immediately
      if (isOnline) {
        // Fire sync asynchronously
        setTimeout(() => syncQueuedSales(), 100);
      }
    } catch (err) {
      console.error('Sale finalization failed:', err);
      alert('Failed to finalize transaction. Please try again.');
    } finally {
      setIsProcessing(false);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  };

  // Add new customer local cache
  const handleAddCustomer = () => {
    if (!newCustomerName.trim()) return;
    const newCust: Customer = {
      id: crypto.randomUUID(),
      name: newCustomerName.trim()
    };
    const updated = [...customers, newCust];
    setCustomers(updated);
    localStorage.setItem('retailos_customers_cache', JSON.stringify(updated));
    setSelectedCustomer(newCust.name);
    setNewCustomerName('');
    setShowAddCustomerModal(false);
  };

  // Switch role with validation
  const toggleRole = () => {
    if (role === 'Manager') {
      setRole('Cashier');
      localStorage.setItem('retailos_active_role', 'Cashier');
    } else {
      executeWithManagerPermission('switch_role', () => {});
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-0 lg:h-[calc(100vh-175px)] gap-4 lg:gap-6 overflow-visible lg:overflow-hidden relative">
      
      {/* Offline POS Header Status Bar */}
      <div className="w-full flex flex-col md:flex-row justify-between items-center gap-4 bg-[#050505] border border-white/5 p-4 rounded-3xl lg:hidden">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-black uppercase tracking-wider">
              <Cloud size={16} /> Online Mode
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-500 text-xs font-black uppercase tracking-wider">
              <WifiOff size={16} /> Offline Mode
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={toggleRole}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5",
              role === 'Manager' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-white/5 text-slate-400 border-white/10"
            )}
          >
            {role === 'Manager' ? <Unlock size={12} /> : <Lock size={12} />}
            Role: {role}
          </button>
          <button 
            type="button" 
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 bg-white/5 border border-white/10 text-slate-400 rounded-xl hover:text-[#FFD700]"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </div>

      {/* Background Syncing Float Indicator */}
      {(isSyncing || queuedSales.length > 0) && (
        <div className="fixed bottom-24 right-4 sm:right-8 z-50 flex items-center gap-3 bg-[#FFD700] text-[#0a0a0a] px-5 py-3 rounded-full font-black shadow-[0_0_25px_rgba(255,215,0,0.3)] transition-all animate-in slide-in-from-right-4">
          {isSyncing ? <RefreshCw className="animate-spin" size={16} /> : <Cloud size={16} />}
          <span className="text-[10px] uppercase tracking-widest font-black">
            {isSyncing ? 'Syncing Vault...' : `${queuedSales.length} Transactions Pending`}
          </span>
          {!isOnline && <WifiOff size={14} className="text-rose-600 animate-pulse" />}
        </div>
      )}

      {/* Left Pane: Search & Results (58%) */}
      <div className="flex-none lg:flex-[0.58] h-[550px] lg:h-full flex flex-col bg-[#0d0d0d]/80 rounded-3xl border border-white/5 scale-100 shadow-2xl overflow-hidden relative min-h-0">
        
        {/* Desktop Header panel (Hidden on mobile) */}
        <div className="hidden lg:flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            {isOnline ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                <Cloud size={12} /> Sync Server Active
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-[10px] font-black uppercase tracking-widest">
                <WifiOff size={12} /> 100% Offline Mode
              </div>
            )}
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              Terminal: {posSettings.storeName}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={toggleRole}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 transition-all",
                role === 'Manager' ? "bg-amber-500/10 text-amber-500 border-amber-500/30" : "bg-white/5 text-slate-500 border-white/10 hover:border-white/20"
              )}
            >
              {role === 'Manager' ? <Unlock size={12} /> : <Lock size={12} />}
              Role: {role}
            </button>
            <button 
              type="button" 
              onClick={() => setShowSettingsModal(true)}
              className="p-2 bg-white/5 border border-white/10 text-slate-500 hover:text-[#FFD700] hover:border-[#FFD700]/30 rounded-xl transition-all"
              title="POS Settings"
            >
              <SettingsIcon size={16} />
            </button>
          </div>
        </div>

        {/* Search Bar Input */}
        <div className="p-4 border-b border-white/10 bg-[#0a0a0a] sticky top-0 z-20">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#FFD700] transition-colors" size={20} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search by SKU, Name, Barcode, or Category..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-[#080808] border-2 border-white/10 rounded-2xl focus:border-[#FFD700]/50 outline-none transition-all text-base font-bold placeholder:text-slate-600 text-white"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={20} />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[8px] text-slate-600 font-mono tracking-wider uppercase">
            <span>Query matches local database instantly</span>
            <span>All entries active offline</span>
          </div>
        </div>

        {fetchError && (
          <div className="mx-4 mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-between gap-2 shrink-0 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 text-rose-500 text-xs font-black uppercase">
              <AlertCircle size={14} className="shrink-0" />
              <span className="truncate">Local Data Fallback Active. Remote sync retry waiting.</span>
            </div>
            <button 
              onClick={() => fetchProducts()} 
              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white rounded text-[9px] uppercase font-black tracking-widest shrink-0 transition-all border border-white/5"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Products List Panel */}
        <div className="flex-1 overflow-y-auto overscroll-y-contain custom-scrollbar-gold min-h-0 bg-[#070707]/30">
          {isLoadingProducts ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-30">
              <RefreshCw className="animate-spin text-[#FFD700]" size={32} />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Querying Local Vault...</p>
            </div>
          ) : filteredProducts.length > 0 ? (
            <>
              {/* Desktop Table Layout */}
              <div className="hidden md:block desktop-table w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/5">
                      <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500">Product</th>
                      <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500">SKU/Barcode</th>
                      <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500">Stock Availability</th>
                      <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredProducts.map(item => (
                      <tr 
                        key={item.id} 
                        onClick={() => addToCart(item)}
                        className={cn(
                          "hover:bg-[#FFD700]/10 cursor-pointer transition-all duration-150 group",
                          item.quantity <= 0 && "opacity-30 grayscale cursor-not-allowed"
                        )}
                      >
                        <td className="px-4 py-2.5">
                           <div className="flex items-center gap-2">
                             <p className="font-black text-white text-xs group-hover:text-[#FFD700] transition-colors">{item.name}</p>
                             {(item.active === false || String(item.active).toLowerCase() === 'false') && (
                               <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-500 rounded text-[7px] font-black uppercase tracking-widest leading-none border border-rose-500/20">
                                 Inactive
                               </span>
                             )}
                           </div>
                          <p className="text-[9px] text-slate-500 uppercase font-black tracking-wider mt-0.5">
                            {CATEGORY_MAP[item.category_id] || item.category || 'General'}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-400 group-hover:text-white transition-colors">{item.code}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn(
                            "text-[9px] font-black uppercase px-2 py-0.5 rounded-lg",
                            item.quantity > 5 ? "text-emerald-400 bg-emerald-500/5 border border-emerald-500/10" : "text-rose-400 bg-rose-500/5 border border-rose-500/10"
                          )}>
                            {item.quantity} units
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-black text-[#FFD700] text-xs">
                          ${safeNum(item.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List Layout */}
              <div className="md:hidden mobile-card-list">
                <div className="divide-y divide-white/5">
                  {filteredProducts.map(item => (
                    <ProductItem key={item.id} item={item} onAdd={addToCart} />
                  ))}
                </div>
              </div>
            </>
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-20 py-16">
              <Package size={48} className="text-[#FFD700]" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Local matches found</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-20 py-16">
              <ShoppingCart size={48} className="text-[#FFD700]" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Cashier Standby...</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Checkout Cart (42%) */}
      <div className="flex-none lg:flex-[0.42] h-[650px] lg:h-full flex flex-col bg-[#0d0d0d]/80 rounded-3xl border border-white/5 shadow-2xl overflow-hidden relative min-h-0">
        
        {/* Cart Top Controls */}
        <div className="p-4 border-b border-white/10 bg-white/5 flex flex-col gap-3 shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-black text-[#FFD700] uppercase tracking-widest flex items-center gap-2">
              <ShoppingCart size={16} />
              Shopping Cart
            </h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => executeWithManagerPermission('flush_cart', () => setCart([]))}
                className="text-[10px] font-black text-rose-500 uppercase hover:bg-rose-500/10 px-2 py-1 rounded transition-all"
              >
                Flush Cart
              </button>
              <span className="text-[10px] font-black bg-white/10 px-2 py-1 rounded text-slate-400 font-mono">
                {cart.length} SKU
              </span>
            </div>
          </div>

          {/* Customer Selection widget */}
          <div className="grid grid-cols-1 gap-1 pt-1">
            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Customer Assignment</label>
            <div className="flex gap-2">
              <select 
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-[#FFD700]/50 text-slate-300"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.name} className="bg-[#0a0a0a] text-white">
                    {c.name}
                  </option>
                ))}
              </select>
              <button 
                type="button"
                onClick={() => setShowAddCustomerModal(true)}
                className="px-3 bg-white/5 border border-white/10 text-[#FFD700] rounded-xl hover:bg-white/10 transition-colors text-xs font-bold"
                title="Add Client"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Cart items scrollable container */}
        <div className="flex-1 overflow-y-auto overscroll-y-contain p-4 flex flex-col gap-3 custom-scrollbar-gold min-h-0">
          {cart.length > 0 ? (
            [...cart].reverse().map(c => {
              const currentPrice = getItemPrice(c);
              const originalPrice = safeNum(c.item.selling_price);
              const isOverridden = currentPrice !== originalPrice;
              
              return (
                <div key={c.item.id} className="p-3.5 bg-white/5 rounded-2xl border border-white/5 animate-in slide-in-from-top-4 relative group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 mr-2">
                      <p className="font-black text-white text-xs leading-tight">{c.item.name}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={cn(
                          "text-[9px] font-mono",
                          isOverridden ? "text-amber-500 font-black line-through" : "text-slate-500"
                        )}>
                          ${originalPrice.toLocaleString()} ea
                        </span>
                        {isOverridden && (
                          <span className="text-[9px] font-mono text-emerald-400 font-black">
                            ${currentPrice.toLocaleString()} ea (Overridden)
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="font-black text-[#FFD700] text-xs">
                      ${(currentPrice * c.quantity).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center bg-[#0a0a0a] rounded-xl border border-white/10">
                      <button 
                        onClick={() => updateQuantity(c.item.id, -1)}
                        className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center font-black text-white text-xs">{c.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(c.item.id, 1)}
                        className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => openEditCartItem(c)}
                        className="p-1.5 bg-white/5 hover:bg-[#FFD700]/10 text-slate-400 hover:text-[#FFD700] border border-white/5 rounded-lg transition-colors text-[10px] font-bold"
                        title="Edit Item Price/Qty"
                      >
                        Edit Item
                      </button>
                      <button 
                        onClick={() => updateQuantity(c.item.id, -c.quantity)}
                        className="p-1.5 text-rose-500/50 hover:text-rose-500 hover:bg-rose-500/5 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 py-12 flex-1">
              <ShoppingCart size={40} className="text-[#FFD700] mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cart Empty</p>
            </div>
          )}
        </div>

        {/* Totals Computation sticky footer */}
        <div className="p-4 bg-[#0a0a0a] border-t border-white/10 space-y-4 shrink-0">
          
          {/* Amount Paid input widget */}
          <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black text-[#FFD700] uppercase tracking-widest flex items-center gap-1.5">
                <CreditCard size={12} /> Amount Paid
              </span>
              <span className="text-[8px] font-mono text-slate-500 uppercase">
                Required for Checkout
              </span>
            </div>

            <div className="relative">
              <input 
                type="text"
                placeholder={`Enter amount paid (e.g., ${totalBeforeDiscount.toFixed(2)})`}
                value={amountPaidInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  setAmountPaidInput(val);
                }}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-3 pl-8 text-sm font-bold text-white outline-none focus:border-[#FFD700]/50 placeholder:text-slate-700"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#FFD700] font-bold text-xs">
                $
              </span>
              {amountPaidInput && (
                <button
                  type="button"
                  onClick={() => setAmountPaidInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {/* Quick cash suggest buttons */}
            <div className="flex gap-1.5 pt-1">
              {[Math.ceil(totalBeforeDiscount), Math.ceil(totalBeforeDiscount / 10) * 10, Math.ceil(totalBeforeDiscount / 50) * 50].filter(v => v >= totalBeforeDiscount).map((suggestVal, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAmountPaidInput(String(suggestVal))}
                  className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 hover:text-white rounded-lg text-[9px] font-mono transition-all"
                >
                  ${suggestVal}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmountPaidInput(String(totalBeforeDiscount.toFixed(2)))}
                className="flex-1 py-1.5 bg-[#FFD700]/10 hover:bg-[#FFD700]/20 border border-[#FFD700]/10 text-[#FFD700] rounded-lg text-[9px] font-black tracking-widest uppercase transition-all"
              >
                Exact Cash
              </button>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-white/5 pt-2">
            <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <span>Subtotal</span>
              <span className="text-white font-mono">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {posSettings.taxRate > 0 && (
              <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <span>Tax ({posSettings.taxRate}%)</span>
                <span className="text-white font-mono">${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            {amountPaidInput !== '' && (
              <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>Amount Paid</span>
                <span className="text-[#FFD700] font-mono font-black">${amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            {discountAmount > 0 && (
              <div className="flex justify-between text-[10px] font-black text-rose-400 uppercase tracking-widest animate-pulse">
                <span>Transaction Discount</span>
                <span className="font-mono">-${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            {remainingBalance > 0 && (
              <div className="flex justify-between text-[10px] font-black text-amber-500 uppercase tracking-widest">
                <span>Remaining Balance</span>
                <span className="font-mono">${remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            {changeAmount > 0 && (
              <div className="flex justify-between text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                <span>Change</span>
                <span className="font-mono">${changeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className="flex justify-between text-xs font-black text-white uppercase tracking-widest pt-2 border-t border-white/5">
              <span className="text-[#FFD700]">Final Total</span>
              <span className="text-lg text-[#FFD700] font-mono font-black">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {/* Payment options */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              {(['Cash', 'Card', 'Credit'] as const).map(method => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "py-2.5 rounded-xl text-[10px] font-black transition-all border uppercase tracking-widest",
                    paymentMethod === method 
                      ? "bg-[#FFD700] border-[#FFD700] text-[#0a0a0a] shadow-[0_0_15px_rgba(255,215,0,0.15)]" 
                      : "bg-transparent border-white/10 text-slate-500 hover:border-white/20"
                  )}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <button 
            disabled={cart.length === 0 || isProcessing}
            onClick={handleFinalizeSale}
            className={cn(
              "w-full py-4.5 rounded-2xl font-black flex items-center justify-center gap-3 transition-all text-sm uppercase tracking-widest border",
              cart.length === 0 || isProcessing
                ? "bg-white/5 border-transparent text-slate-700 cursor-not-allowed"
                : "bg-[#FFD700] border-[#FFD700] text-[#0a0a0a] hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(255,215,0,0.25)]"
            )}
          >
            {isProcessing ? (
              <RefreshCw className="animate-spin" size={20} />
            ) : (
              <>
                <CheckCircle2 size={20} />
                Finalize Sale
              </>
            )}
          </button>
        </div>
      </div>

      {/* Retro Receipt Modal */}
      {showReceipt && lastTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0a0a]/95 backdrop-blur-md" onClick={() => setShowReceipt(false)} />
          <div className="relative bg-[#0d0d0d] border border-white/10 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center bg-[#FFD700] text-[#0a0a0a]">
              <div className="w-14 h-14 bg-[#0a0a0a]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={36} />
              </div>
              <h2 className="text-lg font-black uppercase tracking-widest">Sale Authorized</h2>
              <p className="text-[#0a0a0a]/70 font-bold text-[9px] uppercase tracking-widest mt-1">
                {queuedSales.some(s => s.id === lastTransaction.id) ? 'Saved Locally • Pending Sync' : 'Synced & Completed'}
              </p>
            </div>
            
            {/* Thermal Print look receipt body */}
            <div className="p-8 space-y-6 font-mono text-xs text-slate-300 bg-[#070707] border-b border-white/5">
              <div className="text-center space-y-1">
                <p className="font-black text-white text-sm uppercase">{lastTransaction.storeName || posSettings.storeName}</p>
                <p className="text-[10px] text-slate-500 uppercase">OFFLINE RESILIENT TERMINAL</p>
                <div className="h-px border-b border-dashed border-white/25 my-3" />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>DATE: {new Date(lastTransaction.timestamp).toLocaleDateString()}</span>
                  <span>TIME: {new Date(lastTransaction.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>CASHIER: {lastTransaction.cashierName}</span>
                  <span>CLIENT: {lastTransaction.customerName}</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-b border-dashed border-white/25 py-3">
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>Item SKU</span>
                  <span>Qty</span>
                  <span>Price</span>
                  <span className="text-right">Total</span>
                </div>
                {lastTransaction.cart.map((c: any) => {
                  const p = getItemPrice(c);
                  return (
                    <div key={c.item.id} className="flex justify-between text-[10px] text-white">
                      <span className="truncate max-w-[150px]">{c.item.name}</span>
                      <span>{c.quantity}</span>
                      <span>${p.toLocaleString()}</span>
                      <span className="text-right">${(p * c.quantity).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5 pt-1 text-[10px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL:</span>
                  <span className="text-white">${lastTransaction.subtotal.toLocaleString()}</span>
                </div>
                {lastTransaction.discount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>DISCOUNT:</span>
                    <span>-${lastTransaction.discount.toLocaleString()}</span>
                  </div>
                )}
                {lastTransaction.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span>TAX ({lastTransaction.taxRate}%):</span>
                    <span className="text-white">${lastTransaction.taxAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-[#FFD700] pt-2 border-t border-dashed border-white/25">
                  <span>GRAND TOTAL:</span>
                  <span>${lastTransaction.total.toLocaleString()}</span>
                </div>
                {lastTransaction.amountPaid !== undefined && (
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>AMOUNT PAID:</span>
                    <span>${lastTransaction.amountPaid.toLocaleString()}</span>
                  </div>
                )}
                {lastTransaction.changeAmount !== undefined && lastTransaction.changeAmount > 0 && (
                  <div className="flex justify-between text-[10px] text-emerald-400">
                    <span>CHANGE:</span>
                    <span>${lastTransaction.changeAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-[9px] text-slate-500 pt-1">
                  <span>METHOD:</span>
                  <span>{lastTransaction.paymentMethod.toUpperCase()}</span>
                </div>
              </div>

              <div className="text-center pt-4 text-[10px] text-slate-500">
                <p className="uppercase">{posSettings.receiptFooter}</p>
                <p className="text-[8px] font-mono text-slate-600 mt-2 break-all">ID: {lastTransaction.id}</p>
              </div>
            </div>

            <div className="p-8 flex gap-3 bg-[#0a0a0a]">
              <button 
                onClick={() => window.print()}
                className="flex-1 py-4 bg-white text-[#0a0a0a] rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
              >
                <Printer size={16} /> Print Receipt
              </button>
              <button 
                onClick={() => setShowReceipt(false)}
                className="flex-1 py-4 border border-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS Local Configuration Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)} />
          <div className="relative bg-[#0d0d0d] border border-white/10 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-8">
            <div className="flex justify-between items-center pb-4 border-b border-white/5 mb-6">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <SettingsIcon className="text-[#FFD700]" size={18} /> Local POS Settings
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Store Name</label>
                <input 
                  type="text"
                  value={posSettings.storeName}
                  onChange={(e) => setPosSettings({ ...posSettings, storeName: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-[#FFD700]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Cashier Name</label>
                <input 
                  type="text"
                  value={posSettings.cashierName}
                  onChange={(e) => setPosSettings({ ...posSettings, cashierName: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-[#FFD700]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Receipt Tax Rate (%)</label>
                <input 
                  type="number"
                  min={0}
                  max={100}
                  value={posSettings.taxRate}
                  onChange={(e) => setPosSettings({ ...posSettings, taxRate: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-[#FFD700]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Receipt Footer</label>
                <textarea 
                  value={posSettings.receiptFooter}
                  onChange={(e) => setPosSettings({ ...posSettings, receiptFooter: e.target.value })}
                  className="w-full h-20 bg-[#0a0a0a] border border-white/10 rounded-2xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-[#FFD700] resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-6 mt-6 border-t border-white/5">
              <button
                onClick={() => {
                  localStorage.setItem('retailos_pos_settings', JSON.stringify(posSettings));
                  setShowSettingsModal(false);
                }}
                className="flex-1 py-4 bg-[#FFD700] text-[#0a0a0a] rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Save Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAddCustomerModal(false)} />
          <div className="relative bg-[#0d0d0d] border border-white/10 w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-8">
            <div className="flex justify-between items-center pb-4 border-b border-white/5 mb-6">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Users className="text-[#FFD700]" size={18} /> Add New Client
              </h3>
              <button onClick={() => setShowAddCustomerModal(false)} className="text-slate-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Client Full Name</label>
                <input 
                  type="text"
                  placeholder="Enter customer name..."
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl py-3.5 px-4 text-xs font-bold text-white outline-none focus:border-[#FFD700]"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-6 mt-6 border-t border-white/5">
              <button
                onClick={handleAddCustomer}
                className="flex-1 py-4 bg-[#FFD700] text-[#0a0a0a] rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Add Client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Cart Item Modal (Price Override & Quantity changes) */}
      {showEditItemModal && editingCartItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowEditItemModal(false)} />
          <div className="relative bg-[#0d0d0d] border border-white/10 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-8">
            <div className="flex justify-between items-center pb-4 border-b border-white/5 mb-6">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 truncate pr-4">
                <Edit3Icon className="text-[#FFD700]" size={18} /> Edit: {editingCartItem.item.name}
              </h3>
              <button onClick={() => setShowEditItemModal(false)} className="text-slate-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Unit Price ($)</label>
                <input 
                  type="text"
                  value={editingCartItemPrice}
                  onChange={(e) => setEditingCartItemPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-[#FFD700]"
                />
                {safeNum(editingCartItemPrice) !== safeNum(editingCartItem.item.selling_price) && (
                  <p className="text-[8px] font-black uppercase text-amber-500 tracking-wider mt-1 ml-1 flex items-center gap-1">
                    <Lock size={10} /> Manager PIN Required to approve Price Override
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Quantity</label>
                <input 
                  type="number"
                  min={1}
                  max={editingCartItem.item.quantity}
                  value={editingCartItemQty}
                  onChange={(e) => setEditingCartItemQty(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-[#FFD700]"
                />
                <p className="text-[8px] text-slate-500 font-mono mt-1 ml-1">Max available in vault: {editingCartItem.item.quantity} units</p>
              </div>
            </div>

            <div className="flex gap-3 pt-6 mt-6 border-t border-white/5">
              <button
                onClick={saveCartItemEdit}
                className="flex-1 py-4 bg-[#FFD700] text-[#0a0a0a] rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Manager PIN Authentication Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowPinModal(false)} />
          <div className="relative bg-[#0d0d0d] border border-white/10 w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-8 text-center">
            <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
              <Lock className="text-amber-500" size={28} />
            </div>
            
            <h3 className="text-white font-black uppercase tracking-widest text-sm mb-2">Manager Authorization Required</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-6">
              {pinPurpose === 'switch_role' && 'Authenticate as System Manager'}
              {pinPurpose === 'apply_discount' && 'Apply Transaction-Wide Discount'}
              {pinPurpose === 'override_price' && 'Override Core Item Selling Price'}
              {pinPurpose === 'flush_cart' && 'Completely Flush POS Cart'}
            </p>

            <div className="space-y-4">
              <input 
                type="password"
                maxLength={4}
                placeholder="••••"
                value={pinValue}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '');
                  setPinValue(cleaned);
                  if (cleaned.length === 4) {
                    checkPinAndExecute(cleaned);
                  }
                }}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl py-4 px-6 text-2xl font-black tracking-[0.5em] text-white focus:border-amber-500 transition-colors outline-none text-center"
                autoFocus
              />
              
              {pinError && (
                <p className="text-rose-500 text-[9px] font-black uppercase tracking-widest animate-pulse mt-2">{pinError}</p>
              )}
            </div>

            <div className="flex gap-3 pt-6 mt-6 border-t border-white/5">
              <button
                onClick={() => setShowPinModal(false)}
                className="flex-1 py-3.5 border border-white/10 text-slate-400 hover:text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar-gold::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar-gold::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-gold::-webkit-scrollbar-thumb {
          background: #FFD700;
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}

// Simple fallback icon for edit component
function Edit3Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
