import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { InventoryItem } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Package, CheckCircle2, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';

const CATEGORY_MAP: Record<number, string> = {
  1: 'Oils',
  2: 'Spare Parts',
  3: 'Electrical Spares'
};

export default function POS() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [cart, setCart] = useState<{item: InventoryItem, quantity: number}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Credit'>('Cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);

  useEffect(() => {
    if (searchTerm.length > 0) {
      searchItems();
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  async function searchItems() {
    try {
      const { data: items, error: itemsError } = await supabase
        .from('inventory')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
        .eq('active', true)
        .limit(8);
      
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

  async function handleFinalizeSale() {
    if (cart.length === 0) return;
    setIsProcessing(true);
    
    try {
      // 1. Prepare ledger entries
      const entries = cart.map(c => ({
        category_id: c.item.category_id,
        inventory_item_id: c.item.id,
        quantity: c.quantity,
        selling_price: c.item.selling_price * c.quantity,
        cost: (c.item.cost_price || 0) * c.quantity,
        transaction_type: 'sale',
        fund_source: paymentMethod
      }));

      // 2. Insert into ledger
      const { error: ledgerError } = await supabase
        .from('ledger')
        .insert(entries);

      if (ledgerError) throw ledgerError;

      // 3. Update inventory stock levels (Decrement)
      for (const cartItem of cart) {
        const { data: latestItem, error: fetchError } = await supabase
          .from('inventory')
          .select('quantity')
          .eq('id', cartItem.item.id)
          .single();

        if (fetchError) throw fetchError;

        const currentStock = latestItem?.quantity || 0;
        if (currentStock < cartItem.quantity) {
          throw new Error(`Stock mismatch for ${cartItem.item.name}. Available: ${currentStock}`);
        }

        const { error: invError } = await supabase
          .from('inventory')
          .update({ quantity: currentStock - cartItem.quantity })
          .eq('id', cartItem.item.id);
        
        if (invError) throw invError;
      }

      setLastTransaction({
        items: [...cart],
        total: cartTotal,
        method: paymentMethod,
        date: new Date().toISOString()
      });
      setSuccess(true);
      setShowReceipt(true);
      setCart([]);
    } catch (err) {
      alert('Transaction Failed: ' + (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
      {/* Left Column: Search & Items (7/12) */}
      <div className="lg:col-span-7 space-y-6 flex flex-col h-full">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
              <Search size={24} className="text-blue-600" />
              Quick Search
            </h2>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
              Inventory Source
            </span>
          </div>
          
          <div className="relative">
            <input 
              type="text" 
              placeholder="Scan Barcode or Type Product Name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-6 pr-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all text-xl font-medium placeholder:text-slate-300"
              autoFocus
            />
            
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-slate-200 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2">
                <div className="p-2 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">
                  Search Results
                </div>
                {searchResults.map(item => (
                  <button
                    key={item.id}
                    disabled={item.quantity <= 0}
                    onClick={() => addToCart(item)}
                    className={cn(
                      "w-full flex items-center justify-between p-5 transition-all text-left border-b border-slate-50 last:border-0",
                      item.quantity <= 0 ? "opacity-50 cursor-not-allowed grayscale" : "hover:bg-blue-50"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        item.quantity > 0 ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"
                      )}>
                        <Package size={24} />
                      </div>
                      <div>
                        <p className="font-black text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500 font-medium">
                          {item.code} • {CATEGORY_MAP[item.category_id] || item.category}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-blue-600 text-lg">${(item.selling_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
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
            )}
          </div>
        </div>

        {/* Quick Access Grid */}
        <div className="flex-1 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-slate-400 text-center">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
            <TrendingUp size={32} className="opacity-20" />
          </div>
          <h3 className="text-lg font-bold text-slate-600">Rapid-Fire Mode Active</h3>
          <p className="text-sm max-w-xs mt-2">Use the search bar above to quickly add items to the cart. Stock levels are verified in real-time.</p>
        </div>
      </div>

      {/* Right Column: Cart & Checkout (5/12) */}
      <div className="lg:col-span-5 flex flex-col gap-6 h-full">
        {/* Cart Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden flex-1">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-3">
              <ShoppingCart size={22} className="text-blue-600" />
              Current Order
            </h2>
            <button 
              onClick={clearCart}
              className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-all"
            >
              Clear All
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {cart.length > 0 ? (
              cart.map(c => (
                <div key={c.item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group animate-in slide-in-from-right-4 duration-200">
                  <div className="flex-1">
                    <p className="font-black text-slate-900">{c.item.name}</p>
                    <p className="text-xs text-slate-500 font-mono">
                      ${(c.item.selling_price ?? 0).toLocaleString()} / unit
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <button 
                        onClick={() => updateQuantity(c.item.id, -1)}
                        className="px-3 py-1 hover:bg-slate-50 text-slate-400 transition-colors"
                      >
                        -
                      </button>
                      <span className="px-3 font-black text-slate-900 min-w-[32px] text-center">{c.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(c.item.id, 1)}
                        className="px-3 py-1 hover:bg-slate-50 text-slate-400 transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="font-black text-slate-900">
                        ${((c.item.selling_price ?? 0) * c.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center py-12">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <ShoppingCart size={32} className="opacity-10" />
                </div>
                <p className="text-sm font-bold">Cart is Empty</p>
                <p className="text-xs mt-1">Add items to start transaction</p>
              </div>
            )}
          </div>

          {/* Summary Card */}
          <div className="p-8 bg-slate-900 text-white space-y-4">
            <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-widest">
              <span>Subtotal</span>
              <span>${(cartTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-widest">
              <span>Tax (0%)</span>
              <span>$0.00</span>
            </div>
            <div className="flex justify-between items-end pt-4 border-t border-slate-800">
              <span className="text-sm font-black uppercase tracking-widest text-blue-400">Grand Total</span>
              <span className="text-4xl font-black text-white">${(cartTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Payment Card */}
          <div className="p-6 bg-white border-t border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Select Payment Method</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {(['Cash', 'Card', 'Credit'] as const).map(method => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "py-3 rounded-xl text-xs font-black transition-all border-2",
                    paymentMethod === method 
                      ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100" 
                      : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
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
                "w-full py-5 rounded-2xl font-black flex items-center justify-center gap-3 transition-all text-lg",
                cart.length === 0 || isProcessing
                  ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-100 active:scale-[0.98]"
              )}
            >
              {isProcessing ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              ) : (
                <>
                  <CreditCard size={24} />
                  Complete Sale
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success Modal / Receipt */}
      {showReceipt && lastTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setShowReceipt(false)} />
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 text-center bg-emerald-500 text-white">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={48} />
              </div>
              <h2 className="text-2xl font-black">Sale Posted!</h2>
              <p className="text-emerald-100 font-medium mt-1">Transaction recorded in Ledger</p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transaction Details</p>
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                  {lastTransaction.items.map((c: any) => (
                    <div key={c.item.id} className="flex justify-between text-sm">
                      <span className="text-slate-600 font-medium">{c.quantity}x {c.item.name}</span>
                      <span className="font-black text-slate-900">${(c.item.selling_price * c.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Paid</span>
                    <span className="text-xl font-black text-blue-600">${lastTransaction.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => window.print()}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all"
                >
                  Print Receipt
                </button>
                <button 
                  onClick={() => setShowReceipt(false)}
                  className="flex-1 py-4 border-2 border-slate-100 text-slate-500 rounded-2xl font-black text-sm hover:bg-slate-50 transition-all"
                >
                  New Sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
