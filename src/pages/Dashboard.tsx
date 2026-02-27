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
          <div key={summary.category_id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-slate-500 text-sm font-medium uppercase tracking-wider">{summary.category_name}</h3>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  ${summary.total_revenue?.toLocaleString() || '0'}
                </p>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <TrendingUp size={20} />
              </div>
            </div>
            
            <div className="space-y-4 mt-6">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Realized Profit</span>
                <span className="font-semibold text-emerald-600">+${summary.total_profit?.toLocaleString() || '0'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Total Expenses</span>
                <span className="font-semibold text-rose-600">-${summary.total_expenses?.toLocaleString() || '0'}</span>
              </div>
              <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Capital Health</span>
                <span className={cn(
                  "text-sm font-bold px-2 py-1 rounded",
                  (summary.capital_health ?? 0) >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                )}>
                  ${summary.capital_health?.toLocaleString() || '0'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {summaries.length === 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-8 text-center">
          <AlertCircle className="mx-auto text-blue-400 mb-3" size={32} />
          <h3 className="text-blue-900 font-semibold">No data available</h3>
          <p className="text-blue-700 text-sm mt-1">Check your Supabase connection and ensure the business_summary view is populated.</p>
        </div>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 text-white rounded-2xl p-8 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm font-medium">Total Portfolio Value</p>
            <h2 className="text-3xl font-bold mt-2">
              ${summaries.reduce((acc, s) => acc + (s.total_revenue || 0), 0).toLocaleString()}
            </h2>
          </div>
          <Wallet size={48} className="text-slate-700" />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-8 flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-sm font-medium">Net System Profit</p>
            <h2 className="text-3xl font-bold mt-2 text-emerald-600">
              ${summaries.reduce((acc, s) => acc + (s.total_profit || 0), 0).toLocaleString()}
            </h2>
          </div>
          <TrendingUp size={48} className="text-emerald-100" />
        </div>
      </div>
    </div>
  );
}
