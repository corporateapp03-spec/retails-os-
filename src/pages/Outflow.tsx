import React, { useEffect, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
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
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Data in Parallel
      const [summaryRes, ledgerRes, inventoryRes] = await Promise.all([
        supabase.from('business_summary').select('*'),
        supabase.from('ledger').select('*').order('created_at', { ascending: false }),
        supabase.from('inventory').select('*')
      ]);
      
      if (summaryRes.error) console.warn('Business summary view might be missing:', summaryRes.error);
      
      const rawSummaries = summaryRes.data || [];
      const rawLedger = ledgerRes.data || [];
      const rawInventory = inventoryRes.data || [];

      setOutflows(rawLedger.filter(l => ['expense', 'capital_withdrawal', 'CAPITAL_WITHDRAWAL'].includes(l.transaction_type || '')));

      if (rawSummaries.length > 0) {
        setSummaries(rawSummaries);
        if (!selectedCategoryId) setSelectedCategoryId(rawSummaries[0].category_id);
      } else {
        // Fallback calculation
        const safeNum = (val: any) => {
          const n = parseFloat(String(val || 0));
          return isNaN(n) ? 0 : n;
        };

        const categories = Array.from(new Set(rawInventory.map(i => i.category || 'General')));
        const fallbackSummaries: BusinessSummary[] = categories.map(cat => {
          const catLedger = rawLedger.filter(l => {
            const item = rawInventory.find(i => i.id === l.inventory_item_id);
            return (item?.category || 'General') === cat;
          });

          const revenue = catLedger.filter(l => l.transaction_type === 'sale').reduce((sum, l) => sum + safeNum(l.amount), 0);
          const expenses = catLedger.filter(l => l.transaction_type === 'expense').reduce((sum, l) => sum + safeNum(l.amount), 0);
          const profit = revenue - expenses;
          const capital = catLedger.filter(l => l.transaction_type === 'capital_withdrawal').reduce((sum, l) => sum + safeNum(l.amount), 0);

          return {
            category_id: cat,
            category_name: cat,
            total_revenue: revenue,
            total_expenses: expenses,
            total_profit: profit,
            capital_health: 10000 - capital,
            last_updated: new Date().toISOString()
          };
        });
        setSummaries(fallbackSummaries);
        if (!selectedCategoryId && fallbackSummaries.length > 0) {
          setSelectedCategoryId(fallbackSummaries[0].category_id);
        }
      }
    } catch (err: any) {
      console.error('Error fetching outflow data:', err);
      if (err.message === 'Failed to fetch') {
        setError('Database connection error. Please check your Supabase secrets and connectivity.');
      } else {
        setError(err.message || 'Failed to load financial data.');
      }
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
          description: description.trim(),
          created_at: new Date().toISOString()
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
          <div key={summary.category_id} className="vault-card p-6 relative overflow-hidden group hover:gold-glow transition-all duration-300">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <HeartPulse size={64} className="text-white" />
            </div>
            <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">{summary.category_name}</h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-slate-500 font-black uppercase mb-1 tracking-widest">Capital Health</p>
                <p className={cn(
                  "text-2xl font-black transition-colors",
                  (summary.capital_health ?? 0) > 0 ? "text-white group-hover:gold-text" : "text-rose-500"
                )}>
                  ${(summary.capital_health || 0).toLocaleString()}
                </p>
              </div>
              
              <div className="pt-4 border-t border-white/5">
                <p className="text-[10px] text-slate-500 font-black uppercase mb-1 tracking-widest">Available Profit</p>
                <p className="text-xl font-black text-emerald-500">
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
          <div className="vault-card overflow-hidden sticky top-8">
            <div className="p-6 bg-[#050505] border-b border-white/5">
              <h2 className="text-lg font-black flex items-center gap-2 text-white uppercase tracking-tighter">
                <ArrowDownCircle size={20} className="text-[#FFD700]" />
                Record Outflow
              </h2>
              <p className="text-[10px] text-slate-500 mt-1 uppercase font-black tracking-widest">Mission-Critical Financial Entry</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Category</label>
                <select 
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:border-[#FFD700]/50 outline-none font-black text-white appearance-none"
                >
                  {summaries.map(s => (
                    <option key={s.category_id} value={s.category_id}>{s.category_name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Transaction Type</label>
                <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsDecapitation(false)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest",
                      !isDecapitation ? "bg-white/10 text-[#FFD700] shadow-sm border border-white/10" : "text-slate-600 hover:text-slate-400"
                    )}
                  >
                    Expense (Profit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDecapitation(true)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest",
                      isDecapitation ? "bg-rose-500/20 text-rose-500 shadow-lg border border-rose-500/30" : "text-slate-600 hover:text-slate-400"
                    )}
                  >
                    Decapitation (Capital)
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Amount ($)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl focus:border-[#FFD700]/50 outline-none text-2xl font-black text-white placeholder:text-slate-800"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Description / Reason</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Monthly Rent, Generator Fuel, Capital Withdrawal for Expansion..."
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:border-[#FFD700]/50 outline-none text-sm min-h-[100px] resize-none text-white placeholder:text-slate-800"
                />
              </div>

              {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3">
                  <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-rose-400 font-black leading-relaxed uppercase tracking-tighter">{error}</p>
                </div>
              )}

              <button
                disabled={isSubmitting}
                className={cn(
                  "w-full py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all uppercase tracking-widest",
                  isDecapitation 
                    ? "bg-rose-500 text-white hover:bg-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.2)]" 
                    : "bg-[#FFD700] text-[#0a0a0a] hover:bg-[#FFD700]/90 shadow-[0_0_20px_rgba(255,215,0,0.2)]"
                )}
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current" />
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
          <div className="vault-card overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
              <h2 className="text-lg font-black flex items-center gap-2 text-white uppercase tracking-tighter">
                <History size={20} className="text-[#FFD700]" />
                Outflow Archive
              </h2>
              <span className="text-[10px] font-black bg-white/5 border border-white/10 px-3 py-1 rounded-full text-slate-500 uppercase tracking-widest">
                {outflows.length} Records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {outflows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <div className="max-w-xs mx-auto opacity-20">
                          <History size={48} className="mx-auto mb-4 text-white" />
                          <p className="font-black uppercase text-[10px] tracking-widest text-white">No Outflow Records</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    outflows.map((item) => (
                      <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4">
                          <p className="text-xs font-black text-white uppercase tracking-tighter">{new Date(item.created_at).toLocaleDateString()}</p>
                          <p className="text-[10px] text-slate-600 font-mono">{new Date(item.created_at).toLocaleTimeString()}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">
                            {summaries.find(s => s.category_id === item.category_id)?.category_name || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className={cn(
                              "text-[10px] font-black px-2 py-0.5 rounded-full w-fit uppercase tracking-widest border",
                              item.transaction_type.toLowerCase().includes('capital') 
                                ? "bg-rose-500/10 text-rose-500 border-rose-500/20" 
                                : "bg-white/5 text-[#FFD700] border-white/10"
                            )}>
                              {item.transaction_type.replace('_', ' ')}
                            </span>
                            <p className="text-[10px] text-slate-600 mt-1 italic truncate max-w-[150px] font-medium">
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
                                className="w-20 px-2 py-1 bg-white/5 border border-[#FFD700]/50 rounded text-xs font-black outline-none text-white"
                                autoFocus
                              />
                              <button onClick={() => handleUpdateAmount(item.id)} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded">
                                <Check size={14} />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1 text-slate-500 hover:bg-white/5 rounded">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm font-black text-white group-hover:gold-text transition-colors">
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
                              className="p-2 text-slate-600 hover:text-[#FFD700] hover:bg-[#FFD700]/10 rounded-xl transition-all"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              onClick={() => handleReverse(item.id)}
                              className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
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
