import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { InventoryItem } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Package, CheckCircle2, TrendingUp, WifiOff, Cloud, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const CATEGORY_MAP: Record<number, string> = {
  1: 'Oils',
  2: 'Spare Parts',
  3: 'Electrical Spares'
};

interface QueuedSale {
  id: string;
  cart: {item: InventoryItem, quantity: number}[];
  paymentMethod: string;
  timestamp: string;
  total: number;
}

export default function POS() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [cart, setCart] = useState<{item: InventoryItem, quantity: number}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queuedSales, setQueuedSales] = useState<QueuedSale[]>([]);

  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Credit'>('Cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);

  // Monitor Online Status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Load queued sales from localStorage
    const saved = localStorage.getItem('offline_sales_queue');
    if (saved) {
      setQueuedSales(JSON.parse(saved));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Background Sync Logic
  useEffect(() => {
    if (isOnline && queuedSales.length > 0 && !isSyncing) {
      syncQueuedSales();
    }
  }, [isOnline, queuedSales]);

  async function syncQueuedSales() {
    setIsSyncing(true);
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
    setIsSyncing(false);
  }

  // Debounced Search Logic
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.length > 0) {
        searchItems();
      } else {
        setSearchResults([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchTerm]);

  async function searchItems() {
    if (!isOnline) return;
    try {
      const { data: items, error: itemsError } = await supabase
        .from('inventory')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
        .eq('active', true)
        .limit(20); // Increased limit for better search experience
      
      if (itemsError) throw itemsError;
      setSearchResults(items || []);
    } catch (err) {
      console.error('Error searching items:', err);
    }
  }

  const addToCart = (item: InventoryItem) => {
    const existing = cart.find(c => c.item.id === item.id);
    const currentQtyInCart = existing ? existing.quantity : 0;
    
    if (item.quantity <= currentQtyInCart) {
      alert(`Insufficient stock for ${item.name}. Available: ${item.quantity}`);
      return;
    }

    if (existing) {
      setCart(cart.map(c => c.item.id === item.id ? {...c, quantity: c.quantity + 1} : c));
    } else {
      setCart([...cart, { item, quantity: 1 }]);
    }
    setSearchTerm('');
    setSearchResults([]);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.item.id !== id) return c;
      const newQty = Math.max(0, c.quantity + delta);
      
      if (delta > 0 && c.item.quantity <= c.quantity) {
        alert('Cannot exceed available stock');
        return c;
      }
      
      return { ...c, quantity: newQty };
    }).filter(c => c.quantity > 0));
  };

  const clearCart = () => {
    if (cart.length > 0 && window.confirm('Clear current order?')) {
      setCart([]);
    }
  };

  const cartTotal = cart.reduce((acc, c) => acc + (c.item.selling_price * c.quantity), 0);

  async function processSale(saleCart: {item: InventoryItem, quantity: number}[], method: string, timestamp: string) {
    // 1. Prepare ledger entries
    const entries = saleCart.map(c => ({
      category_id: c.item.category_id,
      inventory_item_id: c.item.id,
      quantity: c.quantity,
      amount: c.item.selling_price * c.quantity,
      transaction_type: 'sale' as const,
      fund_source: method,
      description: `Sale: ${c.item.name} (x${c.quantity})`,
      created_at: timestamp
    }));

    // 2. Insert into ledger
    let { error: ledgerError } = await supabase
      .from('ledger')
      .insert(entries);

    if (ledgerError && (ledgerError.message.includes('inventory_item_id') || ledgerError.code === 'PGRST204')) {
      const fallbackEntries = entries.map(({ inventory_item_id, ...rest }) => rest);
      const { error: retryError } = await supabase
        .from('ledger')
        .insert(fallbackEntries);
      ledgerError = retryError;
    }

    if (ledgerError) throw ledgerError;

    // 3. Inventory Update
    const itemIds = saleCart.map(c => c.item.id);
    const { data: latestItems, error: fetchError } = await supabase
      .from('inventory')
      .select('id, quantity')
      .in('id', itemIds);

    if (fetchError) throw fetchError;

    for (const cartItem of saleCart) {
      const latest = latestItems?.find(i => i.id === cartItem.item.id);
      const currentStock = latest?.quantity || 0;
      
      const { error: invError } = await supabase
        .from('inventory')
        .update({ quantity: currentStock - cartItem.quantity })
        .eq('id', cartItem.item.id);
      
      if (invError) throw invError;
    }
  }

  async function handleFinalizeSale() {
    if (cart.length === 0) return;
    setIsProcessing(true);
    
    const now = new Date();
    const timestamp = now.toISOString();
    const currentCart = [...cart];
    const currentTotal = cartTotal;
    const currentMethod = paymentMethod;

    // Optimistic UI: Clear cart immediately
    setCart([]);
    setLastTransaction({
      items: currentCart,
      total: currentTotal,
      method: currentMethod,
      date: timestamp
    });
    setSuccess(true);
    setShowReceipt(true);

    if (!isOnline) {
      // Queue for later
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
      setIsProcessing(false);
      return;
    }

    try {
      await processSale(currentCart, currentMethod, timestamp);
    } catch (err) {
      console.error('Online transaction failed, queuing instead:', err);
      // If online processing fails, queue it
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
      setIsProcessing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-160px)] relative overflow-hidden">
      {/* Syncing Indicator */}
      {(isSyncing || queuedSales.length > 0) && (
        <div className="fixed bottom-8 right-8 z-50 flex items-center gap-3 bg-[#FFD700] text-[#0a0a0a] px-4 py-2 rounded-full font-black shadow-[0_0_20px_rgba(255,215,0,0.4)] animate-bounce">
          {isSyncing ? <RefreshCw className="animate-spin" size={18} /> : <Cloud size={18} />}
          <span className="text-xs uppercase tracking-tighter">
            {isSyncing ? 'Syncing Sales...' : `${queuedSales.length} Sales Offline`}
          </span>
        </div>
      )}

      {/* Left Column: Search & Items (7/12) */}
      <div className="lg:col-span-7 space-y-6 flex flex-col h-full overflow-y-auto pr-2 custom-scrollbar">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-sm sticky top-0 z-30">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-[#FFD700] flex items-center gap-3 uppercase tracking-tighter">
              <Search size={24} />
              Command Center
            </h2>
            <div className="flex items-center gap-2">
              {!isOnline && (
                <span className="flex items-center gap-1 text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                  <WifiOff size={12} /> Offline Mode
                </span>
              )}
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/10">
                Inventory Source
              </span>
            </div>
          </div>
          
          <div className="relative">
            <input 
              type="text" 
              placeholder={isOnline ? "Scan Barcode or Type Product Name..." : "Search Disabled Offline"} 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!isOnline}
              className="w-full pl-6 pr-6 py-5 bg-white/5 border-2 border-white/10 rounded-2xl focus:border-[#FFD700]/50 focus:ring-4 focus:ring-[#FFD700]/5 outline-none transition-all text-xl font-bold placeholder:text-slate-700 text-white disabled:opacity-50 shadow-[0_0_20px_rgba(255,215,0,0.05)]"
              autoFocus
            />
            
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 max-h-[60vh] flex flex-col">
                <div className="p-2 bg-white/5 border-b border-white/10 text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 shrink-0">
                  Search Results ({searchResults.length})
                </div>
                <div className="overflow-y-auto custom-scrollbar">
                  {searchResults.map(item => (
                    <button
                      key={item.id}
                      disabled={item.quantity <= 0}
                      onClick={() => addToCart(item)}
                      className={cn(
                        "w-full flex items-center justify-between p-5 transition-all text-left border-b border-white/5 last:border-0",
                        item.quantity <= 0 ? "opacity-30 cursor-not-allowed grayscale" : "hover:bg-[#FFD700]/10"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center",
                          item.quantity > 0 ? "bg-[#FFD700]/10 text-[#FFD700]" : "bg-white/5 text-slate-600"
                        )}>
                          <Package size={24} />
                        </div>
                        <div>
                          <p className="font-black text-white">{item.name}</p>
                          <p className="text-xs text-slate-500 font-medium">
                            {item.code} • {CATEGORY_MAP[item.category_id] || item.category}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-[#FFD700] text-lg">${(item.selling_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <p className={cn(
                          "text-[10px] font-bold uppercase tracking-widest",
                          item.quantity > 5 ? "text-emerald-500" : "text-rose-500"
                        )}>
                          Stock: {item.quantity}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Access Grid */}
        <div className="bg-white/5 rounded-3xl border-2 border-dashed border-white/10 p-8 flex flex-col items-center justify-center text-slate-600 text-center min-h-[200px]">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center shadow-sm mb-4 border border-white/10">
            <TrendingUp size={32} className="text-[#FFD700] opacity-20" />
          </div>
          <h3 className="text-lg font-black text-[#FFD700] uppercase tracking-tighter">Elite Performance Mode</h3>
          <p className="text-sm max-w-xs mt-2 font-medium text-slate-500">Offline-first architecture active. Sales will queue locally and sync automatically when connection is restored.</p>
        </div>
      </div>

      {/* Right Column: Cart & Checkout (5/12) */}
      <div className="lg:col-span-5 flex flex-col gap-6 h-full overflow-hidden">
        {/* Cart Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-sm flex flex-col overflow-hidden flex-1">
          <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
            <h2 className="text-lg font-black text-[#FFD700] flex items-center gap-3 uppercase tracking-tighter">
              <ShoppingCart size={22} />
              Active Order
            </h2>
            <button 
              onClick={clearCart}
              className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-500/10 px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-rose-500/20"
            >
              Purge Cart
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {cart.length > 0 ? (
              cart.map(c => (
                <div key={c.item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 group animate-in slide-in-from-right-4 duration-200">
                  <div className="flex-1">
                    <p className="font-black text-white">{c.item.name}</p>
                    <p className="text-xs text-slate-500 font-mono">
                      ${(c.item.selling_price ?? 0).toLocaleString()} / unit
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden">
                      <button 
                        onClick={() => updateQuantity(c.item.id, -1)}
                        className="px-3 py-1 hover:bg-white/5 text-slate-500 transition-colors"
                      >
                        -
                      </button>
                      <span className="px-3 font-black text-[#FFD700] min-w-[32px] text-center">{c.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(c.item.id, 1)}
                        className="px-3 py-1 hover:bg-white/5 text-slate-500 transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="font-black text-white">
                        ${((c.item.selling_price ?? 0) * c.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-700 text-center py-12">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                  <ShoppingCart size={32} className="opacity-10" />
                </div>
                <p className="text-sm font-black uppercase tracking-tighter">System Ready</p>
                <p className="text-xs mt-1 font-medium">Awaiting input...</p>
              </div>
            )}
          </div>

          {/* Summary Card */}
          <div className="p-8 bg-[#0a0a0a] border-t border-white/10 space-y-4">
            <div className="flex justify-between items-center text-slate-600 text-xs font-black uppercase tracking-widest">
              <span>Subtotal</span>
              <span>${(cartTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600 text-xs font-black uppercase tracking-widest">
              <span>Tax (0%)</span>
              <span>$0.00</span>
            </div>
            <div className="flex justify-between items-end pt-4 border-t border-white/5">
              <span className="text-sm font-black uppercase tracking-widest text-[#FFD700]">Grand Total</span>
              <span className="text-4xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">${(cartTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Payment Card */}
          <div className="p-6 bg-white/5 border-t border-white/10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Authorization Method</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {(['Cash', 'Card', 'Credit'] as const).map(method => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "py-3 rounded-xl text-xs font-black transition-all border-2",
                    paymentMethod === method 
                      ? "bg-[#FFD700] border-[#FFD700] text-[#0a0a0a] shadow-[0_0_15px_rgba(255,215,0,0.3)]" 
                      : "bg-transparent border-white/10 text-slate-500 hover:border-white/20"
                  )}
                >
                  {method}
                </button>
              ))}
            </div>

            <button 
              disabled={cart.length === 0 || isProcessing}
              onClick={handleFinalizeSale}
              className={cn(
                "w-full py-5 rounded-2xl font-black flex items-center justify-center gap-3 transition-all text-lg uppercase tracking-tighter",
                cart.length === 0 || isProcessing
                  ? "bg-white/5 text-slate-700 cursor-not-allowed border border-white/5"
                  : "bg-[#FFD700] text-[#0a0a0a] hover:bg-[#FFD700]/90 shadow-[0_0_30px_rgba(255,215,0,0.2)] active:scale-[0.98]"
              )}
            >
              {isProcessing ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0a0a0a]"></div>
              ) : (
                <>
                  <CreditCard size={24} />
                  Execute Transaction
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success Modal / Receipt */}
      {showReceipt && lastTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-xl" onClick={() => setShowReceipt(false)} />
          <div className="relative bg-[#0a0a0a] border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 text-center bg-[#FFD700] text-[#0a0a0a]">
              <div className="w-20 h-20 bg-[#0a0a0a]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={48} />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tighter">Transaction Executed</h2>
              <p className="text-[#0a0a0a]/70 font-bold mt-1 text-sm">
                {!isOnline ? 'Queued for Background Sync' : 'Recorded in Ledger'}
              </p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vault Receipt</p>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                  {lastTransaction.items.map((c: any) => (
                    <div key={c.item.id} className="flex justify-between text-sm">
                      <span className="text-slate-400 font-bold">{c.quantity}x {c.item.name}</span>
                      <span className="font-black text-white">${(c.item.selling_price * c.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Total Value</span>
                    <span className="text-xl font-black text-[#FFD700]">${lastTransaction.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => window.print()}
                  className="flex-1 py-4 bg-white text-[#0a0a0a] rounded-2xl font-black text-sm hover:bg-white/90 transition-all uppercase tracking-tighter"
                >
                  Print Receipt
                </button>
                <button 
                  onClick={() => setShowReceipt(false)}
                  className="flex-1 py-4 border-2 border-white/10 text-white rounded-2xl font-black text-sm hover:bg-white/5 transition-all uppercase tracking-tighter"
                >
                  New Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
