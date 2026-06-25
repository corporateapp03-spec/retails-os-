import React, { useEffect, useState, useMemo } from 'react';
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
  DollarSign,
  Calendar,
  Download,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  FileText
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  const [allLedger, setAllLedger] = useState<LedgerEntry[]>([]);
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'monthly' | 'semi-annual' | 'annual'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedSemiYear, setSelectedSemiYear] = useState<number>(() => new Date().getFullYear());
  const [selectedHalf, setSelectedHalf] = useState<'H1' | 'H2'>(() => {
    const month = new Date().getMonth();
    return month < 6 ? 'H1' : 'H2';
  });
  const [selectedAnnualYear, setSelectedAnnualYear] = useState<number>(() => new Date().getFullYear());
  const [downloadingReport, setDownloadingReport] = useState<boolean>(false);

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

      const enrichedLedger = rawLedger.map(l => ({
        ...l,
        inventory: rawInventory.find(i => i.id === l.inventory_item_id)
      }));
      setAllLedger(enrichedLedger);

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

  const safeNum = (val: any) => {
    const n = parseFloat(String(val || 0));
    return isNaN(n) ? 0 : n;
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    allLedger.forEach(entry => {
      if (entry.created_at) {
        const y = new Date(entry.created_at).getFullYear();
        if (!isNaN(y)) {
          years.add(y);
        }
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allLedger]);

  const bankStatementData = useMemo(() => {
    const matchedEntries = allLedger.filter(entry => {
      if (!entry.created_at) return false;
      const entryDate = new Date(entry.created_at);
      
      if (reportPeriod === 'daily') {
        const targetDate = new Date(selectedDate);
        return entryDate.getFullYear() === targetDate.getFullYear() &&
               entryDate.getMonth() === targetDate.getMonth() &&
               entryDate.getDate() === targetDate.getDate();
      } else if (reportPeriod === 'monthly') {
        const [yearStr, monthStr] = selectedMonth.split('-');
        const targetYear = parseInt(yearStr) || new Date().getFullYear();
        const targetMonth = (parseInt(monthStr) || 1) - 1;
        return entryDate.getFullYear() === targetYear &&
               entryDate.getMonth() === targetMonth;
      } else if (reportPeriod === 'semi-annual') {
        const isYearMatch = entryDate.getFullYear() === selectedSemiYear;
        const isHalfMatch = selectedHalf === 'H1' 
          ? entryDate.getMonth() < 6 
          : entryDate.getMonth() >= 6;
        return isYearMatch && isHalfMatch;
      } else {
        return entryDate.getFullYear() === selectedAnnualYear;
      }
    });

    const sortedEntries = [...matchedEntries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    let totalInflow = 0;
    let totalOutflow = 0;
    
    const statementRows = sortedEntries.map(entry => {
      const isInflow = entry.transaction_type === 'sale';
      const amount = entry.amount;
      if (isInflow) {
        totalInflow += amount;
      } else {
        totalOutflow += amount;
      }
      
      return {
        ...entry,
        isInflow,
        amount
      };
    });

    const netChange = totalInflow - totalOutflow;

    return {
      statementRows,
      totalInflow,
      totalOutflow,
      netChange,
      count: statementRows.length
    };
  }, [allLedger, reportPeriod, selectedDate, selectedMonth, selectedSemiYear, selectedHalf, selectedAnnualYear]);

  const downloadBankStatementReport = () => {
    let periodTitle = '';
    let periodLabel = '';
    let dateStrForFile = '';

    if (reportPeriod === 'daily') {
      const targetDate = new Date(selectedDate);
      const formatted = targetDate.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      periodTitle = 'DAILY FINANCIAL STATEMENT';
      periodLabel = `Date: ${formatted}`;
      dateStrForFile = `Daily_${selectedDate}`;
    } else if (reportPeriod === 'monthly') {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const targetYear = parseInt(yearStr) || new Date().getFullYear();
      const targetMonth = (parseInt(monthStr) || 1) - 1;
      const dateObj = new Date(targetYear, targetMonth, 1);
      const formatted = dateObj.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'long'
      });
      periodTitle = 'MONTHLY FINANCIAL STATEMENT';
      periodLabel = `Month: ${formatted}`;
      dateStrForFile = `Monthly_${selectedMonth}`;
    } else if (reportPeriod === 'semi-annual') {
      periodTitle = 'SEMI-ANNUAL FINANCIAL STATEMENT';
      periodLabel = `Period: ${selectedHalf} ${selectedSemiYear}`;
      dateStrForFile = `Semi-Annual_${selectedHalf}_${selectedSemiYear}`;
    } else {
      periodTitle = 'ANNUAL FINANCIAL STATEMENT';
      periodLabel = `Year: ${selectedAnnualYear}`;
      dateStrForFile = `Annual_${selectedAnnualYear}`;
    }

    const rows = bankStatementData.statementRows;

    if (rows.length === 0) {
      alert(`No transactions found for the selected period.`);
      return;
    }

    setDownloadingReport(true);

    try {
      const doc = new jsPDF();
      
      // Outer Dark styling matching Sales.tsx but for financial statement
      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, 210, 297, 'F');
      
      // Header Section
      doc.setTextColor(255, 215, 0); // Gold
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('RETAILOS BANK STATEMENT', 15, 25);
      
      doc.setTextColor(200, 200, 200);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(periodTitle, 15, 33);
      doc.text(`Statement Period: ${periodLabel}`, 15, 39);
      
      // Metrics boxes/summary in PDF
      doc.setFillColor(30, 30, 30);
      doc.rect(15, 45, 180, 25, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('STATEMENT SUMMARY', 20, 51);
      
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Inflows (+):  $${bankStatementData.totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 20, 58);
      doc.text(`Total Outflows (-): $${bankStatementData.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 20, 64);
      
      const netPos = bankStatementData.netChange;
      if (netPos >= 0) {
        doc.setTextColor(16, 185, 129); // Green
      } else {
        doc.setTextColor(239, 68, 68); // Red
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`Net Position:      $${netPos.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 110, 58);
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Transactions: ${rows.length}`, 110, 64);

      // Create Statement Table rows
      const tableBody = rows.map(item => {
        const itemDate = new Date(item.created_at);
        const dateStr = itemDate.toLocaleDateString(undefined, { 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        let desc = '';
        if (item.transaction_type === 'sale') {
          desc = `Sale: ${item.inventory?.name || 'Item'} (x${item.quantity || 1})`;
        } else {
          desc = item.description || item.transaction_type.replace('_', ' ');
        }

        const categoryName = summaries.find(s => s.category_id === item.category_id)?.category_name || 'Unknown';
        const typeLabel = item.transaction_type.toUpperCase().replace('_', ' ');
        
        const inflowVal = item.isInflow ? `$${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-';
        const outflowVal = !item.isInflow ? `$${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-';

        return [
          dateStr,
          desc,
          typeLabel,
          categoryName,
          inflowVal,
          outflowVal
        ];
      });

      autoTable(doc, {
        startY: 75,
        head: [['Date/Time', 'Description', 'Type', 'Category/Source', 'Inflow (+)', 'Outflow (-)']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [24, 24, 27], textColor: [255, 215, 0] },
        bodyStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [22, 22, 24] },
        margin: { top: 75 }
      });

      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text('RetailOS Automated Financial Audit System - Confidential Bank Statement Format', 15, doc.internal.pageSize.height - 10);

      doc.save(`Financial_Statement_${dateStrForFile}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setError('Failed to generate Statement PDF.');
    } finally {
      setDownloadingReport(false);
    }
  };

  if (loading && summaries.length === 0) return <Loading />;

  const totalExpenses = outflows
    .filter(item => item.transaction_type === 'expense')
    .reduce((sum, item) => sum + (item.amount || 0), 0);

  const totalCapitalWithdrawals = outflows
    .filter(item => ['capital_withdrawal', 'CAPITAL_WITHDRAWAL'].includes(item.transaction_type || ''))
    .reduce((sum, item) => sum + (item.amount || 0), 0);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Financial Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="vault-card p-6 relative overflow-hidden group hover:gold-glow transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingDown size={64} className="text-[#FFD700]" />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-[#FFD700]/10 rounded-xl text-[#FFD700]">
              <TrendingDown size={18} />
            </div>
            <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Total Expenses</h3>
          </div>
          <p className="text-3xl font-black text-white group-hover:gold-text transition-colors">
            ${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest font-black">Accumulated operational outflows</p>
        </div>

        <div className="vault-card p-6 relative overflow-hidden group hover:gold-glow transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <DollarSign size={64} className="text-rose-500" />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-500/10 rounded-xl text-rose-500">
              <DollarSign size={18} />
            </div>
            <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Total Capital Withdrawal</h3>
          </div>
          <p className="text-3xl font-black text-rose-500">
            ${totalCapitalWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest font-black">Total decapitalizations from cash preserves</p>
        </div>
      </div>

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

      {/* Interactive Financial Statement Audit Card */}
      <div className="vault-card overflow-hidden">
        <div className="p-6 bg-[#050505] border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2 text-white uppercase tracking-tighter">
              <FileText size={20} className="text-[#FFD700]" />
              Periodic Ledger Statement
            </h2>
            <p className="text-[10px] text-slate-500 mt-1 uppercase font-black tracking-widest">Unified Bank Statement Format (Inflow & Outflow)</p>
          </div>
          
          {/* Period Selector Tabs */}
          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 md:w-80">
            {([
              { id: 'daily', label: 'Daily' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'semi-annual', label: 'Semi-Annual' },
              { id: 'annual', label: 'Annual' }
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setReportPeriod(tab.id)}
                className={cn(
                  "flex-1 py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-xl transition-all",
                  reportPeriod === tab.id
                    ? "bg-[#FFD700] text-[#0a0a0a] shadow-[0_0_15px_rgba(255,215,0,0.15)]"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Dynamic Controls & Audit Info */}
          <div className="lg:col-span-4 flex flex-col justify-center space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Select {reportPeriod === 'semi-annual' ? 'Half-Year Period' : reportPeriod === 'annual' ? 'Target Year' : reportPeriod === 'monthly' ? 'Target Month' : 'Target Date'}
              </label>
              
              {reportPeriod === 'daily' && (
                <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-white font-medium"
                />
              )}

              {reportPeriod === 'monthly' && (
                <input 
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-white font-medium animate-in fade-in duration-300"
                />
              )}

              {reportPeriod === 'semi-annual' && (
                <div className="flex gap-3 animate-in fade-in duration-300">
                  <select
                    value={selectedSemiYear}
                    onChange={(e) => setSelectedSemiYear(parseInt(e.target.value) || new Date().getFullYear())}
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-[#0a0a0a] font-medium"
                  >
                    {availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <select
                    value={selectedHalf}
                    onChange={(e) => setSelectedHalf(e.target.value as 'H1' | 'H2')}
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-[#0a0a0a] font-medium"
                  >
                    <option value="H1">H1 (Jan-Jun)</option>
                    <option value="H2">H2 (Jul-Dec)</option>
                  </select>
                </div>
              )}

              {reportPeriod === 'annual' && (
                <select
                  value={selectedAnnualYear}
                  onChange={(e) => setSelectedAnnualYear(parseInt(e.target.value) || new Date().getFullYear())}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-[#0a0a0a] font-medium animate-in fade-in duration-300"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              )}
            </div>
            
            <div className="pt-2 flex flex-col gap-3">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-relaxed">
                Matches <span className="text-white font-black">{bankStatementData.count}</span> ledger entries in timeframe.
              </p>
              <button 
                type="button"
                onClick={downloadBankStatementReport}
                disabled={bankStatementData.count === 0 || downloadingReport}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#FFD700] text-[#0a0a0a] font-black uppercase text-[10px] tracking-widest rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(255,215,0,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloadingReport ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                <span>Download Statement</span>
              </button>
            </div>
          </div>

          {/* Right Column: Statement Summary Metrics */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Total Inflows */}
            <div className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 blur-xl rounded-full" />
              <div className="relative z-10">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Inflows (Deposits)
                </span>
                <p className="text-2xl font-black text-emerald-400 tracking-tighter">
                  +${bankStatementData.totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[9px] text-slate-500 font-mono relative z-10">
                <span className="flex items-center gap-1"><ArrowUpRight size={10} className="text-emerald-400" /> CREDITS</span>
                <span>{bankStatementData.statementRows.filter(r => r.isInflow).length} Tx</span>
              </div>
            </div>

            {/* Total Outflows */}
            <div className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 blur-xl rounded-full" />
              <div className="relative z-10">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Outflows (Withdrawals)
                </span>
                <p className="text-2xl font-black text-rose-400 tracking-tighter">
                  -${bankStatementData.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[9px] text-slate-500 font-mono relative z-10">
                <span className="flex items-center gap-1"><ArrowDownLeft size={10} className="text-rose-400" /> DEBITS</span>
                <span>{bankStatementData.statementRows.filter(r => !r.isInflow).length} Tx</span>
              </div>
            </div>

            {/* Net Position */}
            <div className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 blur-xl rounded-full" />
              <div className="relative z-10">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Net Balance Position
                </span>
                <p className={cn(
                  "text-2xl font-black tracking-tighter",
                  bankStatementData.netChange >= 0 ? "text-white" : "text-rose-500"
                )}>
                  {bankStatementData.netChange >= 0 ? '+' : ''}${bankStatementData.netChange.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[9px] text-slate-500 font-mono relative z-10">
                <span>NET BALANCE CHANGE</span>
                <span className={cn(
                  "font-bold px-1.5 py-0.5 rounded text-[8px]",
                  bankStatementData.netChange >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                )}>
                  {bankStatementData.netChange >= 0 ? 'SURPLUS' : 'DEFICIT'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bank Statement Styled Ledger Records */}
        <div className="border-t border-white/5 bg-[#030303]/40">
          <div className="p-4 bg-white/5 border-b border-white/5 px-8 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Statement Ledger Entries ({bankStatementData.statementRows.length})
            </span>
            <span className="text-[9px] font-mono text-slate-600">CONFIDENTIAL BANK STATEMENT STANDARD</span>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-8 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Date/Time</th>
                  <th className="px-8 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Transaction details</th>
                  <th className="px-8 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                  <th className="px-8 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Category</th>
                  <th className="px-8 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Inflow (+)</th>
                  <th className="px-8 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Outflow (-)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {bankStatementData.statementRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-16 text-center text-slate-600">
                      <FileText size={32} className="mx-auto mb-2 text-slate-800" />
                      <span className="text-[10px] font-black uppercase tracking-widest block">No Ledger Entries For Selected Timeframe</span>
                    </td>
                  </tr>
                ) : (
                  bankStatementData.statementRows.map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-8 py-3.5">
                        <p className="text-xs font-black text-white uppercase tracking-tighter">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-[9px] text-slate-600 font-mono">
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                      <td className="px-8 py-3.5">
                        <p className="text-xs font-black text-white uppercase tracking-tight">
                          {entry.isInflow ? (
                            `Sale: ${entry.inventory?.name || 'Inventory Item'} (x${entry.quantity || 1})`
                          ) : (
                            entry.description || 'Outflow'
                          )}
                        </p>
                      </td>
                      <td className="px-8 py-3.5">
                        <span className={cn(
                          "text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border",
                          entry.isInflow 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : entry.transaction_type.toLowerCase().includes('capital') 
                              ? "bg-rose-500/10 text-rose-500 border-rose-500/20" 
                              : "bg-[#FFD700]/10 text-[#FFD700] border-[#FFD700]/20"
                        )}>
                          {entry.transaction_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-8 py-3.5">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-tighter">
                          {summaries.find(s => s.category_id === entry.category_id)?.category_name || 'General'}
                        </span>
                      </td>
                      <td className="px-8 py-3.5 text-right font-mono text-xs font-black text-emerald-400">
                        {entry.isInflow ? `+$${entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="px-8 py-3.5 text-right font-mono text-xs font-black text-rose-400">
                        {!entry.isInflow ? `-$${entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Entry Form */}
        <div className="vault-card overflow-hidden">
          <div className="p-6 bg-[#050505] border-b border-white/5">
            <h2 className="text-lg font-black flex items-center gap-2 text-white uppercase tracking-tighter">
              <ArrowDownCircle size={20} className="text-[#FFD700]" />
              Record Outflow
            </h2>
            <p className="text-[10px] text-slate-500 mt-1 uppercase font-black tracking-widest">Mission-Critical Financial Entry</p>
          </div>
          
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        {/* Outflow Archive */}
        <div className="space-y-6">
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
