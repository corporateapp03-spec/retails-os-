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
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

const CATEGORY_MAP: Record<number, string> = {
  1: 'Oils',
  2: 'Spare Parts',
  3: 'Electrical Spares'
};

const safeNum = (val: any) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

interface QueuedSale {
  id: string;
  cart: {item: InventoryItem, quantity: number}[];
  paymentMethod: string;
  timestamp: string;
  total: number;
}

// Memoized Product Item Component for performance
const ProductItem = React.memo(({ item, onAdd }: { item: InventoryItem, onAdd: (item: InventoryItem) => void }) => {
  const isOutOfStock = item.quantity <= 0;
  const isInactive = item.active === false || String(item.active).toLowerCase() === 'false';
  
  return (
    <button
      disabled={isOutOfStock}
      onClick={() => onAdd(item)}
      className={cn(
        "w-full flex items-center justify-between p-4 transition-all text-left border-b border-white/5 last:border-0 group",
        isOutOfStock ? "opacity-30 cursor-not-allowed grayscale" : "hover:bg-[#FFD700]/10 active:scale-[0.99]"
      )}
    >
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
          !isOutOfStock ? "bg-[#FFD700]/10 text-[#FFD700] group-hover:bg-[#FFD700]/20" : "bg-white/5 text-slate-600"
        )}>
          <Package size={24} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-black text-white text-sm md:text-base">{item.name}</p>
            {isInactive && (
              <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 rounded text-[8px] font-black uppercase tracking-widest leading-none border border-rose-500/20">
                Inactive
              </span>
            )}
          </div>
          <p className="text-[10px] md:text-xs text-slate-500 font-medium uppercase tracking-widest">
            {item.code} • {CATEGORY_MAP[item.category_id] || item.category}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-black text-[#FFD700] text-base md:text-lg">
          ${safeNum(item.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
        <p className={cn(
          "text-[10px] font-bold uppercase tracking-widest",
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
  const [cart, setCart] = useState<{item: InventoryItem, quantity: number}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queuedSales, setQueuedSales] = useState<QueuedSale[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Credit'>('Cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSyncingRef = useRef(false);

  // Focus search on load
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Monitor Online Status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const saved = localStorage.getItem('offline_sales_queue');
    if (saved) setQueuedSales(JSON.parse(saved));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch all products for local fuzzy search
  const fetchProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    setFetchError(null);
    let loadedFromCache = false;

    // Load from local cache instantly for fallback/network issues
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
      
      // Retain all products to avoid user losing searchability; handle active status visually
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

  // High-performance intelligent instant multi-term & continuous search (no lag/debounce!)
  const filteredProducts = useMemo(() => {
    try {
      const trimmedQuery = searchQuery.trim().toLowerCase();
      if (!trimmedQuery) {
        return allProducts.slice(0, 100); // Show top 100 products for super fast responsive scroll
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

        // 3. Normalized slug/code matching fallback (e.g. searching "SP001" matches "SP-001")
        const strippedCode = code.replace(/[^a-zA-Z0-9]/g, '');
        const strippedQuery = trimmedQuery.replace(/[^a-zA-Z0-9]/g, '');
        if (strippedQuery && strippedCode.includes(strippedQuery)) return true;

        return false;
      }).slice(0, 80); // Limit filtered results for flawless rendering speed
    } catch (e) {
      console.error('Error in instant search:', e);
      return allProducts.slice(0, 50);
    }
  }, [searchQuery, allProducts]);

  // Background Sync Logic
  useEffect(() => {
    if (isOnline && queuedSales.length > 0 && !isSyncing && !isSyncingRef.current) {
      syncQueuedSales();
    }
  }, [isOnline, queuedSales]);

  async function syncQueuedSales() {
    if (isSyncing || isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const queue = [...queuedSales];
      const failed: QueuedSale[] = [];

      for (const sale of queue) {
        try {
          await processSale(sale.cart, sale.paymentMethod, sale.timestamp);
        } catch (err) {
          console.error('Failed to sync sale:', err);
          failed.push(sale);
        }
      }

      setQueuedSales(failed);
      localStorage.setItem('offline_sales_queue', JSON.stringify(failed));
      fetchProducts(); // Refresh stock after sync
    } catch (err) {
      console.error('Error in sync cycle:', err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }

  const addToCart = useCallback((item: InventoryItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id);
      const currentQtyInCart = existing ? existing.quantity : 0;
      
      if (item.quantity <= currentQtyInCart) {
        alert(`Insufficient stock for ${item.name}. Available: ${item.quantity}`);
        return prev;
      }

      if (existing) {
        return prev.map(c => c.item.id === item.id ? {...c, quantity: c.quantity + 1} : c);
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

  const cartTotal = useMemo(() => 
    cart.reduce((acc, c) => acc + (safeNum(c.item.selling_price) * safeNum(c.quantity)), 0)
  , [cart]);

  async function processSale(saleCart: {item: InventoryItem, quantity: number}[], method: string, timestamp: string) {
    const entries = saleCart.map(c => ({
      category_id: c.item.category_id,
      inventory_item_id: c.item.id,
      quantity: safeNum(c.quantity),
      amount: safeNum(c.item.selling_price) * safeNum(c.quantity),
      transaction_type: 'sale' as const,
      fund_source: method,
      description: `Sale: ${c.item.name} (x${c.quantity})`,
      created_at: timestamp
    }));

    const { error: ledgerError } = await supabase.from('ledger').insert(entries);
    if (ledgerError) throw ledgerError;

    // Parallelize inventory updates for high-speed performance
    await Promise.all(saleCart.map(async (cartItem) => {
      const { data: latest } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('id', cartItem.item.id)
        .single();
      
      const currentStock = latest?.quantity || 0;
      return supabase
        .from('inventory')
        .update({ quantity: currentStock - cartItem.quantity })
        .eq('id', cartItem.item.id);
    }));
  }

  async function handleFinalizeSale() {
    if (cart.length === 0 || isProcessing) return;
    setIsProcessing(true);
    
    // Safety timeout to prevent permanent "stuck" state
    const safetyTimeout = setTimeout(() => {
      setIsProcessing(false);
      console.warn('Transaction safety timeout triggered');
    }, 15000);

    const currentCart = [...cart];
    const currentTotal = cartTotal;
    const currentMethod = paymentMethod;
    const now = new Date();
    const timestamp = now.toISOString();

    try {
      // Optimistically clear cart and show receipt
      setCart([]);
      setLastTransaction({
        items: currentCart,
        total: currentTotal,
        method: currentMethod,
        date: timestamp
      });
      setShowReceipt(true);

      if (!isOnline) {
        const newQueuedSale: QueuedSale = {
          id: crypto.randomUUID(),
          cart: currentCart,
          paymentMethod: currentMethod,
          timestamp: timestamp,
          total: currentTotal
        };
        const newQueue = [...queuedSales, newQueuedSale];
        setQueuedSales(newQueue);
        localStorage.setItem('offline_sales_queue', JSON.stringify(newQueue));
        return;
      }

      await processSale(currentCart, currentMethod, timestamp);
      await fetchProducts(); // Refresh local cache
    } catch (err) {
      console.error('Transaction failed, queuing instead:', err);
      // Since we already showed "confirmed" (optimistic), we MUST queue it to ensure no data loss
      const newQueuedSale: QueuedSale = {
        id: crypto.randomUUID(),
        cart: currentCart,
        paymentMethod: currentMethod,
        timestamp: timestamp,
        total: currentTotal
      };
      const newQueue = [...queuedSales, newQueuedSale];
      setQueuedSales(newQueue);
      localStorage.setItem('offline_sales_queue', JSON.stringify(newQueue));
    } finally {
      clearTimeout(safetyTimeout);
      setIsProcessing(false);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-0 lg:h-[calc(100vh-175px)] gap-4 lg:gap-6 overflow-visible lg:overflow-hidden">
      {/* Syncing Indicator */}
      {(isSyncing || queuedSales.length > 0) && (
        <div className="fixed bottom-24 right-4 sm:right-8 z-50 flex items-center gap-3 bg-[#FFD700] text-[#0a0a0a] px-4 py-2 rounded-full font-black shadow-[0_0_20px_rgba(255,215,0,0.4)] transition-all animate-in slide-in-from-right-4">
          {isSyncing ? <RefreshCw className="animate-spin" size={16} /> : <Cloud size={16} />}
          <span className="text-[10px] uppercase tracking-widest hidden sm:inline">
            {isSyncing ? 'Syncing Vault...' : `${queuedSales.length} Transactions Pending`}
          </span>
          {!isOnline && <WifiOff size={14} className="text-rose-600 animate-pulse" />}
        </div>
      )}

      {/* Left Pane: Search & Results (70%) */}
      <div className="flex-none lg:flex-[0.7] h-[550px] lg:h-full flex flex-col bg-[#0d0d0d]/80 rounded-3xl border border-white/5 scale-100 shadow-2xl overflow-hidden relative min-h-0">
        <div className="p-4 border-b border-white/10 bg-white/5 sticky top-0 z-20">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#FFD700] transition-colors" size={20} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search by name or code..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-[#0a0a0a] border-2 border-white/10 rounded-2xl focus:border-[#FFD700]/50 outline-none transition-all text-lg font-bold placeholder:text-slate-700 text-white"
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
        </div>

        {fetchError && (
          <div className="mx-4 mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-between gap-2 shrink-0 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 text-rose-500 text-xs font-black uppercase">
              <AlertCircle size={14} className="shrink-0" />
              <span className="truncate">Database Error: {fetchError}</span>
            </div>
            <button 
              onClick={() => fetchProducts()} 
              className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded text-[9px] uppercase font-black tracking-widest shrink-0 transition-colors"
            >
              Retry Sync
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-y-contain custom-scrollbar-gold min-h-0">
          {isLoadingProducts ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-20">
              <RefreshCw className="animate-spin text-[#FFD700]" size={32} />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Loading Vault...</p>
            </div>
          ) : filteredProducts.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block desktop-table w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/5">
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Product</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Code</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Stock</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredProducts.map(item => (
                      <tr 
                        key={item.id} 
                        onClick={() => addToCart(item)}
                        className={cn(
                          "hover:bg-[#FFD700]/10 cursor-pointer transition-colors group",
                          item.quantity <= 0 && "opacity-30 grayscale cursor-not-allowed"
                        )}
                      >
                        <td className="px-4 py-3">
                           <div className="flex items-center gap-2">
                             <p className="font-black text-white text-sm group-hover:gold-text">{item.name}</p>
                             {(item.active === false || String(item.active).toLowerCase() === 'false') && (
                               <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 rounded text-[8px] font-black uppercase tracking-widest leading-none border border-rose-500/20">
                                 Inactive
                               </span>
                             )}
                           </div>
                          <p className="text-[10px] text-slate-500 uppercase">{CATEGORY_MAP[item.category_id] || item.category}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{item.code}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "text-[10px] font-black uppercase",
                            item.quantity > 5 ? "text-emerald-500" : "text-rose-500"
                          )}>
                            {item.quantity} units
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#FFD700]">
                          ${safeNum(item.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile List View */}
              <div className="md:hidden mobile-card-list">
                <div className="divide-y divide-white/5">
                  {filteredProducts.map(item => (
                    <ProductItem key={item.id} item={item} onAdd={addToCart} />
                  ))}
                </div>
              </div>
            </>
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-20">
              <Package size={48} />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">No matches found</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-20">
              <ShoppingCart size={48} />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Ready for input</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Cart (30%) */}
      <div className="flex-none lg:flex-[0.3] h-[650px] lg:h-full flex flex-col bg-[#0d0d0d]/80 rounded-3xl border border-white/5 shadow-2xl overflow-hidden relative min-h-0">
        <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center shrink-0">
          <h2 className="text-xs font-black text-[#FFD700] uppercase tracking-widest flex items-center gap-2">
            <ShoppingCart size={16} />
            Cart Total
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCart([])}
              className="text-[10px] font-black text-rose-500 uppercase hover:bg-rose-500/10 px-2 py-1 rounded transition-colors"
            >
              Flush
            </button>
            <span className="text-[10px] font-black bg-white/10 px-2 py-1 rounded text-slate-400">
              {cart.length} SKU
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-y-contain p-4 flex flex-col gap-3 custom-scrollbar-gold min-h-0">
          {cart.length > 0 ? (
            [...cart].reverse().map(c => (
              <div key={c.item.id} className="p-3 bg-white/5 rounded-2xl border border-white/5 animate-in slide-in-from-top-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 mr-2">
                    <p className="font-bold text-white text-sm leading-tight">{c.item.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">${c.item.selling_price.toLocaleString()} ea</p>
                  </div>
                  <p className="font-black text-[#FFD700] text-sm">
                    ${(c.item.selling_price * c.quantity).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center bg-[#0a0a0a] rounded-xl border border-white/10">
                    <button 
                      onClick={() => updateQuantity(c.item.id, -1)}
                      className="w-11 h-11 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-8 text-center font-black text-white text-sm">{c.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(c.item.id, 1)}
                      className="w-11 h-11 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <button 
                    onClick={() => updateQuantity(c.item.id, -c.quantity)}
                    className="p-2 text-rose-500/50 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-10 py-12 flex-1">
              <ShoppingCart size={48} />
              <p className="text-[10px] font-black uppercase tracking-widest mt-4">Empty Cart</p>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 bg-[#0a0a0a] border-t border-white/10 space-y-4 shrink-0">
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <span>Total Value</span>
              <span className="text-white">${cartTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['Cash', 'Card', 'Credit'] as const).map(method => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "py-2 rounded-lg text-[10px] font-black transition-all border",
                    paymentMethod === method 
                      ? "bg-[#FFD700] border-[#FFD700] text-[#0a0a0a]" 
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
              "w-full py-5 rounded-2xl font-black flex items-center justify-center gap-3 transition-all text-base uppercase tracking-widest",
              cart.length === 0 || isProcessing
                ? "bg-white/5 text-slate-700 cursor-not-allowed"
                : "bg-[#FFD700] text-[#0a0a0a] hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(255,215,0,0.3)]"
            )}
          >
            {isProcessing ? (
              <RefreshCw className="animate-spin" size={24} />
            ) : (
              <>
                <CheckCircle2 size={24} />
                Execute Sale
              </>
            )}
          </button>
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceipt && lastTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0a0a]/95 backdrop-blur-md" onClick={() => setShowReceipt(false)} />
          <div className="relative bg-[#0a0a0a] border border-white/10 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 text-center bg-[#FFD700] text-[#0a0a0a]">
              <div className="w-16 h-16 bg-[#0a0a0a]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest">Sale Confirmed</h2>
              <p className="text-[#0a0a0a]/60 font-bold text-[10px] uppercase tracking-widest mt-1">
                {!isOnline ? 'Queued for Sync' : 'Transaction Complete'}
              </p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-3">
                {lastTransaction.items.map((c: any) => (
                  <div key={c.item.id} className="flex justify-between text-xs">
                    <span className="text-slate-400 font-bold">{c.quantity}x {c.item.name}</span>
                    <span className="font-black text-white">${(c.item.selling_price * c.quantity).toLocaleString()}</span>
                  </div>
                ))}
                <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Grand Total</span>
                  <span className="text-2xl font-black text-[#FFD700]">${lastTransaction.total.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => window.print()}
                  className="flex-1 py-4 bg-white text-[#0a0a0a] rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                >
                  Print
                </button>
                <button 
                  onClick={() => setShowReceipt(false)}
                  className="flex-1 py-4 border border-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                >
                  Close
                </button>
              </div>
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
