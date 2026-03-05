import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BusinessSummary } from '../types';
import { TrendingUp, Wallet, ArrowDownCircle, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const [summaries, setSummaries] = useState<BusinessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSummary() {
      try {
        setError(null);
        const { data, error } = await supabase
          .from('business_summary')
          .select('*');
        
        if (error) throw error;
        setSummaries(data || []);
      } catch (err) {
        console.error('Error fetching business summary:', err);
        setError((err as any).message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-8 text-center max-w-2xl mx-auto">
        <AlertCircle className="mx-auto text-rose-500 mb-3" size={32} />
        <h3 className="text-rose-900 font-semibold">Connection Error</h3>
        <p className="text-rose-700 text-sm mt-1">{error}</p>
        <div className="mt-6 p-4 bg-white rounded-lg border border-rose-100 text-left">
          <p className="text-xs font-bold text-rose-900 uppercase tracking-wider mb-2">Troubleshooting Steps:</p>
          <ul className="text-xs text-rose-700 space-y-1 list-disc pl-4">
            <li>Verify <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> in Secrets.</li>
            <li>Ensure <strong>Row Level Security (RLS)</strong> policies are created for the 'anon' role.</li>
            <li>Check if the <strong>business_summary</strong> view exists in your database.</li>
          </ul>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {summaries.map((summary) => (
          <div key={summary.category_id} className="vault-card p-6 hover:gold-glow transition-all duration-300 group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{summary.category_name}</h3>
                <p className="text-2xl font-black text-white mt-1 group-hover:gold-text transition-colors">
                  ${summary.total_revenue?.toLocaleString() || '0'}
                </p>
              </div>
              <div className="p-2 bg-[#FFD700]/10 rounded-xl text-[#FFD700] shadow-[0_0_10px_rgba(255,215,0,0.1)]">
                <TrendingUp size={20} />
              </div>
            </div>
            
            <div className="space-y-4 mt-6">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-500 uppercase tracking-tighter">Available Profit</span>
                <span className="text-emerald-500">+${summary.total_profit?.toLocaleString() || '0'}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-500 uppercase tracking-tighter">Total Expenses</span>
                <span className="text-rose-500">-${summary.total_expenses?.toLocaleString() || '0'}</span>
              </div>
              <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Capital Health</span>
                <span className={cn(
                  "text-xs font-black px-3 py-1 rounded-full uppercase tracking-tighter",
                  (summary.capital_health ?? 0) >= 0 ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                )}>
                  ${summary.capital_health?.toLocaleString() || '0'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {summaries.length === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center max-w-3xl mx-auto backdrop-blur-xl">
          <AlertCircle className="mx-auto text-[#FFD700] mb-4 opacity-50" size={48} />
          <h3 className="text-[#FFD700] font-black text-xl uppercase tracking-tighter">System Offline / Empty</h3>
          <p className="text-slate-500 mt-2 font-medium">
            The <strong>business_summary</strong> view returned no data. Ensure your database tables are populated and permissions are set.
          </p>
        </div>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#050505] border border-white/5 rounded-3xl p-8 flex items-center justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD700]/5 blur-[60px] rounded-full" />
          <div className="relative z-10">
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Total Portfolio Value</p>
            <h2 className="text-4xl font-black mt-2 text-white group-hover:gold-text transition-all">
              ${(summaries.reduce((acc, s) => acc + (s.total_revenue || 0), 0) ?? 0).toLocaleString()}
            </h2>
          </div>
          <Wallet size={48} className="text-slate-800 group-hover:text-[#FFD700]/20 transition-colors" />
        </div>
        <div className="vault-card p-8 flex items-center justify-between group">
          <div className="relative z-10">
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Net System Profit</p>
            <h2 className="text-4xl font-black mt-2 text-emerald-500 group-hover:drop-shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all">
              ${(summaries.reduce((acc, s) => acc + (s.total_profit || 0), 0) ?? 0).toLocaleString()}
            </h2>
          </div>
          <TrendingUp size={48} className="text-emerald-500/10 group-hover:text-emerald-500/20 transition-colors" />
        </div>
      </div>
    </div>
  );
}
