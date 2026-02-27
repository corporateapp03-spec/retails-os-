import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LedgerEntry, InventoryItem } from '../types';
import { 
  History, 
  RotateCcw, 
  Search, 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  Package,
  Trash2,
  Edit3,
  Check,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

export default function Sales() {
  const [sales, setSales] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);

  useEffect(() => {
    fetchSales();
  }, []);

  async function fetchSales() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('ledger')
        .select(`
          *,
          inventory:inventory_item_id (*)
        `)
        .eq('transaction_type', 'sale')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setSales(data || []);
    } catch (err) {
      console.error('Error fetching sales:', err);
      setError((err as any)?.message || 'Failed to load sales archive.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReverseSale(sale: LedgerEntry) {
    if (!window.confirm('Reverse this sale? This will restore stock to inventory and remove the ledger entry.')) {
      return;
    }

    setReversingId(sale.id);
    try {
      // 1. Restore stock if inventory_item_id exists
      if (sale.inventory_item_id && sale.quantity) {
        const { data: currentItem, error: fetchError } = await supabase
          .from('inventory')
          .select('quantity')
          .eq('id', sale.inventory_item_id)
          .single();

        if (fetchError) throw fetchError;

        const newQuantity = (currentItem?.quantity || 0) + sale.quantity;
        const { error: invError } = await supabase
          .from('inventory')
          .update({ quantity: newQuantity })
          .eq('id', sale.inventory_item_id);

        if (invError) throw invError;
      }

      // 2. Delete from ledger
      const { error: deleteError } = await supabase
        .from('ledger')
        .delete()
        .eq('id', sale.id);

      if (deleteError) throw deleteError;

      fetchSales();
    } catch (err) {
      setError('Reversal Error: ' + (err as any)?.message);
    } finally {
      setReversingId(null);
    }
  }

  async function handleUpdateAmount(sale: LedgerEntry) {
    try {
      const { error: updateError } = await supabase
        .from('ledger')
        .update({ amount: editAmount })
        .eq('id', sale.id);

      if (updateError) throw updateError;
      
      setEditingId(null);
      fetchSales();
    } catch (err) {
      setError('Update Error: ' + (err as any)?.message);
    }
  }

  const filteredSales = sales.filter(sale => 
    (sale.inventory?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (sale.fund_source || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && sales.length === 0) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 text-white rounded-2xl p-8 flex items-center justify-between shadow-lg border border-slate-800">
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Total Sales Revenue</p>
            <h2 className="text-4xl font-black mt-2">
              ${sales.reduce((acc, s) => acc + (s?.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h2>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">Archive Source: ledger WHERE type='sale'</p>
          </div>
          <DollarSign size={48} className="text-slate-800" />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-8 flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Transaction Count</p>
            <h2 className="text-4xl font-black mt-2 text-slate-900">
              {sales.length}
            </h2>
          </div>
          <History size={48} className="text-slate-100" />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="text-rose-600 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-bold text-rose-900">Operation Error</p>
            <p className="text-xs text-rose-700 mt-1 font-mono">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search sales by product or source..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Time</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Source</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="max-w-xs mx-auto">
                      <History size={40} className="mx-auto text-slate-200 mb-4" />
                      <p className="text-slate-500 font-medium">No sales records found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Calendar size={14} className="text-slate-400" />
                        <span className="text-xs font-medium">
                          {new Date(sale.created_at).toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Package size={14} className="text-blue-400" />
                        <span className="font-bold text-slate-900">{sale.inventory?.name || 'Unknown Item'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-700">{sale.quantity || 1}</span>
                    </td>
                    <td className="px-6 py-4">
                      {editingId === sale.id ? (
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            value={editAmount || 0}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setEditAmount(isNaN(val) ? 0 : val);
                            }}
                            className="w-24 px-2 py-1 border border-blue-500 rounded text-sm outline-none"
                            autoFocus
                          />
                          <button onClick={() => handleUpdateAmount(sale)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                            <Check size={16} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-black text-blue-600">
                          ${(sale?.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-1 rounded">
                        {sale.fund_source}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => {
                            setEditingId(sale.id);
                            setEditAmount(sale.amount);
                          }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit Amount"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button 
                          disabled={reversingId === sale.id}
                          onClick={() => handleReverseSale(sale)}
                          className={cn(
                            "p-2 rounded-lg transition-all flex items-center gap-1 text-xs font-bold",
                            reversingId === sale.id 
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                              : "text-rose-500 hover:bg-rose-50"
                          )}
                          title="Reverse Sale"
                        >
                          {reversingId === sale.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-400" />
                          ) : (
                            <>
                              <RotateCcw size={16} />
                              <span className="hidden lg:inline">Reverse</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
