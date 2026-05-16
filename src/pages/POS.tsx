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
  X 
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
          <p className="font-black text-white text-sm md:text-base">{item.name}</p>
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
  const [debouncedQuery, setDebouncedQuery] = useState('');
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

  const searchInputRef = useRef<HTMLInputElement>(null);

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
    if (!isConfigured) return;
    try {
      setIsLoadingProducts(true);
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('active', true)
        .order('name');
      
      if (error) throw error;
      setAllProducts(data || []);
    } catch (err: any) {
      console.error('Error fetching products:', err);
      if (err.message === 'Failed to fetch') {
        alert('Database connection error. Using local cache if available.');
      }
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.toLowerCase());
    }, 150); // 150ms high-speed debounce
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // High-performance local fuzzy search
  const filteredProducts = useMemo(() => {
    if (!debouncedQuery) return [];
    return allProducts.filter(p => 
      p.name.toLowerCase().includes(debouncedQuery) || 
      (p.code && p.code.toLowerCase().includes(debouncedQuery))
    ).slice(0, 50); // Limit results for UI performance
  }, [debouncedQuery, allProducts]);

  // Background Sync Logic
  useEffect(() => {
    if (isOnline && queuedSales.length > 0 && !isSyncing) {
      syncQueuedSales();
    }
  }, [isOnline, queuedSales]);

  async function syncQueuedSales() {
    if (isSyncing) return;
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

    let { error: ledgerError } = await supabase.from('ledger').insert(entries);

    if (ledgerError && (ledgerError.message.includes('inventory_item_id') || ledgerError.code === 'PGRST204')) {
      const fallbackEntries = entries.map(({ inventory_item_id, ...rest }) => rest);
      const { error: retryError } = await supabase.from('ledger').insert(fallbackEntries);
      ledgerError = retryError;
    }

    if (ledgerError) throw ledgerError;

    for (const cartItem of saleCart) {
      const { data: latest } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('id', cartItem.item.id)
        .single();
      
      const currentStock = latest?.quantity || 0;
      await supabase
        .from('inventory')
        .update({ quantity: currentStock - cartItem.quantity })
        .eq('id', cartItem.item.id);
    }
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
    <div className="flex flex-col lg:flex-row min-h-0 lg:h-[calc(100vh-140px)] gap-4 lg:gap-6 lg:overflow-hidden">
      {/* Syncing Indicator */}
      {(isSyncing || queuedSales.length > 0) && (
        <div className="fixed bottom-24 right-4 sm:right-8 z-50 flex items-center gap-3 bg-[#FFD700] text-[#0a0a0a] px-4 py-2 rounded-full font-black shadow-[0_0_20px_rgba(255,215,0,0.4)]">
          {isSyncing ? <RefreshCw className="animate-spin" size={16} /> : <Cloud size={16} />}
          <span className="text-[10px] uppercase tracking-widest">
            {isSyncing ? 'Syncing...' : `${queuedSales.length} Offline`}
          </span>
        </div>
      )}

      {/* Left Pane: Search & Results (70%) */}
      <div className="flex-none lg:flex-[0.7] flex flex-col bg-white/5 rounded-3xl border border-white/10 overflow-hidden min-h-[400px] lg:min-h-0">
        <div className="p-4 border-b border-white/10 bg-white/5 sticky top-0 z-20">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#FFD700] transition-colors" size={20} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search by product name or SKU..." 
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

        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar-gold min-h-0">
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
                          <p className="font-black text-white text-sm group-hover:gold-text">{item.name}</p>
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
      <div className="flex-none lg:flex-[0.3] flex flex-col bg-white/5 rounded-3xl border border-white/10 overflow-hidden relative min-h-[500px] lg:min-h-0">
        <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center shrink-0">
          <h2 className="text-sm font-black text-[#FFD700] uppercase tracking-widest flex items-center gap-2">
            <ShoppingCart size={16} />
            Active Cart
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCart([])}
              className="text-[10px] font-black text-rose-500 uppercase hover:bg-rose-500/10 px-2 py-1 rounded transition-colors"
            >
              Clear
            </button>
            <span className="text-[10px] font-black bg-white/10 px-2 py-1 rounded text-slate-400">
              {cart.length} Items
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 flex flex-col gap-3 custom-scrollbar-gold min-h-0">
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
