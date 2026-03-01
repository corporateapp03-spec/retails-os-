import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Category, BusinessSummary, LedgerEntry } from '../types';
import { 
  HeartPulse, 
  ArrowDownCircle, 
  History, 
  AlertCircle, 
  Trash2, 
  Edit3, 
  Check, 
  X,
  TrendingDown,
  ShieldCheck,
  DollarSign
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

export default function Outflow() {
  const [summaries, setSummaries] = useState<BusinessSummary[]>([]);
  const [outflows, setOutflows] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [isDecapitation, setIsDecapitation] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit/Reverse state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Business Summary for Health Monitor
      const { data: summaryData, error: summaryError } = await supabase
        .from('business_summary')
        .select('*');
      
      if (summaryError) throw summaryError;
      setSummaries(summaryData || []);

      // 2. Fetch Outflows Archive
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger')
        .select('*')
        .in('transaction_type', ['expense', 'capital_withdrawal', 'CAPITAL_WITHDRAWAL'])
        .order('created_at', { ascending: false });

      if (ledgerError) throw ledgerError;
      setOutflows(ledgerData || []);

      if (summaryData && summaryData.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(summaryData[0].category_id);
      }
    } catch (err) {
      console.error('Error fetching outflow data:', err);
      setError((err as any).message || 'Failed to load financial data.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCategoryId || amount <= 0 || !description.trim()) {
      alert('Please fill all fields correctly. Amount must be positive.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Server-Side Trust: Fetch current balance before save
      const { data: currentSummary, error: balanceError } = await supabase
        .from('business_summary')
        .select('*')
        .eq('category_id', selectedCategoryId)
        .single();

      if (balanceError) throw balanceError;

      const type = isDecapitation ? 'CAPITAL_WITHDRAWAL' : 'expense';
      const fundSource = isDecapitation ? 'CAPITAL' : 'PROFIT';
      
      // Integrity Check
      const availableFunds = isDecapitation 
        ? (currentSummary.capital_health || 0) 
        : (currentSummary.total_profit || 0);

      if (amount > availableFunds) {
        throw new Error(`Insufficient funds in ${fundSource}. Available: $${availableFunds.toLocaleString()}`);
      }

      // 2. Atomic Transaction: Insert into ledger
      const { error: insertError } = await supabase
        .from('ledger')
        .insert([{
          category_id: selectedCategoryId,
          amount: amount,
          transaction_type: type,
          fund_source: fundSource,
          description: description.trim()
        }]);

      if (insertError) throw insertError;

      // Reset form and refresh
      setAmount(0);
      setDescription('');
      fetchData();
      alert('Outflow recorded successfully.');
    } catch (err) {
      setError((err as any).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReverse(id: string) {
    if (!window.confirm('Reverse this transaction? This will restore the category health/profit immediately.')) return;
    
    try {
      const { error: deleteError } = await supabase
        .from('ledger')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      fetchData();
    } catch (err) {
      setError('Reversal Failed: ' + (err as any).message);
    }
  }

  async function handleUpdateAmount(id: string) {
    if (editAmount <= 0) return;
    
    try {
      const { error: updateError } = await supabase
        .from('ledger')
        .update({ amount: editAmount })
        .eq('id', id);

      if (updateError) throw updateError;
      setEditingId(null);
      fetchData();
    } catch (err) {
      setError('Update Failed: ' + (err as any).message);
    }
  }

  if (loading && summaries.length === 0) return <Loading />;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Health Monitor Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {summaries.map((summary) => (
          <div key={summary.category_id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <HeartPulse size={64} className="text-slate-900" />
            </div>
            <h3 className="text-slate-500 text-xs font-black uppercase tracking-widest mb-4">{summary.category_name}</h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Capital Health</p>
                <p className={cn(
                  "text-2xl font-black",
                  (summary.capital_health ?? 0) > 0 ? "text-slate-900" : "text-rose-600"
                )}>
                  ${(summary.capital_health || 0).toLocaleString()}
                </p>
              </div>
              
              <div className="pt-4 border-t border-slate-50">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Available Profit</p>
                <p className="text-xl font-black text-emerald-600">
                  ${(summary.total_profit || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Entry Form */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden sticky top-8">
            <div className="p-6 bg-slate-900 text-white">
              <h2 className="text-lg font-black flex items-center gap-2">
                <ArrowDownCircle size={20} className="text-rose-400" />
                Record Outflow
              </h2>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">Mission-Critical Financial Entry</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Select Category</label>
                <select 
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700 appearance-none"
                >
                  {summaries.map(s => (
                    <option key={s.category_id} value={s.category_id}>{s.category_name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Transaction Type</label>
                <div className="flex p-1 bg-slate-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setIsDecapitation(false)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-xs font-black transition-all",
                      !isDecapitation ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Expense (Profit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDecapitation(true)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-xs font-black transition-all",
                      isDecapitation ? "bg-rose-600 text-white shadow-lg shadow-rose-100" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Decapitation (Capital)
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Amount ($)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-2xl font-black text-slate-900"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Description / Reason</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Monthly Rent, Generator Fuel, Capital Withdrawal for Expansion..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[100px] resize-none"
                />
              </div>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                  <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700 font-medium leading-relaxed">{error}</p>
                </div>
              )}

              <button
                disabled={isSubmitting}
                className={cn(
                  "w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all",
                  isDecapitation 
                    ? "bg-rose-600 text-white hover:bg-rose-700 shadow-xl shadow-rose-100" 
                    : "bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-200"
                )}
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    Commit Transaction
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Outflow Archive */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black flex items-center gap-2">
                <History size={20} className="text-blue-600" />
                Outflow Archive
              </h2>
              <span className="text-[10px] font-black bg-slate-100 px-3 py-1 rounded-full text-slate-500 uppercase">
                {outflows.length} Records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {outflows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <div className="max-w-xs mx-auto opacity-20">
                          <History size={48} className="mx-auto mb-4" />
                          <p className="font-black uppercase text-xs">No Outflow Records</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    outflows.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-slate-900">{new Date(item.created_at).toLocaleDateString()}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{new Date(item.created_at).toLocaleTimeString()}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-black text-slate-700">
                            {summaries.find(s => s.category_id === item.category_id)?.category_name || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className={cn(
                              "text-[10px] font-black px-2 py-0.5 rounded-full w-fit uppercase",
                              item.transaction_type.toLowerCase().includes('capital') 
                                ? "bg-rose-50 text-rose-600" 
                                : "bg-blue-50 text-blue-600"
                            )}>
                              {item.transaction_type.replace('_', ' ')}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-1 italic truncate max-w-[150px]">
                              {item.description || 'No description'}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {editingId === item.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <input 
                                type="number"
                                value={editAmount}
                                onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 border border-blue-500 rounded text-xs font-black outline-none"
                                autoFocus
                              />
                              <button onClick={() => handleUpdateAmount(item.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                                <Check size={14} />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm font-black text-slate-900">
                              ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingId(item.id);
                                setEditAmount(item.amount);
                              }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              onClick={() => handleReverse(item.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              <Trash2 size={14} />
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
      </div>
    </div>
  );
}
