import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Category } from '../types';
import { ArrowUpRight, Wallet, History, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Outflows() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    category_id: '',
    amount: 0,
    transaction_type: 'expense' as 'expense' | 'capital_deduction',
    fund_source: '',
    note: ''
  });

  useEffect(() => {
    async function fetchCategories() {
      try {
        const { data, error } = await supabase.from('categories').select('*');
        if (error) throw error;
        setCategories(data || []);
      } catch (err) {
        console.error('Error fetching categories:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCategories();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('ledger')
        .insert([{
          category_id: form.category_id,
          amount: form.amount,
          transaction_type: form.transaction_type,
          fund_source: form.fund_source
          // note is optional or handled by a separate field if it exists
        }]);

      if (error) throw error;

      setSuccess(true);
      setForm({
        category_id: '',
        amount: 0,
        transaction_type: 'expense',
        fund_source: '',
        note: ''
      });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      alert('Error logging outflow: ' + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <ArrowUpRight size={24} className="text-rose-500" />
            Log Outflow
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Transaction Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({...form, transaction_type: 'expense'})}
                  className={cn(
                    "py-2 px-4 rounded-lg text-sm font-medium border transition-all",
                    form.transaction_type === 'expense' 
                      ? "bg-rose-50 border-rose-200 text-rose-700" 
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setForm({...form, transaction_type: 'capital_deduction'})}
                  className={cn(
                    "py-2 px-4 rounded-lg text-sm font-medium border transition-all",
                    form.transaction_type === 'capital_deduction' 
                      ? "bg-amber-50 border-amber-200 text-amber-700" 
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Capital Deduction
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Category</label>
              <select
                required
                value={form.category_id}
                onChange={e => setForm({...form, category_id: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Amount ($)</label>
              <input
                required
                type="number"
                value={form.amount}
                onChange={e => setForm({...form, amount: parseFloat(e.target.value)})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Fund Source / Payee</label>
              <input
                required
                type="text"
                value={form.fund_source}
                onChange={e => setForm({...form, fund_source: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. Petty Cash, Office Rent"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Note (Optional)</label>
              <textarea
                value={form.note}
                onChange={e => setForm({...form, note: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                placeholder="Details about this outflow..."
              />
            </div>

            {success ? (
              <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in duration-300">
                <CheckCircle2 size={24} />
                <span className="font-bold">Outflow Logged Successfully!</span>
              </div>
            ) : (
              <button
                disabled={isSubmitting}
                className={cn(
                  "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all",
                  isSubmitting
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]"
                )}
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <ArrowUpRight size={20} />
                    Record Transaction
                  </>
                )}
              </button>
            )}
          </form>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <History size={20} className="text-slate-400" />
            Recent Outflows
          </h3>
          <div className="space-y-4">
            {/* This would ideally fetch from ledger where type is expense/deduction */}
            <div className="p-4 bg-white rounded-xl border border-slate-100 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-slate-900">Office Supplies</p>
                <p className="text-xs text-slate-500">2 hours ago • Electronics</p>
              </div>
              <span className="text-sm font-bold text-rose-600">-$45.00</span>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-100 flex justify-between items-center opacity-60">
              <div>
                <p className="text-sm font-medium text-slate-900">Electricity Bill</p>
                <p className="text-xs text-slate-500">Yesterday • General</p>
              </div>
              <span className="text-sm font-bold text-rose-600">-$120.00</span>
            </div>
          </div>
          <button className="w-full mt-6 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
            View all transactions →
          </button>
        </div>

        <div className="bg-amber-50 p-8 rounded-2xl border border-amber-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-500 shrink-0" size={24} />
            <div>
              <h4 className="font-bold text-amber-900">Audit Warning</h4>
              <p className="text-sm text-amber-800 mt-1">
                All capital deductions require manual approval from the finance department. Ensure you have the necessary documentation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
