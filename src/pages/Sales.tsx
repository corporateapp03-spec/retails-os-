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
  X,
  ShoppingCart,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

export default function Sales() {
  const [sales, setSales] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversingTransactionId, setReversingTransactionId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);

  useEffect(() => {
    fetchSales();
  }, []);

  async function fetchSales() {
    setLoading(true);
    setError(null);
    try {
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger')
        .select('*')
        .eq('transaction_type', 'sale')
        .order('created_at', { ascending: false });

      if (ledgerError) throw ledgerError;

      if (ledgerData && ledgerData.length > 0) {
        const itemIds = [...new Set(ledgerData.map(s => s.inventory_item_id).filter(Boolean))];
        
        let inventoryMap: Record<string, any> = {};
        
        if (itemIds.length > 0) {
          const { data: inventoryData, error: inventoryError } = await supabase
            .from('inventory')
            .select('*')
            .in('id', itemIds);

          if (!inventoryError && inventoryData) {
            inventoryMap = inventoryData.reduce((acc, item) => {
              acc[item.id] = item;
              return acc;
            }, {} as Record<string, any>);
          }
        }

        const joinedData = ledgerData.map(sale => ({
          ...sale,
          inventory: sale.inventory_item_id ? inventoryMap[sale.inventory_item_id] : null
        }));

        setSales(joinedData);
      } else {
        setSales([]);
      }
    } catch (err) {
      console.error('Error fetching sales:', err);
      setError((err as any)?.message || 'Failed to load sales archive.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReverseTransaction(transactionSales: LedgerEntry[]) {
    if (!window.confirm(`Reverse this entire sale (${transactionSales.length} items)? This will restore stock to inventory and remove the ledger entries.`)) {
      return;
    }

    const firstSaleId = transactionSales[0].id;
    setReversingTransactionId(firstSaleId);
    try {
      for (const sale of transactionSales) {
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
      }

      fetchSales();
    } catch (err) {
      setError('Reversal Error: ' + (err as any)?.message);
    } finally {
      setReversingTransactionId(null);
    }
  }

  async function handleReverseSale(sale: LedgerEntry) {
    if (!window.confirm('Reverse this specific item from the sale? This will restore stock to inventory and remove the ledger entry.')) {
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

  // Grouping logic
  const groupedSales = React.useMemo(() => {
    const groups: { date: string, transactions: { timestamp: string, items: LedgerEntry[] }[] }[] = [];
    
    // Sort sales by date descending
    const sortedSales = [...filteredSales].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    sortedSales.forEach(sale => {
      const dateStr = new Date(sale.created_at).toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const timestamp = sale.created_at;

      let dateGroup = groups.find(g => g.date === dateStr);
      if (!dateGroup) {
        dateGroup = { date: dateStr, transactions: [] };
        groups.push(dateGroup);
      }

      let transaction = dateGroup.transactions.find(t => t.timestamp === timestamp);
      if (!transaction) {
        transaction = { timestamp, items: [] };
        dateGroup.transactions.push(transaction);
      }

      transaction.items.push(sale);
    });

    return groups;
  }, [filteredSales]);

  if (loading && sales.length === 0) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#050505] border border-white/5 rounded-3xl p-8 flex items-center justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD700]/5 blur-[60px] rounded-full" />
          <div className="relative z-10">
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Total Sales Revenue</p>
            <h2 className="text-4xl font-black mt-2 text-white group-hover:gold-text transition-all">
              ${sales.reduce((acc, s) => acc + (s?.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h2>
            <p className="text-[10px] text-slate-600 mt-2 font-mono uppercase tracking-tighter">Vault Liquidity</p>
          </div>
          <DollarSign size={48} className="text-slate-800 group-hover:text-[#FFD700]/20 transition-colors" />
        </div>
        <div className="vault-card p-8 flex items-center justify-between group">
          <div>
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Transaction Count</p>
            <h2 className="text-4xl font-black mt-2 text-white group-hover:gold-text transition-all">
              {sales.length}
            </h2>
          </div>
          <History size={48} className="text-white/10 group-hover:text-[#FFD700]/20 transition-colors" />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="text-rose-500 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-black text-rose-500 uppercase tracking-tighter">Operation Error</p>
            <p className="text-xs text-rose-400 mt-1 font-mono">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500/50 hover:text-rose-500">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
          <input 
            type="text" 
            placeholder="Search sales by product or source..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-white placeholder:text-slate-700 font-medium"
          />
        </div>
      </div>

      {/* Grouped Sales Display */}
      <div className="space-y-10">
        {groupedSales.length === 0 ? (
          <div className="vault-card p-16 text-center">
            <div className="max-w-xs mx-auto">
              <History size={40} className="mx-auto text-slate-800 mb-4" />
              <p className="text-slate-500 font-black uppercase tracking-tighter">No sales records found.</p>
            </div>
          </div>
        ) : (
          groupedSales.map((dateGroup) => (
            <div key={dateGroup.date} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-white/5" />
                <div className="flex items-center gap-2 px-4 py-1.5 bg-white/5 rounded-full border border-white/10">
                  <Calendar size={14} className="text-[#FFD700]" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dateGroup.date}</span>
                </div>
                <div className="h-px flex-1 bg-white/5" />
              </div>

              <div className="grid grid-cols-1 gap-4">
                {dateGroup.transactions.map((transaction) => {
                  const totalAmount = transaction.items.reduce((sum, item) => sum + (item.amount || 0), 0);
                  const firstItem = transaction.items[0];
                  const isReversing = reversingTransactionId === firstItem.id;

                  return (
                    <div key={transaction.timestamp} className="vault-card overflow-hidden group hover:gold-glow transition-all duration-300">
                      {/* Transaction Header */}
                      <div className="bg-white/5 px-6 py-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-[#FFD700] rounded-xl flex items-center justify-center text-[#0a0a0a] shadow-[0_0_20px_rgba(255,215,0,0.2)]">
                            <ShoppingCart size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-white uppercase tracking-tighter">
                                Sale @ {new Date(transaction.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-[#FFD700] bg-[#FFD700]/10 border border-[#FFD700]/20 px-2 py-0.5 rounded-full">
                                {firstItem.fund_source}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-600 font-mono mt-0.5">ID: {transaction.timestamp.split('-').pop()}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Amount</p>
                            <p className="text-xl font-black text-[#FFD700]">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                          </div>
                          <button 
                            disabled={isReversing}
                            onClick={() => handleReverseTransaction(transaction.items)}
                            className={cn(
                              "p-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-tighter",
                              isReversing 
                                ? "bg-white/5 text-slate-600 cursor-not-allowed" 
                                : "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20"
                            )}
                          >
                            {isReversing ? (
                              <Loader2 className="animate-spin" size={16} />
                            ) : (
                              <>
                                <RotateCcw size={16} />
                                <span>Reverse Sale</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Transaction Items */}
                      <div className="divide-y divide-white/5">
                        {transaction.items.map((item) => (
                          <div key={item.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center text-slate-600 border border-white/5">
                                <Package size={16} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white group-hover:gold-text transition-colors">{item.inventory?.name || item.description || 'Unknown Item'}</p>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">Quantity: <span className="text-white">{item.quantity || 1}</span></p>
                              </div>
                            </div>

                            <div className="flex items-center gap-6">
                              <div className="text-right sm:min-w-[100px]">
                                {editingId === item.id ? (
                                  <div className="flex items-center gap-2 justify-end">
                                    <input 
                                      type="number" 
                                      value={editAmount || 0}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setEditAmount(isNaN(val) ? 0 : val);
                                      }}
                                      className="w-20 px-2 py-1 bg-white/5 border border-[#FFD700]/50 rounded text-xs outline-none text-white font-bold"
                                      autoFocus
                                    />
                                    <button onClick={() => handleUpdateAmount(item)} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded">
                                      <Check size={14} />
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="p-1 text-slate-500 hover:bg-white/5 rounded">
                                      <X size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 justify-end group/item">
                                    <span className="text-sm font-black text-white">
                                      ${(item?.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    <button 
                                      onClick={() => {
                                        setEditingId(item.id);
                                        setEditAmount(item.amount);
                                      }}
                                      className="p-1 text-slate-700 hover:text-[#FFD700] opacity-0 group-hover/item:opacity-100 transition-all"
                                    >
                                      <Edit3 size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              
                              <button 
                                disabled={reversingId === item.id}
                                onClick={() => handleReverseSale(item)}
                                className={cn(
                                  "p-1.5 rounded-lg transition-all text-slate-700 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100",
                                  reversingId === item.id && "opacity-100"
                                )}
                                title="Reverse Item"
                              >
                                {reversingId === item.id ? (
                                  <Loader2 className="animate-spin" size={14} />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
