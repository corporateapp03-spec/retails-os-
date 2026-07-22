import React, { useState, useEffect, useMemo } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { LedgerEntry, InventoryItem, BusinessSummary } from '../types';
import { 
  Building2, 
  TrendingUp, 
  TrendingDown,
  DollarSign, 
  Package, 
  ShieldCheck, 
  AlertTriangle, 
  Calculator, 
  FileText, 
  Download, 
  BarChart3, 
  PieChart as PieChartIcon, 
  Activity, 
  CheckCircle2, 
  Zap, 
  Briefcase, 
  Award, 
  ArrowUpRight, 
  ArrowDownRight, 
  Layers, 
  RefreshCw,
  UserCheck,
  Calendar,
  Percent,
  Coins,
  Scale,
  Sparkles,
  HelpCircle,
  FileCheck,
  XCircle,
  Clock,
  MapPin,
  Phone,
  Mail,
  Edit3,
  Check,
  RotateCcw
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

interface BusinessProfile {
  name: string;
  owner: string;
  registrationNo: string;
  category: string;
  operatingPeriod: string;
  location: string;
  phone: string;
  email: string;
  initialCapital: number;
  fixedAssetsValue: number;
  outstandingDebt: number;
  supplierCredit: number;
}

const DEFAULT_PROFILE: BusinessProfile = {
  name: 'RetailOS AutoCare & Enterprise',
  owner: 'Chief Executive Officer',
  registrationNo: 'REG-2024-AUTO-8891',
  category: 'Automotive Parts & Retail OS',
  operatingPeriod: '24 Months',
  location: 'Central Industrial Boulevard, Hub 4',
  phone: '+1 (800) 555-AUTO',
  email: 'finance@autoretailos.com',
  initialCapital: 50000,
  fixedAssetsValue: 35000,
  outstandingDebt: 5000,
  supplierCredit: 2500,
};

const CHART_COLORS = ['#FFD700', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function BusinessIntelligenceReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Raw Database Records
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [summaries, setSummaries] = useState<BusinessSummary[]>([]);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'summary' | 'sales' | 'inventory' | 'financial' | 'loan' | 'simulator' | 'assets' | 'risks' | 'comparison'>('summary');

  // Business Profile local state
  const [profile, setProfile] = useState<BusinessProfile>(() => {
    const saved = localStorage.getItem('retailos_bi_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* use default */ }
    }
    return DEFAULT_PROFILE;
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempProfile, setTempProfile] = useState<BusinessProfile>(profile);

  // Loan Simulator Inputs
  const [simLoanAmount, setSimLoanAmount] = useState<number>(25000);
  const [simInterestRate, setSimInterestRate] = useState<number>(8.5); // % annual
  const [simTermMonths, setSimTermMonths] = useState<number>(36);

  // Comparison Selector State
  const [compMonth1, setCompMonth1] = useState<string>('');
  const [compMonth2, setCompMonth2] = useState<string>('');

  // PDF Exporting State
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ledgerRes, inventoryRes, summaryRes] = await Promise.all([
        supabase.from('ledger').select('*').order('created_at', { ascending: false }),
        supabase.from('inventory').select('*'),
        supabase.from('business_summary').select('*')
      ]);

      if (ledgerRes.error) throw ledgerRes.error;

      const rawLedger = ledgerRes.data || [];
      const rawInventory = inventoryRes.data || [];
      const rawSummaries = summaryRes.data || [];

      setLedger(rawLedger);
      setInventory(rawInventory);
      setSummaries(rawSummaries);

      // Default months for comparison
      const months = Array.from(new Set(rawLedger.map(l => l.created_at?.slice(0, 7)))).filter(Boolean).sort().reverse();
      if (months.length > 0) {
        setCompMonth1(months[0]);
        setCompMonth2(months[1] || months[0]);
      }
    } catch (err: any) {
      console.error('Error fetching BI report data:', err);
      setError(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  // Profile Save
  const handleSaveProfile = () => {
    setProfile(tempProfile);
    localStorage.setItem('retailos_bi_profile', JSON.stringify(tempProfile));
    setIsEditingProfile(false);
  };

  // Helper numerical parser
  const safeNum = (val: any) => {
    const n = parseFloat(String(val || 0));
    return isNaN(n) ? 0 : n;
  };

  // =========================================================================
  // CORE CALCULATIONS
  // =========================================================================

  const metrics = useMemo(() => {
    // Ledger filtering
    const saleEntries = ledger.filter(l => l.transaction_type === 'sale');
    const expenseEntries = ledger.filter(l => l.transaction_type === 'expense');
    const capitalWithdrawals = ledger.filter(l => 
      l.transaction_type === 'capital_withdrawal' || l.transaction_type === 'CAPITAL_WITHDRAWAL' || l.transaction_type === 'capital_deduction'
    );

    // Sales totals
    const totalSales = saleEntries.reduce((sum, l) => sum + safeNum(l.amount), 0);
    const totalTransactionCount = saleEntries.length;
    const avgTransactionValue = totalTransactionCount > 0 ? totalSales / totalTransactionCount : 0;

    // Expenses total
    const totalExpenses = expenseEntries.reduce((sum, l) => sum + safeNum(l.amount), 0);
    const totalWithdrawals = capitalWithdrawals.reduce((sum, l) => sum + safeNum(l.amount), 0);

    // Inventory Valuation
    const inventoryCostValue = inventory.reduce((sum, item) => sum + (safeNum(item.cost_price) * safeNum(item.quantity)), 0);
    const inventoryRetailValue = inventory.reduce((sum, item) => sum + (safeNum(item.selling_price) * safeNum(item.quantity)), 0);
    const totalStockQuantity = inventory.reduce((sum, item) => sum + safeNum(item.quantity), 0);
    const lowStockCount = inventory.filter(item => safeNum(item.quantity) <= safeNum(item.min_stock_level)).length;

    // Estimate COGS from sold quantities & inventory cost prices
    const itemMap = inventory.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {} as Record<string, InventoryItem>);

    let calculatedCogs = 0;
    saleEntries.forEach(s => {
      if (s.inventory_item_id && itemMap[s.inventory_item_id]) {
        const cost = safeNum(itemMap[s.inventory_item_id].cost_price);
        const qty = safeNum(s.quantity) || 1;
        calculatedCogs += cost * qty;
      } else {
        // Fallback COGS estimate as ~60% of revenue if item ID is absent
        calculatedCogs += safeNum(s.amount) * 0.6;
      }
    });

    const grossProfit = Math.max(0, totalSales - calculatedCogs);
    const netProfit = totalSales - calculatedCogs - totalExpenses;
    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
    const expenseRatio = totalSales > 0 ? (totalExpenses / totalSales) * 100 : 0;

    // Cash position & Equity
    const startingCapital = profile.initialCapital;
    const retainedProfit = netProfit;
    const cashPosition = Math.max(0, startingCapital + netProfit - totalExpenses - totalWithdrawals);
    const totalBusinessAssets = inventoryCostValue + profile.fixedAssetsValue + cashPosition;
    const totalLiabilities = profile.outstandingDebt + profile.supplierCredit;
    const netBusinessWorth = totalBusinessAssets - totalLiabilities;
    const totalEquity = startingCapital + retainedProfit - totalWithdrawals;

    // Monthly Aggregation
    const monthlyDataMap: Record<string, { month: string; sales: number; expenses: number; cogs: number; profit: number; count: number }> = {};
    
    ledger.forEach(l => {
      if (!l.created_at) return;
      const monthKey = l.created_at.slice(0, 7); // YYYY-MM
      if (!monthlyDataMap[monthKey]) {
        monthlyDataMap[monthKey] = { month: monthKey, sales: 0, expenses: 0, cogs: 0, profit: 0, count: 0 };
      }
      const amt = safeNum(l.amount);
      if (l.transaction_type === 'sale') {
        monthlyDataMap[monthKey].sales += amt;
        monthlyDataMap[monthKey].count += 1;
        const itemCost = l.inventory_item_id && itemMap[l.inventory_item_id] ? safeNum(itemMap[l.inventory_item_id].cost_price) * (safeNum(l.quantity) || 1) : amt * 0.6;
        monthlyDataMap[monthKey].cogs += itemCost;
      } else if (l.transaction_type === 'expense') {
        monthlyDataMap[monthKey].expenses += amt;
      }
    });

    const monthlyArray = Object.values(monthlyDataMap).sort((a, b) => a.month.localeCompare(b.month));
    monthlyArray.forEach(m => {
      m.profit = m.sales - m.cogs - m.expenses;
    });

    // Best performing month
    let bestMonth = { month: 'N/A', sales: 0 };
    monthlyArray.forEach(m => {
      if (m.sales > bestMonth.sales) {
        bestMonth = { month: m.month, sales: m.sales };
      }
    });

    // Growth percentage calculation
    let growthPercent = 0;
    if (monthlyArray.length >= 2) {
      const currentMonthSales = monthlyArray[monthlyArray.length - 1].sales;
      const prevMonthSales = monthlyArray[monthlyArray.length - 2].sales;
      if (prevMonthSales > 0) {
        growthPercent = ((currentMonthSales - prevMonthSales) / prevMonthSales) * 100;
      }
    }

    // Product Sales Ranking
    const productSalesCount: Record<string, { item: InventoryItem; qtySold: number; totalRev: number }> = {};
    saleEntries.forEach(s => {
      const itemId = s.inventory_item_id;
      if (itemId && itemMap[itemId]) {
        if (!productSalesCount[itemId]) {
          productSalesCount[itemId] = { item: itemMap[itemId], qtySold: 0, totalRev: 0 };
        }
        productSalesCount[itemId].qtySold += safeNum(s.quantity) || 1;
        productSalesCount[itemId].totalRev += safeNum(s.amount);
      }
    });

    const productRanking = Object.values(productSalesCount).sort((a, b) => b.qtySold - a.qtySold);
    const fastMoving = productRanking.slice(0, 5);
    const slowMoving = productRanking.slice(-5).reverse();
    const deadStock = inventory.filter(i => !productSalesCount[i.id] || productSalesCount[i.id].qtySold === 0);

    // Sales by Category
    const categorySalesMap: Record<string, number> = {};
    saleEntries.forEach(s => {
      let catName = 'General';
      if (s.inventory_item_id && itemMap[s.inventory_item_id]) {
        catName = itemMap[s.inventory_item_id].category || 'General';
      }
      categorySalesMap[catName] = (categorySalesMap[catName] || 0) + safeNum(s.amount);
    });

    const categorySalesArray = Object.entries(categorySalesMap).map(([name, value]) => ({ name, value }));

    // Inventory Turnover (COGS / Inventory Cost)
    const inventoryTurnover = inventoryCostValue > 0 ? calculatedCogs / inventoryCostValue : 0;

    // Average Monthly Net Cash Flow
    const monthCount = Math.max(1, monthlyArray.length);
    const avgMonthlySales = totalSales / monthCount;
    const avgMonthlyNetProfit = netProfit / monthCount;

    return {
      totalSales,
      totalExpenses,
      totalWithdrawals,
      calculatedCogs,
      grossProfit,
      netProfit,
      profitMargin,
      expenseRatio,
      inventoryCostValue,
      inventoryRetailValue,
      totalStockQuantity,
      lowStockCount,
      cashPosition,
      startingCapital,
      retainedProfit,
      totalBusinessAssets,
      totalLiabilities,
      netBusinessWorth,
      totalEquity,
      totalTransactionCount,
      avgTransactionValue,
      growthPercent,
      bestMonth,
      monthlyArray,
      fastMoving,
      slowMoving,
      deadStock,
      categorySalesArray,
      inventoryTurnover,
      avgMonthlySales,
      avgMonthlyNetProfit,
      monthCount
    };
  }, [ledger, inventory, profile]);

  // =========================================================================
  // LOAN READINESS SCORE ALGORITHM (0 - 100)
  // =========================================================================
  const loanAssessment = useMemo(() => {
    let score = 0;
    const factors: { name: string; score: number; maxScore: number; status: 'good' | 'warning' | 'risk'; detail: string }[] = [];

    // 1. Operating Period / Business Age (Max 15 pts)
    const months = metrics.monthCount;
    let ageScore = Math.min(15, Math.floor(months * 1.5) + 5);
    factors.push({
      name: 'Business Operating History',
      score: ageScore,
      maxScore: 15,
      status: ageScore >= 10 ? 'good' : 'warning',
      detail: `${months} active month(s) recorded in database ledger.`
    });

    // 2. Revenue Consistency & Volume (Max 20 pts)
    let revScore = 0;
    if (metrics.totalSales >= 50000) revScore = 20;
    else if (metrics.totalSales >= 20000) revScore = 15;
    else if (metrics.totalSales >= 5000) revScore = 10;
    else revScore = 5;
    factors.push({
      name: 'Monthly Revenue Consistency',
      score: revScore,
      maxScore: 20,
      status: revScore >= 15 ? 'good' : 'warning',
      detail: `Average monthly revenue: $${metrics.avgMonthlySales.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    });

    // 3. Profitability & Margins (Max 20 pts)
    let profitScore = 0;
    if (metrics.profitMargin >= 25) profitScore = 20;
    else if (metrics.profitMargin >= 15) profitScore = 15;
    else if (metrics.profitMargin >= 5) profitScore = 10;
    else profitScore = 2;
    factors.push({
      name: 'Profit Margin & Strength',
      score: profitScore,
      maxScore: 20,
      status: profitScore >= 15 ? 'good' : profitScore >= 10 ? 'warning' : 'risk',
      detail: `Net Profit Margin: ${metrics.profitMargin.toFixed(1)}%`
    });

    // 4. Cash Flow Position (Max 15 pts)
    let cashScore = metrics.cashPosition > 10000 ? 15 : metrics.cashPosition > 3000 ? 10 : 5;
    factors.push({
      name: 'Cash Flow Strength',
      score: cashScore,
      maxScore: 15,
      status: cashScore >= 10 ? 'good' : 'warning',
      detail: `Estimated Liquid Cash: $${metrics.cashPosition.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    });

    // 5. Asset Backing & Collateral (Max 15 pts)
    let assetScore = metrics.inventoryCostValue >= 10000 ? 15 : metrics.inventoryCostValue >= 3000 ? 10 : 5;
    factors.push({
      name: 'Asset Collateral & Inventory Value',
      score: assetScore,
      maxScore: 15,
      status: assetScore >= 10 ? 'good' : 'warning',
      detail: `Inventory Value: $${metrics.inventoryCostValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    });

    // 6. Debt Service Coverage / Repayment Capacity (Max 15 pts)
    let debtScore = metrics.expenseRatio < 30 ? 15 : metrics.expenseRatio < 50 ? 10 : 5;
    factors.push({
      name: 'Expense Ratio & Debt Capacity',
      score: debtScore,
      maxScore: 15,
      status: debtScore >= 10 ? 'good' : 'risk',
      detail: `Expense-to-Revenue Ratio: ${metrics.expenseRatio.toFixed(1)}%`
    });

    score = factors.reduce((sum, f) => sum + f.score, 0);

    // Affordable Loan Range Calculation
    // Base loan: 12x to 24x monthly net profit or 2x inventory value
    const maxMonthlyRepayment = Math.max(200, metrics.avgMonthlyNetProfit * 0.4); // 40% of net monthly profit
    const suggestedMinLoan = Math.round(maxMonthlyRepayment * 12);
    const suggestedMaxLoan = Math.round(maxMonthlyRepayment * 30);

    let tierLabel = 'Prime Bank Loan Candidate';
    let tierColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (score < 50) {
      tierLabel = 'High Risk - Build Capital First';
      tierColor = 'text-rose-400 border-rose-500/30 bg-rose-500/10';
    } else if (score < 75) {
      tierLabel = 'Moderate Loan Readiness - Conditional';
      tierColor = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    }

    return {
      totalScore: score,
      tierLabel,
      tierColor,
      factors,
      suggestedMinLoan,
      suggestedMaxLoan,
      maxMonthlyRepayment
    };
  }, [metrics]);

  // =========================================================================
  // LOAN CALCULATOR SIMULATION
  // =========================================================================
  const loanSimulation = useMemo(() => {
    const P = simLoanAmount;
    const r = (simInterestRate / 100) / 12; // Monthly rate
    const n = simTermMonths;

    let monthlyPayment = 0;
    if (r > 0) {
      monthlyPayment = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    } else {
      monthlyPayment = P / n;
    }

    const totalRepayment = monthlyPayment * n;
    const totalInterest = totalRepayment - P;

    const netProfitCoverage = metrics.avgMonthlyNetProfit > 0 ? (metrics.avgMonthlyNetProfit / monthlyPayment) : 0;
    let affordabilityStatus: 'Highly Affordable' | 'Manageable' | 'Risky' = 'Risky';
    let affordabilityColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';

    if (netProfitCoverage >= 2.5) {
      affordabilityStatus = 'Highly Affordable';
      affordabilityColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    } else if (netProfitCoverage >= 1.2) {
      affordabilityStatus = 'Manageable';
      affordabilityColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    }

    return {
      monthlyPayment,
      totalRepayment,
      totalInterest,
      netProfitCoverage,
      affordabilityStatus,
      affordabilityColor
    };
  }, [simLoanAmount, simInterestRate, simTermMonths, metrics.avgMonthlyNetProfit]);

  // =========================================================================
  // COMPARISON METRICS
  // =========================================================================
  const comparisonData = useMemo(() => {
    if (!compMonth1 || !compMonth2) return null;

    const getDataForMonth = (mKey: string) => {
      const monthLedger = ledger.filter(l => l.created_at?.startsWith(mKey));
      const sales = monthLedger.filter(l => l.transaction_type === 'sale').reduce((s, l) => s + safeNum(l.amount), 0);
      const expenses = monthLedger.filter(l => l.transaction_type === 'expense').reduce((s, l) => s + safeNum(l.amount), 0);
      const count = monthLedger.filter(l => l.transaction_type === 'sale').length;
      return { sales, expenses, net: sales - expenses, count };
    };

    const m1Data = getDataForMonth(compMonth1);
    const m2Data = getDataForMonth(compMonth2);

    const salesDiff = m1Data.sales - m2Data.sales;
    const salesChangePct = m2Data.sales > 0 ? (salesDiff / m2Data.sales) * 100 : 0;

    return {
      compMonth1,
      compMonth2,
      m1Data,
      m2Data,
      salesDiff,
      salesChangePct
    };
  }, [ledger, compMonth1, compMonth2]);

  // =========================================================================
  // PDF REPORT GENERATOR
  // =========================================================================
  const generateBankPdf = () => {
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();

      // Page 1: Official Cover Header & Executive Summary
      doc.setFillColor(10, 10, 10);
      doc.rect(0, 0, pageWidth, 40, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(255, 215, 0); // Gold
      doc.text('RETAILOS FINANCIAL & LOAN READINESS REPORT', 14, 18);

      doc.setFontSize(10);
      doc.setTextColor(200, 200, 200);
      doc.text(`CONFIDENTIAL BANK SUBMISSION DOCUMENT • GENERATED: ${new Date().toLocaleDateString()}`, 14, 28);

      // Business Profile Header Table
      autoTable(doc, {
        startY: 45,
        head: [['BUSINESS & APPLICANT DETAILS', 'SYSTEM VERIFICATION']],
        body: [
          [`Business Name: ${profile.name}`, `Loan Readiness Score: ${loanAssessment.totalScore} / 100`],
          [`Owner / Executive: ${profile.owner}`, `Evaluation Rating: ${loanAssessment.tierLabel}`],
          [`Registration ID: ${profile.registrationNo}`, `Operating History: ${profile.operatingPeriod}`],
          [`Category: ${profile.category}`, `Suggested Loan Range: $${loanAssessment.suggestedMinLoan.toLocaleString()} - $${loanAssessment.suggestedMaxLoan.toLocaleString()}`],
          [`Contact Email: ${profile.email}`, `Phone: ${profile.phone}`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 215, 0], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 }
      });

      // Executive Summary Metrics Table
      doc.setFontSize(12);
      doc.setTextColor(10, 10, 10);
      doc.text('1. Executive Financial Summary', 14, (doc as any).lastAutoTable.finalY + 10);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 14,
        head: [['Metric Key', 'Amount (USD)', 'Analytical Notes']],
        body: [
          ['Total Gross Sales', `$${metrics.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Verified sales from ledger history'],
          ['Cost of Goods Sold (COGS)', `$${metrics.calculatedCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Estimated inventory cost deduction'],
          ['Gross Profit Margin', `$${metrics.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Revenue less COGS'],
          ['Operating Expenses', `$${metrics.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Recorded outflow & store operational costs'],
          ['Net Operating Profit', `$${metrics.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, `Net Profit Margin: ${metrics.profitMargin.toFixed(1)}%`],
          ['Current Inventory Value', `$${metrics.inventoryCostValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, `Cost basis across ${metrics.totalStockQuantity} units`],
          ['Estimated Cash Position', `$${metrics.cashPosition.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Estimated available liquidity'],
          ['Total Business Net Worth', `$${metrics.netBusinessWorth.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Total Assets less Liabilities']
        ],
        theme: 'striped',
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
        styles: { fontSize: 9 }
      });

      // Page 2: Income & Expense Breakdown + Loan Evaluation
      doc.addPage();
      doc.setFontSize(14);
      doc.setTextColor(10, 10, 10);
      doc.text('2. Loan Capacity & Underwriting Factors', 14, 20);

      const loanFactorRows = loanAssessment.factors.map(f => [
        f.name,
        `${f.score} / ${f.maxScore}`,
        f.status.toUpperCase(),
        f.detail
      ]);

      autoTable(doc, {
        startY: 25,
        head: [['Evaluation Factor', 'Points Awarded', 'Status', 'Underwriting Observation']],
        body: loanFactorRows,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 215, 0] },
        styles: { fontSize: 9 }
      });

      // Simulation Section
      doc.setFontSize(12);
      doc.setTextColor(10, 10, 10);
      doc.text('3. Loan Repayment Simulation Model', 14, (doc as any).lastAutoTable.finalY + 10);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 14,
        head: [['Parameter', 'Simulated Value', 'Impact Analysis']],
        body: [
          ['Requested Loan Principal', `$${simLoanAmount.toLocaleString()}`, 'Simulated capital requirement'],
          ['Annual Interest Rate', `${simInterestRate}%`, 'Standard commercial bank benchmark rate'],
          ['Repayment Term', `${simTermMonths} Months`, 'Amortization window'],
          ['Estimated Monthly Payment', `$${loanSimulation.monthlyPayment.toFixed(2)}`, 'Monthly debt service requirement'],
          ['Total Repayment Amount', `$${loanSimulation.totalRepayment.toFixed(2)}`, 'Principal + Interest total'],
          ['Average Monthly Net Cash Flow', `$${metrics.avgMonthlyNetProfit.toFixed(2)}`, 'Historical monthly net cash capacity'],
          ['Affordability Coverage Ratio', `${loanSimulation.netProfitCoverage.toFixed(2)}x`, loanSimulation.affordabilityStatus]
        ],
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
        styles: { fontSize: 9 }
      });

      // Save PDF
      doc.save(`${profile.name.replace(/\s+/g, '_')}_Bank_Loan_Report.pdf`);
    } catch (e) {
      console.error('PDF Generation Error:', e);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (loading) {
    return <Loading message="Synthesizing Business Intelligence & Bank Loan Metrics..." />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Top Banner & Title Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-gradient-to-r from-[#0d0d0d] via-[#141414] to-[#0d0d0d] p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#FFD700]/5 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20 flex items-center gap-1.5">
              <ShieldCheck size={12} /> Executive Decision Engine • Read Only
            </span>
            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Bank Audit Ready
            </span>
          </div>
          <h1 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <Building2 className="text-[#FFD700]" size={36} />
            Business Intelligence & Loan Readiness
          </h1>
          <p className="text-slate-400 text-xs md:text-sm font-medium max-w-2xl">
            Comprehensive analytics converting live store ledger & inventory performance into institutional financial reports for expansion management and loan preparation.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 relative z-10 w-full lg:w-auto">
          <button
            onClick={() => setIsEditingProfile(!isEditingProfile)}
            className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 flex-1 lg:flex-none"
          >
            <Edit3 size={16} /> Edit Profile
          </button>
          <button
            onClick={generateBankPdf}
            disabled={isGeneratingPdf}
            className="gold-btn px-6 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 flex-1 lg:flex-none"
          >
            {isGeneratingPdf ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
            <span>Export Bank PDF</span>
          </button>
        </div>
      </div>

      {/* Edit Profile Modal / Form */}
      {isEditingProfile && (
        <div className="vault-card p-6 border-[#FFD700]/30 space-y-4 bg-[#121212] animate-in slide-in-from-top duration-200">
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
              <Building2 size={16} /> Customize Report Business Profile
            </h3>
            <button onClick={() => setIsEditingProfile(false)} className="text-slate-500 hover:text-white text-xs">Cancel</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Business Name</label>
              <input
                type="text"
                value={tempProfile.name}
                onChange={e => setTempProfile({ ...tempProfile, name: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white font-bold mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Owner Name</label>
              <input
                type="text"
                value={tempProfile.owner}
                onChange={e => setTempProfile({ ...tempProfile, owner: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white font-bold mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Registration ID</label>
              <input
                type="text"
                value={tempProfile.registrationNo}
                onChange={e => setTempProfile({ ...tempProfile, registrationNo: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white font-bold mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Operating Period</label>
              <input
                type="text"
                value={tempProfile.operatingPeriod}
                onChange={e => setTempProfile({ ...tempProfile, operatingPeriod: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white font-bold mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Initial Capital ($)</label>
              <input
                type="number"
                value={tempProfile.initialCapital}
                onChange={e => setTempProfile({ ...tempProfile, initialCapital: safeNum(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white font-bold mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Fixed Assets Est. ($)</label>
              <input
                type="number"
                value={tempProfile.fixedAssetsValue}
                onChange={e => setTempProfile({ ...tempProfile, fixedAssetsValue: safeNum(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white font-bold mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={handleSaveProfile} className="gold-btn px-6 py-2.5 text-xs font-black uppercase">
              Save Profile
            </button>
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-white/10">
        {[
          { id: 'summary', label: 'Executive Summary', icon: BarChart3 },
          { id: 'sales', label: 'Sales & Revenue', icon: TrendingUp },
          { id: 'inventory', label: 'Inventory Health', icon: Package },
          { id: 'financial', label: 'Financial Statements', icon: DollarSign },
          { id: 'loan', label: 'Loan Readiness Score', icon: Award },
          { id: 'simulator', label: 'Loan Calculator', icon: Calculator },
          { id: 'assets', label: 'Assets & Liabilities', icon: Scale },
          { id: 'risks', label: 'Risk & AI Advice', icon: Sparkles },
          { id: 'comparison', label: 'Period Comparison', icon: RefreshCw },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-2",
              activeTab === tab.id
                ? "bg-[#FFD700] text-[#0a0a0a] shadow-[0_0_20px_rgba(255,215,0,0.3)] scale-105"
                : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
            )}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* =========================================================================
          TAB 1: EXECUTIVE SUMMARY
      ========================================================================= */}
      {activeTab === 'summary' && (
        <div className="space-y-8">
          
          {/* Top Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <div className="vault-card p-6 hover:border-[#FFD700]/30 transition-all">
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Revenue</span>
                <div className="p-2 bg-[#FFD700]/10 text-[#FFD700] rounded-xl"><TrendingUp size={18} /></div>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white">${metrics.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-emerald-400 font-bold mt-2 flex items-center gap-1">
                <ArrowUpRight size={12} /> {metrics.growthPercent.toFixed(1)}% vs Prior Month
              </p>
            </div>

            <div className="vault-card p-6 hover:border-emerald-500/30 transition-all">
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Net Operating Profit</span>
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl"><DollarSign size={18} /></div>
              </div>
              <p className="text-2xl md:text-3xl font-black text-emerald-400">${metrics.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-400 font-bold mt-2">Margin: {metrics.profitMargin.toFixed(1)}%</p>
            </div>

            <div className="vault-card p-6 hover:border-blue-500/30 transition-all">
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Stock Cost Valuation</span>
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl"><Package size={18} /></div>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white">${metrics.inventoryCostValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-400 font-bold mt-2">Retail: ${metrics.inventoryRetailValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>

            <div className="vault-card p-6 hover:border-purple-500/30 transition-all">
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Loan Readiness Score</span>
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl"><Award size={18} /></div>
              </div>
              <p className="text-2xl md:text-3xl font-black text-purple-400">{loanAssessment.totalScore} <span className="text-xs text-slate-500 font-normal">/ 100</span></p>
              <p className="text-[10px] font-bold text-slate-300 mt-2 truncate">{loanAssessment.tierLabel}</p>
            </div>
          </div>

          {/* Business Overview & Performance Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Chart: Monthly Revenue & Expense Trend */}
            <div className="lg:col-span-2 vault-card p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">Monthly Sales & Operating Profit Trend</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Historical Performance Graph</p>
                </div>
                <span className="text-[10px] font-mono text-[#FFD700] bg-[#FFD700]/10 px-3 py-1 rounded-full border border-[#FFD700]/20">
                  Best Month: {metrics.bestMonth.month} (${metrics.bestMonth.sales.toLocaleString()})
                </span>
              </div>

              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.monthlyArray}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FFD700" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#FFD700" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="month" stroke="#666" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#666" tick={{ fontSize: 10 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '12px', fontSize: '12px' }}
                      formatter={(val: any) => [`$${safeNum(val).toLocaleString()}`, '']}
                    />
                    <Area type="monotone" dataKey="sales" name="Sales Revenue" stroke="#FFD700" fillOpacity={1} fill="url(#salesGrad)" />
                    <Area type="monotone" dataKey="profit" name="Net Profit" stroke="#10B981" fillOpacity={1} fill="url(#profitGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Profile Summary Card */}
            <div className="vault-card p-6 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
                    <Building2 size={16} /> Business Profile
                  </h3>
                  <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Verified</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-500">Legal Name</span>
                    <span className="font-bold text-white text-right">{profile.name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-500">Primary Owner</span>
                    <span className="font-bold text-white">{profile.owner}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-500">Reg. Number</span>
                    <span className="font-mono text-slate-300">{profile.registrationNo}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-500">Operating History</span>
                    <span className="font-bold text-[#FFD700]">{profile.operatingPeriod}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-500">Starting Capital</span>
                    <span className="font-mono text-white">${profile.initialCapital.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Fixed Assets Est.</span>
                    <span className="font-mono text-white">${profile.fixedAssetsValue.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2 text-[10px]">
                <div className="flex items-center justify-between font-bold text-slate-400">
                  <span>Loan Eligibility Bracket</span>
                  <span className="text-[#FFD700] font-mono">${loanAssessment.suggestedMinLoan.toLocaleString()} - ${loanAssessment.suggestedMaxLoan.toLocaleString()}</span>
                </div>
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#FFD700] h-full" style={{ width: `${Math.min(100, loanAssessment.totalScore)}%` }} />
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: SALES & REVENUE ANALYSIS
      ========================================================================= */}
      {activeTab === 'sales' && (
        <div className="space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="vault-card p-6">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Sales Transactions</span>
              <p className="text-3xl font-black text-white mt-2">{metrics.totalTransactionCount}</p>
              <p className="text-xs text-slate-400 mt-1">Avg Transaction: <span className="text-[#FFD700] font-mono">${metrics.avgTransactionValue.toFixed(2)}</span></p>
            </div>

            <div className="vault-card p-6">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Average Monthly Sales</span>
              <p className="text-3xl font-black text-[#FFD700] mt-2">${metrics.avgMonthlySales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-slate-400 mt-1">Across {metrics.monthCount} Month(s) Recorded</p>
            </div>

            <div className="vault-card p-6">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Top Revenue Category</span>
              <p className="text-2xl font-black text-emerald-400 mt-2 truncate">
                {metrics.categorySalesArray[0]?.name || 'N/A'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                ${(metrics.categorySalesArray[0]?.value || 0).toLocaleString()} Total Sales
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales by Category Pie Chart */}
            <div className="vault-card p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                <PieChartIcon size={16} className="text-[#FFD700]" /> Sales Distribution by Category
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.categorySalesArray}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                    >
                      {metrics.categorySalesArray.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => [`$${safeNum(val).toLocaleString()}`, 'Sales']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Fast Moving Products Table */}
            <div className="vault-card p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                <Zap size={16} className="text-[#FFD700]" /> Top 5 Fast Moving Products
              </h3>
              <div className="space-y-3">
                {metrics.fastMoving.map((p, i) => (
                  <div key={p.item.id} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                    <div>
                      <p className="text-xs font-black text-white">{i + 1}. {p.item.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{p.item.code} • Stock: {p.item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-[#FFD700]">${p.totalRev.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-emerald-400">{p.qtySold} Units Sold</p>
                    </div>
                  </div>
                ))}
                {metrics.fastMoving.length === 0 && <p className="text-xs text-slate-500 italic">No product sale data recorded yet.</p>}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 3: INVENTORY HEALTH
      ========================================================================= */}
      {activeTab === 'inventory' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="vault-card p-5">
              <span className="text-[10px] font-black text-slate-500 uppercase">Total Inventory Value (Cost)</span>
              <p className="text-2xl font-black text-white mt-1">${metrics.inventoryCostValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="vault-card p-5">
              <span className="text-[10px] font-black text-slate-500 uppercase">Inventory Potential Retail Value</span>
              <p className="text-2xl font-black text-[#FFD700] mt-1">${metrics.inventoryRetailValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="vault-card p-5">
              <span className="text-[10px] font-black text-slate-500 uppercase">Total Stock Quantity</span>
              <p className="text-2xl font-black text-white mt-1">{metrics.totalStockQuantity} Units</p>
            </div>
            <div className="vault-card p-5">
              <span className="text-[10px] font-black text-slate-500 uppercase">Inventory Turnover Rate</span>
              <p className="text-2xl font-black text-emerald-400 mt-1">{metrics.inventoryTurnover.toFixed(2)}x</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Low Stock Alerts */}
            <div className="vault-card p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
                  <AlertTriangle size={16} /> Low Stock & Reorder Alerts
                </h3>
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold rounded">
                  {metrics.lowStockCount} Items
                </span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {inventory.filter(i => safeNum(i.quantity) <= safeNum(i.min_stock_level)).map(item => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                    <div>
                      <p className="text-xs font-black text-white">{item.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">Min Threshold: {item.min_stock_level}</p>
                    </div>
                    <span className="text-xs font-black text-rose-400 bg-rose-500/10 px-2 py-1 rounded">
                      {item.quantity} Left
                    </span>
                  </div>
                ))}
                {metrics.lowStockCount === 0 && <p className="text-xs text-slate-500 italic">All stock levels are optimal.</p>}
              </div>
            </div>

            {/* Dead Stock / Unsold Items */}
            <div className="vault-card p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-rose-400 flex items-center gap-2">
                <XCircle size={16} /> Dead Stock / Unsold Inventory
              </h3>
              <p className="text-[10px] text-slate-500">Items currently held with 0 recorded sales in ledger history:</p>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {metrics.deadStock.slice(0, 8).map(item => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-white/5 border border-white/5 rounded-xl">
                    <div>
                      <p className="text-xs font-black text-white">{item.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">Cost: ${item.cost_price}</p>
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      ${(safeNum(item.cost_price) * safeNum(item.quantity)).toLocaleString()} Tied Up
                    </span>
                  </div>
                ))}
                {metrics.deadStock.length === 0 && <p className="text-xs text-slate-500 italic">No dead stock detected!</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: FINANCIAL STATEMENTS
      ========================================================================= */}
      {activeTab === 'financial' && (
        <div className="space-y-8">
          <div className="vault-card p-6 md:p-8 space-y-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-black uppercase tracking-widest text-[#FFD700]">Profit & Loss Income Statement</h3>
                <p className="text-xs text-slate-400">Cumulative Performance Financial Statement</p>
              </div>
              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-slate-300">
                AUDIT VERIFIED
              </span>
            </div>

            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between py-2 border-b border-white/10 font-bold text-white">
                <span>1. Gross Sales Revenue</span>
                <span className="text-[#FFD700]">${metrics.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-white/5 text-slate-400 pl-4">
                <span>Less: Cost of Goods Sold (COGS)</span>
                <span className="text-rose-400">-${metrics.calculatedCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-3 border-b-2 border-white/20 font-black text-emerald-400 text-base">
                <span>GROSS PROFIT</span>
                <span>${metrics.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-white/5 text-slate-400 pl-4">
                <span>Less: Total Operating Expenses (Outflow)</span>
                <span className="text-rose-400">-${metrics.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between py-4 border-t-2 border-[#FFD700]/30 font-black text-white text-lg bg-[#FFD700]/5 px-4 rounded-2xl">
                <span className="text-[#FFD700]">NET OPERATING PROFIT</span>
                <span className="text-[#FFD700]">${metrics.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                <span className="text-[10px] font-black text-slate-500 uppercase">Gross Profit Margin</span>
                <p className="text-xl font-black text-white mt-1">
                  {metrics.totalSales > 0 ? ((metrics.grossProfit / metrics.totalSales) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                <span className="text-[10px] font-black text-slate-500 uppercase">Net Profit Margin</span>
                <p className="text-xl font-black text-emerald-400 mt-1">{metrics.profitMargin.toFixed(1)}%</p>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                <span className="text-[10px] font-black text-slate-500 uppercase">Operating Expense Ratio</span>
                <p className="text-xl font-black text-amber-400 mt-1">{metrics.expenseRatio.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: LOAN READINESS SCORE
      ========================================================================= */}
      {activeTab === 'loan' && (
        <div className="space-y-8">
          
          <div className="vault-card p-8 bg-gradient-to-br from-[#0f0f0f] via-[#141414] to-[#0f0f0f] border-[#FFD700]/30 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-2">
                <span className="px-3 py-1 bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                  Bank Underwriting Evaluation Model
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
                  Loan Readiness & Credit Assessment
                </h2>
                <p className="text-xs text-slate-400 max-w-xl">
                  Evaluated using commercial bank loan underwriting criteria: historical cash flow stability, collateral backing, profit margins, and expense coverage.
                </p>
              </div>

              {/* Score Dial Badge */}
              <div className="flex items-center gap-6 bg-white/5 p-6 rounded-3xl border border-white/10 shrink-0">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="48" cy="48" r="40" stroke="#222" strokeWidth="8" fill="transparent" />
                    <circle 
                      cx="48" 
                      cy="48" 
                      r="40" 
                      stroke="#FFD700" 
                      strokeWidth="8" 
                      fill="transparent" 
                      strokeDasharray={251.2}
                      strokeDashoffset={251.2 - (251.2 * loanAssessment.totalScore) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-2xl font-black text-white">{loanAssessment.totalScore}</span>
                </div>
                <div>
                  <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border", loanAssessment.tierColor)}>
                    {loanAssessment.tierLabel}
                  </span>
                  <p className="text-[10px] text-slate-400 font-mono mt-2">
                    Score: <span className="text-white font-bold">{loanAssessment.totalScore}/100</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Affordable Loan Range Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Suggested Affordable Loan Facility Range</span>
                <p className="text-2xl font-black text-[#FFD700]">
                  ${loanAssessment.suggestedMinLoan.toLocaleString()} – ${loanAssessment.suggestedMaxLoan.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">Based on 12-30x average monthly net operating profit capacity.</p>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Safe Monthly Repayment Limit</span>
                <p className="text-2xl font-black text-emerald-400">
                  ${loanAssessment.maxMonthlyRepayment.toLocaleString(undefined, { maximumFractionDigits: 0 })} / Month
                </p>
                <p className="text-[10px] text-slate-500">Capped at 40% of average monthly net profit.</p>
              </div>
            </div>
          </div>

          {/* Underwriting Factors Checklist */}
          <div className="vault-card p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-white">Underwriting Evaluation Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loanAssessment.factors.map((factor, idx) => (
                <div key={idx} className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-white">{factor.name}</span>
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded",
                      factor.status === 'good' ? "bg-emerald-500/10 text-emerald-400" :
                      factor.status === 'warning' ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"
                    )}>
                      {factor.score} / {factor.maxScore} PTS
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">{factor.detail}</p>
                  <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full",
                        factor.status === 'good' ? "bg-emerald-400" : factor.status === 'warning' ? "bg-amber-400" : "bg-rose-400"
                      )} 
                      style={{ width: `${(factor.score / factor.maxScore) * 100}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 6: LOAN SIMULATION TOOL
      ========================================================================= */}
      {activeTab === 'simulator' && (
        <div className="space-y-8">
          <div className="vault-card p-6 md:p-8 space-y-6">
            <div className="border-b border-white/10 pb-4">
              <h3 className="text-base font-black uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
                <Calculator size={20} /> Bank Loan Repayment & Affordability Calculator
              </h3>
              <p className="text-xs text-slate-400 mt-1">Simulate loan financing scenarios against live store cash flow capacity.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Inputs */}
              <div className="space-y-4 bg-white/5 p-6 rounded-2xl border border-white/5">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">Loan Parameters</h4>
                
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase">Desired Loan Principal ($)</label>
                  <input
                    type="number"
                    value={simLoanAmount}
                    onChange={e => setSimLoanAmount(safeNum(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-3 text-sm font-bold text-white mt-1"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase">Annual Interest Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simInterestRate}
                    onChange={e => setSimInterestRate(safeNum(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-3 text-sm font-bold text-white mt-1"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase">Repayment Window (Months)</label>
                  <select
                    value={simTermMonths}
                    onChange={e => setSimTermMonths(safeNum(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-3 text-sm font-bold text-white mt-1"
                  >
                    <option value={12}>12 Months (1 Year)</option>
                    <option value={24}>24 Months (2 Years)</option>
                    <option value={36}>36 Months (3 Years)</option>
                    <option value={48}>48 Months (4 Years)</option>
                    <option value={60}>60 Months (5 Years)</option>
                  </select>
                </div>
              </div>

              {/* Simulation Output Card */}
              <div className="lg:col-span-2 space-y-4 flex flex-col justify-between">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Estimated Monthly Payment</span>
                    <p className="text-3xl font-black text-[#FFD700]">
                      ${loanSimulation.monthlyPayment.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-500">Principal + Interest per month</p>
                  </div>

                  <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Total Repayment Amount</span>
                    <p className="text-3xl font-black text-white">
                      ${loanSimulation.totalRepayment.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-rose-400">Includes ${loanSimulation.totalInterest.toFixed(2)} Total Interest</p>
                  </div>
                </div>

                <div className={cn("p-6 rounded-2xl border space-y-3", loanSimulation.affordabilityColor)}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest">Affordability Status Assessment</span>
                    <span className="text-xs font-black uppercase px-3 py-1 rounded-full border border-current">
                      {loanSimulation.affordabilityStatus}
                    </span>
                  </div>

                  <p className="text-xs font-medium leading-relaxed">
                    Monthly payment of <strong>${loanSimulation.monthlyPayment.toFixed(2)}</strong> represents{' '}
                    <strong>
                      {metrics.avgMonthlyNetProfit > 0 ? ((loanSimulation.monthlyPayment / metrics.avgMonthlyNetProfit) * 100).toFixed(1) : 'N/A'}%
                    </strong>{' '}
                    of your average monthly net operating profit (${metrics.avgMonthlyNetProfit.toFixed(2)}).
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 7: ASSETS & LIABILITIES
      ========================================================================= */}
      {activeTab === 'assets' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Assets */}
            <div className="vault-card p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                <Scale size={18} /> Business Total Assets
              </h3>
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400">Inventory Cost Valuation</span>
                  <span className="text-white font-bold">${metrics.inventoryCostValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400">Estimated Fixed Assets (Equipment/Vehicles)</span>
                  <span className="text-white font-bold">${profile.fixedAssetsValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400">Estimated Liquid Cash Position</span>
                  <span className="text-white font-bold">${metrics.cashPosition.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-3 border-t border-emerald-500/30 text-sm font-black text-emerald-400 bg-emerald-500/5 px-3 rounded-xl">
                  <span>TOTAL ASSETS</span>
                  <span>${metrics.totalBusinessAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Liabilities & Equity */}
            <div className="vault-card p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-rose-400 flex items-center gap-2">
                <ShieldCheck size={18} /> Liabilities & Owner Equity
              </h3>
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400">Outstanding Business Debts</span>
                  <span className="text-rose-400">${profile.outstandingDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400">Supplier Credit Owed</span>
                  <span className="text-rose-400">${profile.supplierCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5 text-amber-400 font-bold">
                  <span>Total Liabilities</span>
                  <span>${metrics.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-3 border-t border-[#FFD700]/30 text-sm font-black text-[#FFD700] bg-[#FFD700]/5 px-3 rounded-xl">
                  <span>NET BUSINESS WORTH (EQUITY)</span>
                  <span>${metrics.netBusinessWorth.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 8: RISKS & AI ADVICE
      ========================================================================= */}
      {activeTab === 'risks' && (
        <div className="space-y-8">
          
          {/* AI Decision Support Insights */}
          <div className="vault-card p-6 md:p-8 space-y-4 border-[#FFD700]/30">
            <h3 className="text-base font-black uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
              <Sparkles size={20} /> AI Decision Support & Strategic Recommendations
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              
              {metrics.fastMoving.length > 0 && (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl space-y-1">
                  <p className="text-xs font-black text-emerald-400 uppercase">Stock Optimization Action</p>
                  <p className="text-xs text-slate-300 font-medium">
                    Increase stock levels for high-turnover item <strong>"{metrics.fastMoving[0].item.name}"</strong> to prevent out-of-stock revenue loss.
                  </p>
                </div>
              )}

              {metrics.deadStock.length > 0 && (
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-1">
                  <p className="text-xs font-black text-amber-400 uppercase">Capital Liquidation Advice</p>
                  <p className="text-xs text-slate-300 font-medium">
                    Run promotional discounts on {metrics.deadStock.length} slow-moving inventory item(s) to free up cash flow.
                  </p>
                </div>
              )}

              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl space-y-1">
                <p className="text-xs font-black text-blue-400 uppercase">Expense Management Note</p>
                <p className="text-xs text-slate-300 font-medium">
                  Operating expense ratio sits at <strong>{metrics.expenseRatio.toFixed(1)}%</strong> of sales. Maintain operating costs below 35% for bank loan eligibility.
                </p>
              </div>

              <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-2xl space-y-1">
                <p className="text-xs font-black text-purple-400 uppercase">Loan Strategy Recommendation</p>
                <p className="text-xs text-slate-300 font-medium">
                  Target a maximum loan request of <strong>${loanAssessment.suggestedMaxLoan.toLocaleString()}</strong> to keep debt service coverage comfortably supported by monthly profit.
                </p>
              </div>

            </div>
          </div>

          {/* Risk Matrix */}
          <div className="vault-card p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-white">Automated Risk Analysis Matrix</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                <span className="text-[10px] font-black text-rose-400 uppercase">Low Stock Risk</span>
                <p className="text-sm font-bold text-white">{metrics.lowStockCount} Items At Minimum Stock</p>
                <p className="text-[10px] text-slate-400">Risk of stockout during peak customer demand.</p>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                <span className="text-[10px] font-black text-amber-400 uppercase">Expense Overrun Risk</span>
                <p className="text-sm font-bold text-white">{metrics.expenseRatio > 40 ? 'High Expense Burden' : 'Optimal Expense Control'}</p>
                <p className="text-[10px] text-slate-400">Expense ratio: {metrics.expenseRatio.toFixed(1)}%</p>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                <span className="text-[10px] font-black text-emerald-400 uppercase">Cash Flow Stability</span>
                <p className="text-sm font-bold text-white">{metrics.cashPosition > 5000 ? 'Healthy Cash Buffer' : 'Tight Cash Reserve'}</p>
                <p className="text-[10px] text-slate-400">Liquid reserve: ${metrics.cashPosition.toLocaleString()}</p>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 9: COMPARISON REPORTS
      ========================================================================= */}
      {activeTab === 'comparison' && comparisonData && (
        <div className="space-y-8">
          <div className="vault-card p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-[#FFD700]">Monthly Performance Comparison</h3>
                <p className="text-xs text-slate-400">Compare sales and expense trajectory between two operating months.</p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={compMonth1}
                  onChange={e => setCompMonth1(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl p-2 text-xs font-mono text-white"
                >
                  {Array.from(new Set(ledger.map(l => l.created_at?.slice(0, 7)))).filter(Boolean).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-500 font-bold">vs</span>
                <select
                  value={compMonth2}
                  onChange={e => setCompMonth2(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl p-2 text-xs font-mono text-white"
                >
                  {Array.from(new Set(ledger.map(l => l.created_at?.slice(0, 7)))).filter(Boolean).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                <span className="text-xs font-black text-[#FFD700] uppercase">{comparisonData.compMonth1}</span>
                <p className="text-2xl font-black text-white">${comparisonData.m1Data.sales.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Transactions: {comparisonData.m1Data.count}</p>
                <p className="text-xs text-rose-400">Expenses: ${comparisonData.m1Data.expenses.toLocaleString()}</p>
              </div>

              <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                <span className="text-xs font-black text-slate-400 uppercase">{comparisonData.compMonth2}</span>
                <p className="text-2xl font-black text-white">${comparisonData.m2Data.sales.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Transactions: {comparisonData.m2Data.count}</p>
                <p className="text-xs text-rose-400">Expenses: ${comparisonData.m2Data.expenses.toLocaleString()}</p>
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-2xl text-center border border-white/5">
              <span className="text-xs font-black text-slate-400 uppercase">Sales Growth Comparison</span>
              <p className={cn("text-2xl font-black mt-1", comparisonData.salesDiff >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {comparisonData.salesDiff >= 0 ? '+' : ''}${comparisonData.salesDiff.toLocaleString()} ({comparisonData.salesChangePct.toFixed(1)}%)
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
