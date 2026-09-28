import React, { useEffect, useState, useMemo } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
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
  Loader2,
  Download,
  Tag,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Sparkles,
  BarChart3
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Sales() {
  const [sales, setSales] = useState<LedgerEntry[]>([]);
  const [discounts, setDiscounts] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversingTransactionId, setReversingTransactionId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [downloadingDate, setDownloadingDate] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'monthly' | 'semi-annual' | 'annual' | 'all-time'>('daily');
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

  useEffect(() => {
    fetchSales();
  }, []);

  async function fetchSales() {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const [salesRes, discountsRes] = await Promise.all([
        supabase
          .from('ledger')
          .select('*')
          .eq('transaction_type', 'sale')
          .order('created_at', { ascending: false }),
        supabase
          .from('ledger')
          .select('*')
          .eq('transaction_type', 'expense')
          .ilike('description', '%discount%')
          .order('created_at', { ascending: false })
      ]);

      if (salesRes.error) throw salesRes.error;
      const ledgerData = salesRes.data || [];
      const discountData = discountsRes.data || [];
      setDiscounts(discountData);

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
    } catch (err: any) {
      console.error('Error fetching sales:', err);
      if (err.message === 'Failed to fetch') {
        setError('Database connection error. Please check your Supabase secrets and connectivity.');
      } else {
        setError(err.message || 'Failed to load sales archive.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleReverseTransaction(transactionSales: LedgerEntry[], discountEntryId?: string) {
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

          const newQuantity = (currentItem?.quantity || 0) + (safeNum(sale.quantity) || 1);
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

      // 3. Delete matching discount expense if it exists
      if (discountEntryId) {
        const { error: discDeleteError } = await supabase
          .from('ledger')
          .delete()
          .eq('id', discountEntryId);
        if (discDeleteError) console.warn('Could not delete discount entry:', discDeleteError);
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

  const safeNum = (val: any) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    sales.forEach(sale => {
      if (sale.created_at) {
        const y = new Date(sale.created_at).getFullYear();
        if (!isNaN(y)) {
          years.add(y);
        }
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [sales]);

  const discountMap = useMemo(() => {
    const map: Record<string, { id: string; amount: number; description: string }> = {};
    discounts.forEach(d => {
      const amt = safeNum(d.amount);
      if (d.created_at) {
        if (!map[d.created_at]) {
          map[d.created_at] = { id: d.id, amount: amt, description: d.description || '' };
        } else {
          map[d.created_at].amount += amt;
        }
      }
      const refMatch = d.description?.match(/Sale Ref:\s*([a-f0-9\-]+)/i);
      if (refMatch && refMatch[1]) {
        map[`ref_${refMatch[1]}`] = { id: d.id, amount: amt, description: d.description || '' };
      }
    });
    return map;
  }, [discounts]);

  // Complete unfiltered calculations across all sales and Inception-to-Date growth trajectory
  const allTimeMetrics = useMemo(() => {
    const txMap: Record<string, LedgerEntry[]> = {};
    sales.forEach(sale => {
      if (!sale.created_at) return;
      if (!txMap[sale.created_at]) txMap[sale.created_at] = [];
      txMap[sale.created_at].push(sale);
    });

    const allTransactions: {
      timestamp: string;
      items: LedgerEntry[];
      grossAmount: number;
      discountAmount: number;
      netAmount: number;
      cogs: number;
      profit: number;
    }[] = [];

    // Sort chronologically ascending (earliest to latest)
    const sortedTimestamps = Object.keys(txMap).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    let totalGross = 0;
    let totalDiscounts = 0;
    let totalNetRevenue = 0;
    let totalCogs = 0;
    let totalProfit = 0;

    sortedTimestamps.forEach(timestamp => {
      const items = txMap[timestamp];
      let saleRef: string | undefined;
      for (const item of items) {
        const match = item.description?.match(/Sale Ref:\s*([a-f0-9\-]+)/i);
        if (match && match[1]) {
          saleRef = match[1];
          break;
        }
      }

      const discountInfo = discountMap[timestamp] || (saleRef ? discountMap[`ref_${saleRef}`] : null);
      const discountAmount = discountInfo ? safeNum(discountInfo.amount) : 0;
      const grossAmount = items.reduce((sum, item) => sum + safeNum(item.amount), 0);
      const netAmount = Math.max(0, grossAmount - discountAmount);
      const cogs = items.reduce((sum, item) => sum + (safeNum(item.inventory?.cost_price) * (safeNum(item.quantity) || 1)), 0);
      const profit = netAmount - cogs;

      totalGross += grossAmount;
      totalDiscounts += discountAmount;
      totalNetRevenue += netAmount;
      totalCogs += cogs;
      totalProfit += profit;

      allTransactions.push({
        timestamp,
        items,
        grossAmount,
        discountAmount,
        netAmount,
        cogs,
        profit
      });
    });

    // Group chronologically by calendar day to determine where we started vs where we are
    const dayMap: Record<string, { date: string; revenue: number; profit: number; gross: number; count: number; rawDate: Date }> = {};
    allTransactions.forEach(tx => {
      const d = new Date(tx.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!dayMap[key]) {
        dayMap[key] = {
          date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          revenue: 0,
          profit: 0,
          gross: 0,
          count: 0,
          rawDate: d
        };
      }
      dayMap[key].revenue += tx.netAmount;
      dayMap[key].profit += tx.profit;
      dayMap[key].gross += tx.grossAmount;
      dayMap[key].count += 1;
    });

    const activeDaysChronological = Object.keys(dayMap)
      .sort()
      .map(k => dayMap[k]);

    let startPeriodLabel = 'Inception';
    let currentPeriodLabel = 'Current';
    let startRevenue = 0;
    let startProfit = 0;
    let currentRevenue = 0;
    let currentProfit = 0;
    let revenueGrowthPercent = 0;
    let profitGrowthPercent = 0;

    if (activeDaysChronological.length >= 2) {
      const firstDay = activeDaysChronological[0];
      const latestDay = activeDaysChronological[activeDaysChronological.length - 1];

      startPeriodLabel = firstDay.date;
      currentPeriodLabel = latestDay.date;
      startRevenue = firstDay.revenue;
      startProfit = firstDay.profit;
      currentRevenue = latestDay.revenue;
      currentProfit = latestDay.profit;

      if (startRevenue > 0) {
        revenueGrowthPercent = ((currentRevenue - startRevenue) / startRevenue) * 100;
      } else if (currentRevenue > 0) {
        revenueGrowthPercent = 100;
      }

      if (startProfit !== 0) {
        profitGrowthPercent = ((currentProfit - startProfit) / Math.abs(startProfit)) * 100;
      } else if (currentProfit > 0) {
        profitGrowthPercent = 100;
      }
    } else if (allTransactions.length >= 2) {
      // Transactions on single day, compare initial transaction to latest transaction
      const firstTx = allTransactions[0];
      const latestTx = allTransactions[allTransactions.length - 1];

      startPeriodLabel = `First Sale (${new Date(firstTx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      currentPeriodLabel = `Latest Sale (${new Date(latestTx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      startRevenue = firstTx.netAmount;
      startProfit = firstTx.profit;
      currentRevenue = latestTx.netAmount;
      currentProfit = latestTx.profit;

      if (startRevenue > 0) {
        revenueGrowthPercent = ((currentRevenue - startRevenue) / startRevenue) * 100;
      } else if (currentRevenue > 0) {
        revenueGrowthPercent = 100;
      }

      if (startProfit !== 0) {
        profitGrowthPercent = ((currentProfit - startProfit) / Math.abs(startProfit)) * 100;
      } else if (currentProfit > 0) {
        profitGrowthPercent = 100;
      }
    } else if (allTransactions.length === 1) {
      const singleTx = allTransactions[0];
      startPeriodLabel = 'First Sale';
      currentPeriodLabel = 'Baseline Record';
      startRevenue = singleTx.netAmount;
      startProfit = singleTx.profit;
      currentRevenue = singleTx.netAmount;
      currentProfit = singleTx.profit;
      revenueGrowthPercent = 0;
      profitGrowthPercent = 0;
    }

    const totalGrossProfit = totalGross - totalCogs;
    const grossMarginPercent = totalGross > 0 ? (totalGrossProfit / totalGross) * 100 : 0;

    return {
      totalProfit,
      totalGrossProfit,
      grossMarginPercent,
      totalNetRevenue,
      totalGross,
      totalDiscounts,
      totalCogs,
      totalTransactions: allTransactions.length,
      totalItems: sales.length,
      allTransactions,
      activeDaysCount: activeDaysChronological.length,
      startPeriodLabel,
      currentPeriodLabel,
      startRevenue,
      startProfit,
      currentRevenue,
      currentProfit,
      revenueGrowthPercent,
      profitGrowthPercent,
      txMap
    };
  }, [sales, discountMap]);

  // Periodic Audit Data computation including profit, revenue, and period growth
  const periodReportData = useMemo(() => {
    if (reportPeriod === 'all-time') {
      return {
        revenue: allTimeMetrics.totalNetRevenue,
        gross: allTimeMetrics.totalGross,
        cogs: allTimeMetrics.totalCogs,
        grossProfit: allTimeMetrics.totalGrossProfit,
        grossMarginPercent: allTimeMetrics.grossMarginPercent,
        profit: allTimeMetrics.totalProfit,
        discounts: allTimeMetrics.totalDiscounts,
        count: allTimeMetrics.totalTransactions,
        growth: allTimeMetrics.revenueGrowthPercent,
        profitGrowth: allTimeMetrics.profitGrowthPercent,
        hasPrior: allTimeMetrics.allTransactions.length > 1,
        priorLabel: `vs Start (${allTimeMetrics.startPeriodLabel})`,
        periodLabelShort: 'All-Time',
        matchedSales: sales
      };
    }

    const matchedTransactions = allTimeMetrics.allTransactions.filter(tx => {
      const saleDate = new Date(tx.timestamp);
      if (reportPeriod === 'daily') {
        const targetDate = new Date(selectedDate);
        return saleDate.getFullYear() === targetDate.getFullYear() &&
               saleDate.getMonth() === targetDate.getMonth() &&
               saleDate.getDate() === targetDate.getDate();
      }
      if (reportPeriod === 'monthly') {
        const [yearStr, monthStr] = selectedMonth.split('-');
        const targetYear = parseInt(yearStr) || new Date().getFullYear();
        const targetMonth = (parseInt(monthStr) || 1) - 1;
        return saleDate.getFullYear() === targetYear &&
               saleDate.getMonth() === targetMonth;
      }
      if (reportPeriod === 'semi-annual') {
        const isYearMatch = saleDate.getFullYear() === selectedSemiYear;
        const isHalfMatch = selectedHalf === 'H1' 
          ? saleDate.getMonth() < 6 
          : saleDate.getMonth() >= 6;
        return isYearMatch && isHalfMatch;
      }
      if (reportPeriod === 'annual') {
        return saleDate.getFullYear() === selectedAnnualYear;
      }
      return true;
    });

    const revenue = matchedTransactions.reduce((acc, t) => acc + t.netAmount, 0);
    const gross = matchedTransactions.reduce((acc, t) => acc + t.grossAmount, 0);
    const cogs = matchedTransactions.reduce((acc, t) => acc + t.cogs, 0);
    const grossProfit = gross - cogs;
    const grossMarginPercent = gross > 0 ? (grossProfit / gross) * 100 : 0;
    const profit = matchedTransactions.reduce((acc, t) => acc + t.profit, 0);
    const totalDiscounts = matchedTransactions.reduce((acc, t) => acc + t.discountAmount, 0);
    const matchedSales = matchedTransactions.flatMap(t => t.items);

    // Compute prior period for growth calculation
    let priorRevenue = 0;
    let priorProfit = 0;
    let hasPrior = false;
    let priorLabel = 'vs Prior';
    let periodLabelShort = 'Selected';

    if (reportPeriod === 'daily') {
      periodLabelShort = 'Day';
      const targetDate = new Date(selectedDate);
      const priorDate = new Date(targetDate);
      priorDate.setDate(priorDate.getDate() - 1);
      const priorDateStr = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, '0')}-${String(priorDate.getDate()).padStart(2, '0')}`;
      priorLabel = 'vs Prior Day';

      const priorTxs = allTimeMetrics.allTransactions.filter(tx => {
        const d = new Date(tx.timestamp);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return k === priorDateStr;
      });

      if (priorTxs.length > 0) {
        hasPrior = true;
        priorRevenue = priorTxs.reduce((s, t) => s + t.netAmount, 0);
        priorProfit = priorTxs.reduce((s, t) => s + t.profit, 0);
      } else {
        // If direct calendar prior day has no sales, check preceding active sales day in archive
        const earlierTxs = allTimeMetrics.allTransactions.filter(tx => {
          const d = new Date(tx.timestamp);
          return d.getFullYear() < targetDate.getFullYear() ||
            (d.getFullYear() === targetDate.getFullYear() && d.getMonth() < targetDate.getMonth()) ||
            (d.getFullYear() === targetDate.getFullYear() && d.getMonth() === targetDate.getMonth() && d.getDate() < targetDate.getDate());
        });

        if (earlierTxs.length > 0) {
          const lastEarlier = earlierTxs[earlierTxs.length - 1];
          const prevDate = new Date(lastEarlier.timestamp);
          const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
          priorLabel = `vs Prev (${prevDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`;
          const prevDayTxs = earlierTxs.filter(tx => {
            const d = new Date(tx.timestamp);
            const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return k === prevKey;
          });
          hasPrior = true;
          priorRevenue = prevDayTxs.reduce((s, t) => s + t.netAmount, 0);
          priorProfit = prevDayTxs.reduce((s, t) => s + t.profit, 0);
        }
      }
    } else if (reportPeriod === 'monthly') {
      periodLabelShort = 'Month';
      priorLabel = 'vs Prior Month';
      const [yearStr, monthStr] = selectedMonth.split('-');
      const y = parseInt(yearStr) || new Date().getFullYear();
      const m = parseInt(monthStr) || 1;
      const priorY = m === 1 ? y - 1 : y;
      const priorM = m === 1 ? 12 : m - 1;

      const priorTxs = allTimeMetrics.allTransactions.filter(tx => {
        const d = new Date(tx.timestamp);
        return d.getFullYear() === priorY && d.getMonth() === priorM - 1;
      });
      if (priorTxs.length > 0) {
        hasPrior = true;
        priorRevenue = priorTxs.reduce((s, t) => s + t.netAmount, 0);
        priorProfit = priorTxs.reduce((s, t) => s + t.profit, 0);
      }
    } else if (reportPeriod === 'semi-annual') {
      periodLabelShort = selectedHalf;
      priorLabel = 'vs Prior Half';
      const priorSemiYear = selectedHalf === 'H1' ? selectedSemiYear - 1 : selectedSemiYear;
      const priorHalf = selectedHalf === 'H1' ? 'H2' : 'H1';

      const priorTxs = allTimeMetrics.allTransactions.filter(tx => {
        const d = new Date(tx.timestamp);
        const isYear = d.getFullYear() === priorSemiYear;
        const isHalf = priorHalf === 'H1' ? d.getMonth() < 6 : d.getMonth() >= 6;
        return isYear && isHalf;
      });
      if (priorTxs.length > 0) {
        hasPrior = true;
        priorRevenue = priorTxs.reduce((s, t) => s + t.netAmount, 0);
        priorProfit = priorTxs.reduce((s, t) => s + t.profit, 0);
      }
    } else {
      periodLabelShort = `${selectedAnnualYear}`;
      priorLabel = 'vs Prior Year';
      const priorYear = selectedAnnualYear - 1;

      const priorTxs = allTimeMetrics.allTransactions.filter(tx => {
        const d = new Date(tx.timestamp);
        return d.getFullYear() === priorYear;
      });
      if (priorTxs.length > 0) {
        hasPrior = true;
        priorRevenue = priorTxs.reduce((s, t) => s + t.netAmount, 0);
        priorProfit = priorTxs.reduce((s, t) => s + t.profit, 0);
      }
    }

    let growth = 0;
    let profitGrowth = 0;

    if (hasPrior && priorRevenue > 0) {
      growth = ((revenue - priorRevenue) / priorRevenue) * 100;
    } else if (hasPrior && revenue > 0) {
      growth = 100;
    }

    if (hasPrior && priorProfit !== 0) {
      profitGrowth = ((profit - priorProfit) / Math.abs(priorProfit)) * 100;
    } else if (hasPrior && profit > 0) {
      profitGrowth = 100;
    }

    return {
      revenue,
      gross,
      cogs,
      grossProfit,
      grossMarginPercent,
      profit,
      discounts: totalDiscounts,
      count: matchedTransactions.length,
      growth,
      profitGrowth,
      hasPrior,
      priorRevenue,
      priorProfit,
      priorLabel,
      periodLabelShort,
      matchedSales
    };
  }, [sales, allTimeMetrics, reportPeriod, selectedDate, selectedMonth, selectedSemiYear, selectedHalf, selectedAnnualYear]);

  const downloadDayReport = (dateStr: string, transactions: any[]) => {
    setDownloadingDate(dateStr);
    try {
      const doc = new jsPDF();
      
      // Theme matching the app's dark aesthetic but readable on PDF
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, 210, 297, 'F');
      
      doc.setTextColor(255, 215, 0); // Gold
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('RETAILOS DAILY SALES REPORT', 15, 25);
      
      doc.setTextColor(200, 200, 200);
      doc.setFontSize(12);
      doc.text(`Report Period: ${dateStr}`, 15, 35);
      
      const dayGross = transactions.reduce((acc, t) => acc + (t.grossAmount !== undefined ? t.grossAmount : t.items.reduce((s: number, i: any) => s + safeNum(i.amount), 0)), 0);
      const dayCogs = transactions.reduce((acc, t) => acc + (t.cogs !== undefined ? t.cogs : t.items.reduce((s: number, i: any) => s + (safeNum(i.inventory?.cost_price) * (safeNum(i.quantity) || 1)), 0)), 0);
      const dayGrossProfit = dayGross - dayCogs;
      const dayRevenue = transactions.reduce((acc, t) => acc + (t.netAmount !== undefined ? t.netAmount : t.items.reduce((s: number, i: any) => s + safeNum(i.amount), 0)), 0);
      const dayProfit = transactions.reduce((acc, t) => acc + (t.profit !== undefined ? t.profit : 0), 0);
      const dayDiscounts = transactions.reduce((acc, t) => acc + (t.discountAmount || 0), 0);

      // Check for day-over-day growth against earlier active days in archive
      let dayGrowthText = '';
      if (allTimeMetrics.activeDaysCount > 1) {
        const otherDayTxs = allTimeMetrics.allTransactions.filter(t => 
          new Date(t.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) !== dateStr
        );
        if (otherDayTxs.length > 0) {
          const prevDayDateStr = new Date(otherDayTxs[otherDayTxs.length - 1].timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
          const prevDayTxs = otherDayTxs.filter(t =>
            new Date(t.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) === prevDayDateStr
          );
          const prevDayRev = prevDayTxs.reduce((s, t) => s + t.netAmount, 0);
          if (prevDayRev > 0) {
            const g = ((dayRevenue - prevDayRev) / prevDayRev) * 100;
            dayGrowthText = `Day Growth vs Previous Day (${prevDayDateStr}): ${g >= 0 ? '+' : ''}${g.toFixed(1)}%`;
          }
        }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`Daily Revenue (Net): $${dayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 15, 45);
      doc.text(`Daily Gross Profit: $${dayGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} (COGS: $${dayCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })})`, 15, 52);
      let curY = 59;
      if (dayDiscounts > 0) {
        doc.text(`Total Discounts Applied: -$${dayDiscounts.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 15, curY);
        curY += 7;
      }
      doc.text(`Daily Net Profit: $${dayProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 15, curY);
      curY += 7;
      if (dayGrowthText) {
        doc.text(dayGrowthText, 15, curY);
        curY += 7;
      }
      doc.text(`Transaction Count: ${transactions.length}`, 15, curY);
      curY += 7;

      const tableBody = transactions.flatMap(t => 
        t.items.map((item: LedgerEntry) => [
          new Date(t.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
          item.inventory?.name || item.description || 'Unknown',
          item.quantity || 1,
          `$${safeNum(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          `$${(safeNum(item.amount) - (safeNum(item.inventory?.cost_price) * (safeNum(item.quantity) || 1))).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          item.fund_source || 'Unknown'
        ])
      );

      autoTable(doc, {
        startY: curY + 2,
        head: [['Time', 'Product', 'Qty', 'Amount', 'Profit', 'Source']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 215, 0] },
        bodyStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [25, 25, 25] },
        margin: { top: curY + 2 }
      });

      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text('Verified Archive Ledger - RetailOS Financial Engine', 15, doc.internal.pageSize.height - 10);

      doc.save(`Sales_Report_${dateStr.replace(/ /g, '_')}.pdf`);
    } catch (err) {
      console.error('PDF Error:', err);
      setError('Failed to generate PDF report.');
    } finally {
      setDownloadingDate(null);
    }
  };

  const downloadCurrentPeriodReport = () => {
    let periodTitle = '';
    let periodLabel = '';
    let dateStrForFile = '';

    if (reportPeriod === 'all-time') {
      periodTitle = 'RETAILOS ALL-TIME SALES & FINANCIAL AUDIT REPORT';
      periodLabel = `All-Time Inception to Date (${allTimeMetrics.startPeriodLabel} to ${allTimeMetrics.currentPeriodLabel})`;
      dateStrForFile = 'All_Time_Profit_Revenue_Growth_Audit';
    } else if (reportPeriod === 'daily') {
      const targetDate = new Date(selectedDate);
      const formatted = targetDate.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      periodTitle = 'RETAILOS DAILY SALES REPORT';
      periodLabel = `Selected Day: ${formatted}`;
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
      periodTitle = 'RETAILOS MONTHLY SALES REPORT';
      periodLabel = `Selected Month: ${formatted}`;
      dateStrForFile = `Monthly_${selectedMonth}`;
    } else if (reportPeriod === 'semi-annual') {
      periodTitle = 'RETAILOS SEMI-ANNUAL SALES REPORT';
      periodLabel = `Selected Half: ${selectedHalf} ${selectedSemiYear}`;
      dateStrForFile = `Semi-Annual_${selectedHalf}_${selectedSemiYear}`;
    } else {
      periodTitle = 'RETAILOS ANNUAL SALES REPORT';
      periodLabel = `Selected Year: ${selectedAnnualYear}`;
      dateStrForFile = `Annual_${selectedAnnualYear}`;
    }

    const matchedSales = periodReportData.matchedSales || [];

    if (matchedSales.length === 0) {
      alert(`No sales found for the selected period.`);
      return;
    }

    setDownloadingDate(dateStrForFile);

    try {
      const doc = new jsPDF();
      
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, 210, 297, 'F');
      
      doc.setTextColor(255, 215, 0); // Gold
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(periodTitle, 15, 25);
      
      doc.setTextColor(200, 200, 200);
      doc.setFontSize(12);
      doc.text(`Report Period: ${periodLabel}`, 15, 35);
      
      const totalRev = periodReportData.revenue;
      const totalGross = periodReportData.gross;
      const totalCogs = periodReportData.cogs;
      const grossProf = periodReportData.grossProfit;
      const totalProf = periodReportData.profit;
      const totalDiscounts = periodReportData.discounts || 0;
      const growthVal = periodReportData.growth;
      const profitGrowthVal = periodReportData.profitGrowth;

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`Total Revenue (Net): $${totalRev.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Gross: $${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })})`, 15, 45);
      doc.text(`Gross Profit: $${grossProf.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Margin: ${periodReportData.grossMarginPercent.toFixed(1)}% | COGS: $${totalCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })})`, 15, 52);
      let curY = 59;
      if (totalDiscounts > 0) {
        doc.text(`Total Discounts Applied: -$${totalDiscounts.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 15, curY);
        curY += 7;
      }
      doc.text(`Total Net Profit: $${totalProf.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 15, curY);
      curY += 7;
      doc.text(`Period Growth (${periodReportData.priorLabel}): ${growthVal >= 0 ? '+' : ''}${growthVal.toFixed(1)}% (Profit Growth: ${profitGrowthVal >= 0 ? '+' : ''}${profitGrowthVal.toFixed(1)}%)`, 15, curY);
      curY += 7;
      doc.text(`Transaction Count: ${periodReportData.count} (${matchedSales.length} items recorded)`, 15, curY);
      curY += 7;

      const tableBody = matchedSales.map((item: LedgerEntry) => {
        const itemDate = new Date(item.created_at);
        const dateStr = itemDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return [
          dateStr,
          item.inventory?.name || item.description || 'Unknown',
          item.quantity || 1,
          `$${safeNum(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          `$${(safeNum(item.amount) - (safeNum(item.inventory?.cost_price) * (safeNum(item.quantity) || 1))).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          item.fund_source || 'Unknown'
        ];
      });

      autoTable(doc, {
        startY: curY + 2,
        head: [['Date/Time', 'Product', 'Qty', 'Amount', 'Profit', 'Source']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 215, 0] },
        bodyStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [25, 25, 25] },
        margin: { top: curY + 2 }
      });

      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text('Verified Archive Ledger - RetailOS Financial Engine', 15, doc.internal.pageSize.height - 10);

      doc.save(`Sales_Report_${dateStrForFile.replace(/ /g, '_')}.pdf`);
    } catch (err) {
      console.error('PDF Error:', err);
      setError('Failed to generate PDF report.');
    } finally {
      setDownloadingDate(null);
    }
  };

  const filteredSales = sales.filter(sale => 
    (sale.inventory?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (sale.fund_source || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Grouping logic
  const groupedSales = useMemo(() => {
    const groups: { 
      date: string; 
      revenue: number; 
      profit: number;
      discounts: number;
      transactions: { 
        timestamp: string; 
        items: LedgerEntry[];
        grossAmount: number;
        discountAmount: number;
        netAmount: number;
        profit: number;
        discountEntryId?: string;
      }[]; 
    }[] = [];
    
    // Sort sales by date descending
    const sortedSales = [...filteredSales].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const txMap: Record<string, LedgerEntry[]> = {};
    sortedSales.forEach(sale => {
      const ts = sale.created_at;
      if (!txMap[ts]) {
        txMap[ts] = [];
      }
      txMap[ts].push(sale);
    });

    Object.entries(txMap).forEach(([timestamp, items]) => {
      const dateStr = new Date(timestamp).toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      let dateGroup = groups.find(g => g.date === dateStr);
      if (!dateGroup) {
        dateGroup = { date: dateStr, revenue: 0, profit: 0, discounts: 0, transactions: [] };
        groups.push(dateGroup);
      }

      let saleRef: string | undefined;
      for (const item of items) {
        const match = item.description?.match(/Sale Ref:\s*([a-f0-9\-]+)/i);
        if (match && match[1]) {
          saleRef = match[1];
          break;
        }
      }

      const discountInfo = discountMap[timestamp] || (saleRef ? discountMap[`ref_${saleRef}`] : null);
      const discountAmount = discountInfo ? safeNum(discountInfo.amount) : 0;
      const discountEntryId = discountInfo?.id;

      const grossAmount = items.reduce((sum, item) => sum + safeNum(item.amount), 0);
      const netAmount = Math.max(0, grossAmount - discountAmount);
      const cogs = items.reduce((sum, item) => sum + (safeNum(item.inventory?.cost_price) * (safeNum(item.quantity) || 1)), 0);
      const txProfit = netAmount - cogs;

      dateGroup.revenue += netAmount;
      dateGroup.profit += txProfit;
      dateGroup.discounts += discountAmount;

      dateGroup.transactions.push({
        timestamp,
        items,
        grossAmount,
        discountAmount,
        netAmount,
        profit: txProfit,
        discountEntryId
      });
    });

    return groups;
  }, [filteredSales, discountMap]);

  const totalProfit = useMemo(() => {
    return groupedSales.reduce((sum, g) => sum + g.profit, 0);
  }, [groupedSales]);

  const totalNetRevenue = useMemo(() => {
    return groupedSales.reduce((sum, g) => sum + g.revenue, 0);
  }, [groupedSales]);

  const totalTransactionCount = useMemo(() => {
    return groupedSales.reduce((sum, g) => sum + g.transactions.length, 0);
  }, [groupedSales]);

  if (loading && sales.length === 0) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      {/* Top KPI Cards: Gross Profit, Net Realized Profit & Growth Trajectory */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full" style={{ boxSizing: 'border-box' }}>
        {/* Gross Profit Card - Pre-discount profit on inventory cost */}
        <div className="bg-[#0a0a0a] border-2 border-cyan-500/40 rounded-3xl p-8 shadow-[0_0_25px_rgba(6,182,212,0.12)] relative overflow-hidden group transition-all duration-500 hover:shadow-[0_0_35px_rgba(6,182,212,0.22)] flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 blur-[80px] rounded-full -mr-16 -mt-16 animate-pulse" />
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                  <BarChart3 size={22} />
                </div>
                <div>
                  <p className="text-cyan-400 text-xs font-black uppercase tracking-[0.2em]">Gross Profit</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Revenue minus Cost of Goods</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full">
                Pre-Discount
              </span>
            </div>

            <h2 className="text-4xl sm:text-5xl font-black mt-4 text-cyan-300 tracking-tighter">
              ${allTimeMetrics.totalGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>

            <div className="mt-4 grid grid-cols-3 gap-2 py-3 px-4 bg-white/5 rounded-2xl border border-white/5 text-xs font-mono">
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans font-bold block">Gross Sales</span>
                <span className="text-slate-300 font-bold">${allTimeMetrics.totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans font-bold block">COGS</span>
                <span className="text-rose-400 font-bold">-${allTimeMetrics.totalCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans font-bold block">Gross Margin</span>
                <span className="text-cyan-400 font-bold">
                  {allTimeMetrics.grossMarginPercent.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Direct gross margin across all {allTimeMetrics.totalTransactions} sales
              </p>
            </div>
          </div>
        </div>

        {/* Total Net Realized Profit Card - Sum of profits obtained in all sales (Unfiltered) */}
        <div className="bg-[#0a0a0a] border-2 border-[#FFD700] rounded-3xl p-8 shadow-[0_0_25px_rgba(255,215,0,0.15)] relative overflow-hidden group transition-all duration-500 hover:shadow-[0_0_35px_rgba(255,215,0,0.25)] flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#FFD700]/10 blur-[80px] rounded-full -mr-16 -mt-16 animate-pulse" />
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#FFD700]/10 rounded-xl border border-[#FFD700]/20">
                  <DollarSign size={22} className="text-[#FFD700]" />
                </div>
                <div>
                  <p className="text-[#FFD700] text-xs font-black uppercase tracking-[0.2em]">Net Realized Profit</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">All-Time Cumulative • Unfiltered</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#FFD700] bg-[#FFD700]/10 border border-[#FFD700]/20 px-3 py-1 rounded-full">
                Unfiltered
              </span>
            </div>
            
            <h2 className="text-4xl sm:text-5xl font-black mt-4 text-white tracking-tighter">
              ${allTimeMetrics.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>

            <div className="mt-4 grid grid-cols-3 gap-2 py-3 px-4 bg-white/5 rounded-2xl border border-white/5 text-xs font-mono">
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans font-bold block">Gross Profit</span>
                <span className="text-cyan-400 font-bold">${allTimeMetrics.totalGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans font-bold block">Discounts</span>
                <span className="text-emerald-400 font-bold">-${allTimeMetrics.totalDiscounts.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans font-bold block">Net Margin</span>
                <span className="text-[#FFD700] font-bold">
                  {allTimeMetrics.totalNetRevenue > 0 
                    ? `${((allTimeMetrics.totalProfit / allTimeMetrics.totalNetRevenue) * 100).toFixed(1)}%` 
                    : '0.0%'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <div className="h-1.5 w-1.5 rounded-full bg-[#FFD700] animate-ping" />
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Sum across all {allTimeMetrics.totalTransactions} transactions ({allTimeMetrics.totalItems} items sold)
              </p>
            </div>
          </div>
        </div>

        {/* Growth Card - From Where We Started to Where We Are by Percentage */}
        <div className="bg-[#0a0a0a] border-2 border-emerald-500/40 rounded-3xl p-8 shadow-[0_0_25px_rgba(16,185,129,0.12)] relative overflow-hidden group transition-all duration-500 hover:shadow-[0_0_35px_rgba(16,185,129,0.22)] flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 blur-[80px] rounded-full -mr-16 -mt-16 animate-pulse" />
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  {allTimeMetrics.revenueGrowthPercent >= 0 ? (
                    <TrendingUp size={22} className="text-emerald-400" />
                  ) : (
                    <TrendingDown size={22} className="text-rose-400" />
                  )}
                </div>
                <div>
                  <p className="text-emerald-400 text-xs font-black uppercase tracking-[0.2em]">Business Growth</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Inception to Current Trajectory</p>
                </div>
              </div>
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border flex items-center gap-1",
                allTimeMetrics.revenueGrowthPercent >= 0 
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                  : "text-rose-400 bg-rose-500/10 border-rose-500/20"
              )}>
                {allTimeMetrics.revenueGrowthPercent >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {allTimeMetrics.revenueGrowthPercent >= 0 ? 'Expanding' : 'Contracting'}
              </span>
            </div>

            <div className="flex items-baseline gap-3 mt-4">
              <h2 className={cn(
                "text-4xl sm:text-5xl font-black tracking-tighter",
                allTimeMetrics.revenueGrowthPercent >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {allTimeMetrics.revenueGrowthPercent >= 0 ? '+' : ''}{allTimeMetrics.revenueGrowthPercent.toFixed(1)}%
              </h2>
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
                Revenue Growth
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 py-3 px-4 bg-white/5 rounded-2xl border border-white/5 text-xs">
              <div className="border-r border-white/10 pr-2">
                <span className="text-[9px] text-slate-500 uppercase font-sans font-bold block mb-1">
                  Where We Started ({allTimeMetrics.startPeriodLabel})
                </span>
                <p className="text-slate-200 font-mono font-bold">
                  ${allTimeMetrics.startRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-slate-500 font-mono">Profit: ${allTimeMetrics.startProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="pl-2">
                <span className="text-[9px] text-slate-500 uppercase font-sans font-bold block mb-1">
                  Where We Are ({allTimeMetrics.currentPeriodLabel})
                </span>
                <p className="text-[#FFD700] font-mono font-bold">
                  ${allTimeMetrics.currentRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-blue-400 font-mono">Profit: ${allTimeMetrics.currentProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span className="flex items-center gap-1.5">
                <div className={cn("h-1.5 w-1.5 rounded-full", allTimeMetrics.profitGrowthPercent >= 0 ? "bg-emerald-400" : "bg-rose-400")} />
                Net Profit Growth: <span className={cn(allTimeMetrics.profitGrowthPercent >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {allTimeMetrics.profitGrowthPercent >= 0 ? '+' : ''}{allTimeMetrics.profitGrowthPercent.toFixed(1)}%
                </span>
              </span>
              <span className="text-slate-500 font-mono font-normal">
                {allTimeMetrics.activeDaysCount > 1 ? `${allTimeMetrics.activeDaysCount} Active Days` : 'Inception Baseline'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Periodic Audit Card */}
      <div className="vault-card overflow-hidden">
        <div className="p-6 bg-[#050505] border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2 text-white uppercase tracking-tighter">
              <Calendar size={20} className="text-[#FFD700]" />
              Periodic Sales Report
            </h2>
            <p className="text-[10px] text-slate-500 mt-1 uppercase font-black tracking-widest">Interactive Audit & Analysis</p>
          </div>
          
          {/* Period Selector Tabs */}
          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 md:w-96 flex-wrap">
            {([
              { id: 'daily', label: 'Daily' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'semi-annual', label: 'Semi-Annual' },
              { id: 'annual', label: 'Annual' },
              { id: 'all-time', label: 'All-Time' }
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setReportPeriod(tab.id)}
                className={cn(
                  "flex-1 min-w-[60px] py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-xl transition-all",
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
          {/* Left Column: Dynamic Controls */}
          <div className="lg:col-span-4 flex flex-col justify-center space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {reportPeriod === 'all-time' ? 'All-Time Archive Audit' : `Select ${reportPeriod === 'semi-annual' ? 'Half-Year Period' : reportPeriod === 'annual' ? 'Target Year' : reportPeriod === 'monthly' ? 'Target Month' : 'Target Date'}`}
              </label>
              
              {reportPeriod === 'all-time' && (
                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2 animate-in fade-in duration-300">
                  <p className="text-xs font-black text-[#FFD700] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} /> Full Inception Audit
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                    Auditing all {allTimeMetrics.totalTransactions} recorded transactions across entire archive history with full revenue, profit, discounts, and growth trajectory.
                  </p>
                </div>
              )}

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
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-white font-medium"
                  >
                    {availableYears.map(year => (
                      <option key={year} value={year} className="bg-[#0a0a0a] text-white">{year}</option>
                    ))}
                  </select>
                  <select
                    value={selectedHalf}
                    onChange={(e) => setSelectedHalf(e.target.value as 'H1' | 'H2')}
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-white font-medium"
                  >
                    <option value="H1" className="bg-[#0a0a0a] text-white">H1 (Jan-Jun)</option>
                    <option value="H2" className="bg-[#0a0a0a] text-white">H2 (Jul-Dec)</option>
                  </select>
                </div>
              )}

              {reportPeriod === 'annual' && (
                <select
                  value={selectedAnnualYear}
                  onChange={(e) => setSelectedAnnualYear(parseInt(e.target.value) || new Date().getFullYear())}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-white font-medium animate-in fade-in duration-300"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year} className="bg-[#0a0a0a] text-white">{year}</option>
                  ))}
                </select>
              )}
            </div>
            
            <div className="pt-2 flex flex-col gap-3">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-relaxed">
                Matches <span className="text-white font-black">{periodReportData.count}</span> sales recorded in archive.
              </p>
              <button 
                onClick={downloadCurrentPeriodReport}
                disabled={periodReportData.count === 0 || downloadingDate !== null}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#FFD700] text-[#0a0a0a] font-black uppercase text-[10px] tracking-widest rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(255,215,0,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloadingDate !== null ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                <span>Download {reportPeriod === 'daily' ? 'Daily' : reportPeriod === 'monthly' ? 'Monthly' : reportPeriod === 'semi-annual' ? 'Semi-Annual' : reportPeriod === 'annual' ? 'Annual' : 'All-Time Financial'} Report</span>
              </button>
            </div>
          </div>

          {/* Right Column: Display Metrics - Revenue, Gross Profit, Net Profit, AND Growth */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Revenue card */}
            <div className="p-5 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between group/metric relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFD700]/5 blur-2xl rounded-full" />
              <div className="relative z-10">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Revenue ({periodReportData.periodLabelShort})
                </span>
                <p className="text-xl sm:text-2xl font-black text-[#FFD700] tracking-tighter">
                  ${periodReportData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[9px] text-slate-600 font-mono relative z-10">
                <span>NET REVENUE</span>
                <span className="text-slate-500 font-bold">{periodReportData.count} SALES</span>
              </div>
            </div>

            {/* Gross Profit card */}
            <div className="p-5 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between group/metric relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-2xl rounded-full" />
              <div className="relative z-10">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Gross Profit ({periodReportData.periodLabelShort})
                </span>
                <p className="text-xl sm:text-2xl font-black text-cyan-300 tracking-tighter">
                  ${periodReportData.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[9px] text-slate-600 font-mono relative z-10">
                <span>GROSS MARGIN</span>
                <span className="font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                  {periodReportData.grossMarginPercent.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Net Profit card */}
            <div className="p-5 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between group/metric relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-2xl rounded-full" />
              <div className="relative z-10">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Net Profit ({periodReportData.periodLabelShort})
                </span>
                <p className="text-xl sm:text-2xl font-black text-blue-400 tracking-tighter">
                  ${periodReportData.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[9px] text-slate-600 font-mono relative z-10">
                <span>NET MARGIN</span>
                <span className={cn("font-bold px-1.5 py-0.5 rounded", periodReportData.profit >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10")}>
                  {periodReportData.revenue > 0 
                    ? `${((periodReportData.profit / periodReportData.revenue) * 100).toFixed(1)}%` 
                    : '0.0%'}
                </span>
              </div>
            </div>

            {/* Period Growth card */}
            <div className="p-5 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between group/metric relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full" />
              <div className="relative z-10">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Growth ({periodReportData.priorLabel})
                </span>
                <p className={cn(
                  "text-xl sm:text-2xl font-black tracking-tighter",
                  periodReportData.growth >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {periodReportData.growth >= 0 ? '+' : ''}{periodReportData.growth.toFixed(1)}%
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[9px] font-mono relative z-10">
                <span className="text-slate-500 uppercase">Profit Growth</span>
                <span className={cn("font-bold", periodReportData.profitGrowth >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {periodReportData.profitGrowth >= 0 ? '+' : ''}{periodReportData.profitGrowth.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#050505] border border-white/5 rounded-3xl p-8 flex items-center justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD700]/5 blur-[60px] rounded-full" />
          <div className="relative z-10">
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">
              {searchTerm ? 'Filtered Sales Revenue (Net)' : 'Total Sales Revenue (Net)'}
            </p>
            <h2 className="text-4xl font-black mt-2 text-white group-hover:gold-text transition-all">
              ${totalNetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h2>
            <p className="text-[10px] text-slate-600 mt-2 font-mono uppercase tracking-tighter">
              {searchTerm ? `Filtered by "${searchTerm}"` : `All-Time Archive Net: $${allTimeMetrics.totalNetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            </p>
          </div>
          <DollarSign size={48} className="text-slate-800 group-hover:text-[#FFD700]/20 transition-colors" />
        </div>
        <div className="vault-card p-8 flex items-center justify-between group">
          <div>
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">
              {searchTerm ? 'Filtered Transactions' : 'Transaction Count'}
            </p>
            <h2 className="text-4xl font-black mt-2 text-white group-hover:gold-text transition-all">
              {totalTransactionCount}
            </h2>
            <p className="text-[10px] text-slate-600 mt-2 font-mono uppercase tracking-tighter">
              {searchTerm ? `${filteredSales.length} items shown (${sales.length} total)` : `${sales.length} items archived`}
            </p>
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-[#050505] p-6 rounded-[2rem] border border-white/5">
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

        <div className="flex items-center gap-3 bg-white/5 p-2 rounded-[1.5rem] border border-white/10">
          <div className="flex items-center gap-2 pl-3">
            <Calendar size={16} className="text-slate-500" />
            <span className="text-white text-xs font-black uppercase tracking-wider">
              {reportPeriod === 'daily' && `Daily: ${selectedDate}`}
              {reportPeriod === 'monthly' && `Monthly: ${selectedMonth}`}
              {reportPeriod === 'semi-annual' && `Semi-Annual: ${selectedHalf} ${selectedSemiYear}`}
              {reportPeriod === 'annual' && `Annual: ${selectedAnnualYear}`}
            </span>
          </div>
          <button 
            onClick={downloadCurrentPeriodReport}
            disabled={periodReportData.count === 0 || downloadingDate !== null}
            className="px-6 py-2.5 bg-[#FFD700] text-[#0a0a0a] font-black uppercase text-[10px] tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50"
          >
            Download Report
          </button>
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
            <div key={dateGroup.date} className="space-y-6">
              {/* Date Header with Daily Totals and Report Download */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-6 bg-[#050505] border border-white/5 rounded-[2rem] shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-[#FFD700] border border-white/10 shadow-lg">
                    <Calendar size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tighter">{dateGroup.date}</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">{dateGroup.transactions.length} Transactions Reconciled</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right px-6 border-r border-white/10 hidden sm:block">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      {dateGroup.discounts > 0 ? 'Daily Revenue (Net)' : 'Daily Revenue'}
                    </p>
                    <p className="text-xl font-black text-[#FFD700]">${dateGroup.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="text-right px-6 border-r border-white/10 hidden sm:block">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Daily Profit</p>
                    <p className="text-xl font-black text-blue-400">${dateGroup.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <button 
                    onClick={() => downloadDayReport(dateGroup.date, dateGroup.transactions)}
                    disabled={downloadingDate === dateGroup.date}
                    className="flex-shrink-0 flex items-center gap-2 px-6 py-3 bg-[#FFD700] text-[#0a0a0a] font-black uppercase text-[10px] tracking-widest rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)] disabled:opacity-50"
                  >
                    {downloadingDate === dateGroup.date ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Download size={16} />
                    )}
                    <span>Report</span>
                  </button>
                </div>
              </div>

              {/* Mobile Totals View */}
              <div className="grid grid-cols-2 gap-4 sm:hidden px-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Revenue (Net)</p>
                  <p className="text-lg font-black text-[#FFD700]">${dateGroup.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Profit</p>
                  <p className="text-lg font-black text-blue-400">${dateGroup.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {dateGroup.transactions.map((transaction) => {
                  const grossAmount = transaction.grossAmount;
                  const discountAmount = transaction.discountAmount;
                  const netAmount = transaction.netAmount;
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-black text-white uppercase tracking-tighter">
                                Sale @ {new Date(transaction.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-[#FFD700] bg-[#FFD700]/10 border border-[#FFD700]/20 px-2 py-0.5 rounded-full">
                                {firstItem.fund_source}
                              </span>
                              {discountAmount > 0 && (
                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Tag size={10} />
                                  Discount -${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-600 font-mono mt-0.5">ID: {transaction.timestamp.split('-').pop()}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                              {discountAmount > 0 ? 'Net Total' : 'Total Amount'}
                            </p>
                            <div className="flex items-baseline gap-2 justify-end">
                              {discountAmount > 0 && (
                                <span className="text-xs text-slate-500 line-through font-mono">
                                  ${grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              <p className="text-xl font-black text-[#FFD700]">
                                ${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                          <button 
                            disabled={isReversing}
                            onClick={() => handleReverseTransaction(transaction.items, transaction.discountEntryId)}
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

                      {/* Transaction Footer (if discounted) */}
                      {discountAmount > 0 && (
                        <div className="bg-[#0c0c0c] px-6 py-2.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-[11px] uppercase tracking-wider">
                            <Tag size={12} />
                            <span>Discount Applied: -${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                            <span>Gross Total: ${grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span>•</span>
                            <span className="text-[#FFD700] font-bold">Net Final: ${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )}
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
