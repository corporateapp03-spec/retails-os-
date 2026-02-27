import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { InventoryItem } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Package, CheckCircle2 } from 'lucide-react';
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

  useEffect(() => {
    if (searchTerm.length > 0) {
      searchItems();
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  async function searchItems() {
    try {
      // Fetch items first - searching by name OR code
      const { data: items, error: itemsError } = await supabase
        .from('inventory')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
        .limit(5);
      
      if (itemsError) throw itemsError;
      setSearchResults(items || []);
    } catch (err) {
      console.error('Error searching items:', err);
    }
  }

  const addToCart = (item: InventoryItem) => {
    const existing = cart.find(c => c.item.id === item.id);
    if (existing) {
      setCart(cart.map(c => c.item.id === item.id ? {...c, quantity: c.quantity + 1} : c));
    } else {
      setCart([...cart, { item, quantity: 1 }]);
    }
    setSearchTerm('');
    setSearchResults([]);
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(c => c.item.id !== id));
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
        amount: c.item.selling_price * c.quantity,
        transaction_type: 'sale',
        fund_source: 'POS Terminal'
      }));

      // 2. Insert into ledger
      const { error: ledgerError } = await supabase
        .from('ledger')
        .insert(entries);

      if (ledgerError) throw ledgerError;

      // 3. Update inventory stock levels (Decrement)
      // In a real production environment, this should be done via a DB function/trigger
      // to ensure atomicity, but we'll perform it here as requested.
      for (const cartItem of cart) {
        const newQuantity = (cartItem.item.quantity || 0) - cartItem.quantity;
        const { error: invError } = await supabase
          .from('inventory')
          .update({ quantity: newQuantity })
          .eq('id', cartItem.item.id);
        
        if (invError) throw invError;
      }

      setSuccess(true);
      setCart([]);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      alert('Database Execution Error: ' + (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
      {/* Search & Selection Area */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Search size={20} className="text-blue-500" />
            Find Products
          </h2>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search by product name or Code..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-lg"
            />
            
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-10 overflow-hidden">
                {searchResults.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="w-full flex items-center justify-between p-4 hover:bg-blue-50 transition-colors text-left border-b border-slate-50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                        <Package size={20} />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.code} • {CATEGORY_MAP[item.category_id] || item.category}</p>
                      </div>
                    </div>
                    <span className="font-bold text-blue-600">${(item.selling_price ?? 0).toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {/* Quick access items could go here */}
          <div className="aspect-square bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
            <Package size={32} className="mb-2 opacity-50" />
            <p className="text-xs font-medium">Quick access items coming soon</p>
          </div>
        </div>
      </div>

      {/* Cart & Checkout Area */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <ShoppingCart size={20} className="text-blue-500" />
            Current Order
          </h2>
          <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2 py-1 rounded-full">
            {cart.reduce((acc, c) => acc + c.quantity, 0)} items
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.length > 0 ? (
            cart.map(c => (
              <div key={c.item.id} className="flex items-center justify-between group">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{c.item.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.quantity} x ${(c.item.selling_price ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-900">
                    ${((c.item.selling_price ?? 0) * c.quantity).toLocaleString()}
                  </span>
                  <button 
                    onClick={() => removeFromCart(c.item.id)}
                    className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center py-12">
              <ShoppingCart size={48} className="mb-4 opacity-20" />
              <p className="text-sm">Your cart is empty</p>
              <p className="text-xs mt-1">Search for products to start an order</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-4">
          <div className="flex justify-between items-center text-slate-500 text-sm">
            <span>Subtotal</span>
            <span>${(cartTotal ?? 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-slate-500 text-sm">
            <span>Tax (0%)</span>
            <span>$0.00</span>
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="text-lg font-bold text-slate-900">Total</span>
            <span className="text-2xl font-black text-blue-600">${(cartTotal ?? 0).toLocaleString()}</span>
          </div>

          {success ? (
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in duration-300">
              <CheckCircle2 size={24} />
              <span className="font-bold">Sale Finalized Successfully!</span>
            </div>
          ) : (
            <button 
              disabled={cart.length === 0 || isProcessing}
              onClick={handleFinalizeSale}
              className={cn(
                "w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200",
                cart.length === 0 || isProcessing
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  : "bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]"
              )}
            >
              {isProcessing ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <CreditCard size={20} />
                  Finalize Sale
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
