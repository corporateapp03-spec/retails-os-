import React, { useEffect, useState, useMemo } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { InventoryItem, LedgerEntry } from '../types';
import { 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Package, 
  AlertCircle, 
  X, 
  TrendingUp, 
  DollarSign,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Boxes,
  Activity,
  Layers,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Eye,
  RefreshCw,
  Flame,
  ShieldAlert,
  Loader2,
  Filter
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CATEGORY_MAP: Record<number, string> = {
  1: 'Oils',
  2: 'Spare Parts',
  3: 'Electrical Spares'
};

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'reorder' | 'dead' | 'active'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditTab, setAuditTab] = useState<'overview' | 'reorder' | 'dead' | 'ledger'>('overview');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: 'Oils',
    cost_price: 0,
    selling_price: 0,
    category_id: 1,
    min_stock_level: 5,
    quantity: 0,
    active: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem?.name || '',
        code: editingItem?.code || '',
        category: editingItem?.category || 'Oils',
        cost_price: editingItem?.cost_price || 0,
        selling_price: editingItem?.selling_price || 0,
        category_id: editingItem?.category_id || 1,
        min_stock_level: editingItem?.min_stock_level || 5,
        quantity: editingItem?.quantity || 0,
        active: editingItem?.active ?? true
      });
      setIsModalOpen(true);
    } else {
      setFormData({
        name: '',
        code: '',
        category: 'Oils',
        cost_price: 0,
        selling_price: 0,
        category_id: 1,
        min_stock_level: 5,
        quantity: 0,
        active: true
      });
    }
  }, [editingItem]);

  const safeNum = (val: any) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  async function fetchData() {
    if (!isConfigured) {
      // Fallback to local cache if Supabase not configured
      const cached = localStorage.getItem('retailos_inventory_cache');
      if (cached) {
        try {
          setItems(JSON.parse(cached));
        } catch (e) {
          console.warn('Failed to parse cache', e);
        }
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [inventoryRes, ledgerRes] = await Promise.all([
        supabase
          .from('inventory')
          .select('*')
          .order('name', { ascending: true }),
        supabase
          .from('ledger')
          .select('*')
          .eq('transaction_type', 'sale')
      ]);

      if (inventoryRes.error) throw inventoryRes.error;
      const invData = inventoryRes.data || [];
      setItems(invData);

      if (ledgerRes.data) {
        setSales(ledgerRes.data);
      }
    } catch (err: any) {
      console.error('Error fetching inventory:', err);
      if (err.message === 'Failed to fetch') {
        setError('Database connection error. Please check your Supabase secrets and connectivity.');
      } else {
        setError(err.message || 'Failed to fetch inventory data from Supabase.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Pure Reader Logic: Calculate item sales history from ledger
  const itemSalesMap = useMemo(() => {
    const map: Record<string, { unitsSold: number; revenue: number; lastSold: string | null }> = {};
    sales.forEach(sale => {
      const itemId = sale.inventory_item_id;
      const qty = safeNum(sale.quantity) || 1;
      const amt = safeNum(sale.amount);
      
      if (itemId) {
        if (!map[itemId]) {
          map[itemId] = { unitsSold: 0, revenue: 0, lastSold: null };
        }
        map[itemId].unitsSold += qty;
        map[itemId].revenue += amt;
        if (sale.created_at && (!map[itemId].lastSold || new Date(sale.created_at) > new Date(map[itemId].lastSold!))) {
          map[itemId].lastSold = sale.created_at;
        }
      }
    });
    return map;
  }, [sales]);

  // Derived Analytics for Every Single Item in Catalog
  const stockAnalytics = useMemo(() => {
    return items.map(item => {
      const cost = safeNum(item.cost_price);
      const price = safeNum(item.selling_price);
      const currentQty = safeNum(item.quantity);
      const minLevel = safeNum(item.min_stock_level) || 5;
      
      const salesInfo = itemSalesMap[item.id] || { unitsSold: 0, revenue: 0, lastSold: null };
      const unitsSold = salesInfo.unitsSold;
      
      // Starting Stock: What we started with = Current On-Hand + Total Units Sold to date
      const startingQty = currentQty + unitsSold;
      const startingCostVal = startingQty * cost;
      const startingRetailVal = startingQty * price;

      // Till-To-Date Stock Values
      const currentCostVal = currentQty * cost;
      const currentRetailVal = currentQty * price;
      const realizedRevenue = salesInfo.revenue;
      const realizedProfit = Math.max(0, realizedRevenue - (unitsSold * cost));

      // Reorder Threshold Analysis
      const isOutOfStock = currentQty === 0;
      const needsReorder = currentQty <= minLevel;
      const deficit = Math.max(0, minLevel - currentQty);
      const suggestedReorderQty = Math.max(minLevel * 2 - currentQty, minLevel);
      const estimatedReorderCost = suggestedReorderQty * cost;

      // Dead vs Active Stock Analysis (Dead Stock = 0 sales units recorded)
      const isDeadStock = unitsSold === 0;
      const isActiveStock = unitsSold > 0;
      const deadStockCapital = isDeadStock ? currentCostVal : 0;

      const depletionPercent = startingQty > 0 ? (unitsSold / startingQty) * 100 : 0;

      return {
        ...item,
        currentQty,
        unitsSold,
        startingQty,
        startingCostVal,
        startingRetailVal,
        currentCostVal,
        currentRetailVal,
        realizedRevenue,
        realizedProfit,
        minLevel,
        isOutOfStock,
        needsReorder,
        deficit,
        suggestedReorderQty,
        estimatedReorderCost,
        isDeadStock,
        isActiveStock,
        deadStockCapital,
        depletionPercent,
        lastSold: salesInfo.lastSold
      };
    });
  }, [items, itemSalesMap]);

  // Inventory Aggregate Summary
  const inventorySummary = useMemo(() => {
    const totalStartingQty = stockAnalytics.reduce((s, i) => s + i.startingQty, 0);
    const totalStartingCostVal = stockAnalytics.reduce((s, i) => s + i.startingCostVal, 0);
    const totalStartingRetailVal = stockAnalytics.reduce((s, i) => s + i.startingRetailVal, 0);

    const totalCurrentQty = stockAnalytics.reduce((s, i) => s + i.currentQty, 0);
    const totalCurrentCostVal = stockAnalytics.reduce((s, i) => s + i.currentCostVal, 0);
    const totalCurrentRetailVal = stockAnalytics.reduce((s, i) => s + i.currentRetailVal, 0);

    const totalUnitsSold = stockAnalytics.reduce((s, i) => s + i.unitsSold, 0);
    const totalRealizedRevenue = stockAnalytics.reduce((s, i) => s + i.realizedRevenue, 0);
    const totalRealizedProfit = stockAnalytics.reduce((s, i) => s + i.realizedProfit, 0);

    const reorderItems = stockAnalytics.filter(i => i.needsReorder);
    const outOfStockItems = stockAnalytics.filter(i => i.isOutOfStock);
    const totalReorderDeficitUnits = reorderItems.reduce((s, i) => s + i.deficit, 0);
    const totalReorderCostEst = reorderItems.reduce((s, i) => s + i.estimatedReorderCost, 0);

    const activeItems = stockAnalytics.filter(i => i.isActiveStock);
    const deadItems = stockAnalytics.filter(i => i.isDeadStock);
    const deadStockCapitalTotal = deadItems.reduce((s, i) => s + i.deadStockCapital, 0);
    const deadStockUnitsTotal = deadItems.reduce((s, i) => s + i.currentQty, 0);

    const activeStockCapitalTotal = activeItems.reduce((s, i) => s + i.currentCostVal, 0);

    const depletionRate = totalStartingQty > 0 ? (totalUnitsSold / totalStartingQty) * 100 : 0;
    const deadStockPercent = stockAnalytics.length > 0 ? (deadItems.length / stockAnalytics.length) * 100 : 0;
    const activeStockPercent = stockAnalytics.length > 0 ? (activeItems.length / stockAnalytics.length) * 100 : 0;

    return {
      totalStartingQty,
      totalStartingCostVal,
      totalStartingRetailVal,
      totalCurrentQty,
      totalCurrentCostVal,
      totalCurrentRetailVal,
      totalUnitsSold,
      totalRealizedRevenue,
      totalRealizedProfit,
      reorderItems,
      outOfStockItems,
      totalReorderDeficitUnits,
      totalReorderCostEst,
      activeItems,
      deadItems,
      deadStockCapitalTotal,
      deadStockUnitsTotal,
      activeStockCapitalTotal,
      depletionRate,
      deadStockPercent,
      activeStockPercent
    };
  }, [stockAnalytics]);

  // Filtering based on search and active tab
  const filteredItems = useMemo(() => {
    return stockAnalytics.filter(item => {
      const matchesSearch = 
        (item?.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
        (item?.code || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
        (CATEGORY_MAP[item.category_id] || '').toLowerCase().includes((searchTerm || '').toLowerCase());
      
      if (!matchesSearch) return false;

      if (stockFilter === 'reorder') return item.needsReorder;
      if (stockFilter === 'dead') return item.isDeadStock;
      if (stockFilter === 'active') return item.isActiveStock;
      return true;
    });
  }, [stockAnalytics, searchTerm, stockFilter]);

  // Download Comprehensive PDF Report
  const downloadInventoryPDF = () => {
    setIsDownloadingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Dark luxury background theme
      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Top Gold Accent Bar
      doc.setFillColor(255, 215, 0);
      doc.rect(0, 0, pageWidth, 4, 'F');

      // Title & Header Block
      doc.setTextColor(255, 215, 0); // Gold
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('RETAILOS INVENTORY & STOCK VALUATION AUDIT REPORT', 14, 16);

      doc.setTextColor(180, 180, 180);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Starting Stock Inception vs Till-to-Date Values | Reorder Thresholds | Dead vs Active Stock Analysis`, 14, 22);

      doc.setTextColor(130, 130, 130);
      doc.setFontSize(8);
      doc.text(`Generated: ${dateStr} at ${timeStr} | Source: Live Reconciled Inventory Ledger`, 14, 27);

      // Executive Summary Matrix (4 Key KPI boxes)
      const boxWidth = (pageWidth - 28 - 9) / 4;
      const boxHeight = 22;
      const boxY = 32;

      // Box 1: Starting vs Till-to-Date Value
      doc.setFillColor(24, 24, 24);
      doc.roundedRect(14, boxY, boxWidth, boxHeight, 3, 3, 'F');
      doc.setDrawColor(255, 215, 0);
      doc.setLineWidth(0.3);
      doc.roundedRect(14, boxY, boxWidth, boxHeight, 3, 3, 'S');
      
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('STARTING VS CURRENT STOCK', 18, boxY + 5);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`Start: $${inventorySummary.totalStartingCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${inventorySummary.totalStartingQty} units)`, 18, boxY + 11);
      doc.setTextColor(255, 215, 0);
      doc.text(`Till-Date: $${inventorySummary.totalCurrentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${inventorySummary.totalCurrentQty} units)`, 18, boxY + 16);
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6.5);
      doc.text(`Depletion Rate: ${inventorySummary.depletionRate.toFixed(1)}% | Sold: ${inventorySummary.totalUnitsSold} units`, 18, boxY + 20);

      // Box 2: Minimum Stock & Reorder Alerts
      const box2X = 14 + boxWidth + 3;
      doc.setFillColor(24, 24, 24);
      doc.roundedRect(box2X, boxY, boxWidth, boxHeight, 3, 3, 'F');
      doc.setDrawColor(inventorySummary.reorderItems.length > 0 ? 245 : 60, inventorySummary.reorderItems.length > 0 ? 158 : 60, inventorySummary.reorderItems.length > 0 ? 11 : 60);
      doc.roundedRect(box2X, boxY, boxWidth, boxHeight, 3, 3, 'S');

      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('REORDER & MINIMUM THRESHOLDS', box2X + 4, boxY + 5);
      doc.setTextColor(inventorySummary.reorderItems.length > 0 ? 245 : 52, inventorySummary.reorderItems.length > 0 ? 158 : 211, inventorySummary.reorderItems.length > 0 ? 11 : 153);
      doc.setFontSize(10);
      doc.text(`${inventorySummary.reorderItems.length} ITEMS NEED REORDER`, box2X + 4, boxY + 11);
      doc.setTextColor(244, 63, 94);
      doc.setFontSize(8);
      doc.text(`Out of Stock: ${inventorySummary.outOfStockItems.length} items | Deficit: ${inventorySummary.totalReorderDeficitUnits} units`, box2X + 4, boxY + 16);
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(6.5);
      doc.text(`Est Replenish Cost: $${inventorySummary.totalReorderCostEst.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, box2X + 4, boxY + 20);

      // Box 3: Dead vs Active Stock
      const box3X = 14 + (boxWidth + 3) * 2;
      doc.setFillColor(24, 24, 24);
      doc.roundedRect(box3X, boxY, boxWidth, boxHeight, 3, 3, 'F');
      doc.setDrawColor(56, 189, 248);
      doc.roundedRect(box3X, boxY, boxWidth, boxHeight, 3, 3, 'S');

      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('DEAD VS ACTIVE STOCK DYNAMICS', box3X + 4, boxY + 5);
      doc.setTextColor(56, 189, 248);
      doc.setFontSize(10);
      doc.text(`Active: ${inventorySummary.activeItems.length} (${inventorySummary.activeStockPercent.toFixed(0)}%) | Dead: ${inventorySummary.deadItems.length} (${inventorySummary.deadStockPercent.toFixed(0)}%)`, box3X + 4, boxY + 11);
      doc.setTextColor(244, 63, 94);
      doc.setFontSize(8);
      doc.text(`Trapped Capital in Dead Stock: $${inventorySummary.deadStockCapitalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, box3X + 4, boxY + 16);
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6.5);
      doc.text(`Dead Units on Hand: ${inventorySummary.deadStockUnitsTotal} units without movement`, box3X + 4, boxY + 20);

      // Box 4: Total Current Valuation & Liquidity
      const box4X = 14 + (boxWidth + 3) * 3;
      doc.setFillColor(24, 24, 24);
      doc.roundedRect(box4X, boxY, boxWidth, boxHeight, 3, 3, 'F');
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(box4X, boxY, boxWidth, boxHeight, 3, 3, 'S');

      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL ASSET VALUATION (LIQUIDITY)', box4X + 4, boxY + 5);
      doc.setTextColor(16, 185, 129);
      doc.setFontSize(11);
      doc.text(`$${inventorySummary.totalCurrentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, box4X + 4, boxY + 12);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      doc.text(`Retail Potential: $${inventorySummary.totalCurrentRetailVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, box4X + 4, boxY + 16);
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6.5);
      doc.text(`Realized Sales To Date: $${inventorySummary.totalRealizedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, box4X + 4, boxY + 20);

      // Section 1: Minimum Items Needing Reorder Table
      let currentY = boxY + boxHeight + 8;
      doc.setTextColor(245, 158, 11);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`1. MINIMUM STOCK & REORDER DEFICIT AUDIT (${inventorySummary.reorderItems.length} Products Requiring Restock)`, 14, currentY);

      const reorderRows = inventorySummary.reorderItems.map(item => [
        item.code || 'N/A',
        item.name || 'Unnamed',
        CATEGORY_MAP[item.category_id] || `ID: ${item.category_id}`,
        `${item.currentQty} units`,
        `${item.minLevel} units`,
        item.deficit > 0 ? `-${item.deficit} units` : '0',
        `${item.suggestedReorderQty} units`,
        `$${item.estimatedReorderCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        item.isOutOfStock ? 'CRITICAL OUT OF STOCK' : 'LOW STOCK - REORDER'
      ]);

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Code/SKU', 'Product Name', 'Category', 'Current Stock', 'Min Level', 'Deficit', 'Suggested Order', 'Est Cost ($)', 'Urgency Status']],
        body: reorderRows.length > 0 ? reorderRows : [['-', 'No items below minimum stock level. All inventory levels optimal.', '-', '-', '-', '-', '-', '-', 'ALL OPTIMAL']],
        theme: 'grid',
        headStyles: { fillColor: [40, 30, 15], textColor: [255, 215, 0], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fillColor: [20, 20, 20], textColor: [240, 240, 240], fontSize: 7 },
        alternateRowStyles: { fillColor: [28, 28, 28] },
        styles: { cellPadding: 2, overflow: 'linebreak' },
        margin: { left: 14, right: 14 }
      });

      // Section 2: Complete Comprehensive Inventory Valuation Table
      doc.addPage('a4', 'landscape');
      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      doc.setFillColor(255, 215, 0);
      doc.rect(0, 0, pageWidth, 3, 'F');

      doc.setTextColor(255, 215, 0);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('2. FULL INVENTORY VALUATION LEDGER (Starting Stock vs Till-to-Date Values)', 14, 14);

      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Itemized audit of inception quantity, units sold till-to-date, current on-hand stock, and dead vs active classification.`, 14, 19);

      const allItemsRows = stockAnalytics.map(item => [
        item.code || 'N/A',
        item.name || 'Unnamed',
        CATEGORY_MAP[item.category_id] || `ID: ${item.category_id}`,
        `$${safeNum(item.cost_price).toFixed(2)}`,
        `$${safeNum(item.selling_price).toFixed(2)}`,
        `${item.startingQty}`,
        `$${item.startingCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        `${item.unitsSold}`,
        `${item.currentQty} (Min: ${item.minLevel})`,
        `$${item.currentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        item.isDeadStock ? 'DEAD STOCK' : `ACTIVE (${item.unitsSold} sold)`,
        item.isOutOfStock ? 'OUT OF STOCK' : item.needsReorder ? 'LOW STOCK' : 'OPTIMAL'
      ]);

      autoTable(doc, {
        startY: 23,
        head: [['SKU', 'Product Name', 'Category', 'Cost', 'Price', 'Start Qty', 'Start Val ($)', 'Units Sold', 'Till-Date Qty', 'Till-Date Val ($)', 'Movement', 'Stock Status']],
        body: allItemsRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 215, 0], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fillColor: [20, 20, 20], textColor: [230, 230, 230], fontSize: 6.5 },
        alternateRowStyles: { fillColor: [26, 26, 26] },
        styles: { cellPadding: 1.8 },
        margin: { left: 14, right: 14 }
      });

      // Section 3: Dead vs Active Stock Specific Audit
      doc.addPage('a4', 'landscape');
      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      doc.setFillColor(255, 215, 0);
      doc.rect(0, 0, pageWidth, 3, 'F');

      doc.setTextColor(56, 189, 248);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('3. DEAD VS ACTIVE STOCK INTELLIGENCE & CAPITAL RECOVERY', 14, 14);

      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Dead Stock items have zero recorded sales, tying up $${inventorySummary.deadStockCapitalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} in dormant capital.`, 14, 19);

      const deadStockRows = inventorySummary.deadItems.map(item => [
        item.code || 'N/A',
        item.name || 'Unnamed',
        CATEGORY_MAP[item.category_id] || `ID: ${item.category_id}`,
        `${item.currentQty} units`,
        `$${safeNum(item.cost_price).toFixed(2)}`,
        `$${item.deadStockCapital.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        `$${safeNum(item.selling_price).toFixed(2)}`,
        'ZERO SALES (DORMANT)',
        'Clearance / Reprice Recommended'
      ]);

      autoTable(doc, {
        startY: 23,
        head: [['Code/SKU', 'Dormant Product', 'Category', 'Dormant Qty', 'Unit Cost', 'Trapped Capital ($)', 'Retail Price', 'Sales Activity', 'Recommendation']],
        body: deadStockRows.length > 0 ? deadStockRows : [['-', 'No dead stock detected. 100% of inventory items have active sales velocity.', '-', '-', '-', '-', '-', '-', 'ALL ACTIVE']],
        theme: 'grid',
        headStyles: { fillColor: [40, 20, 25], textColor: [244, 63, 94], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fillColor: [20, 20, 20], textColor: [230, 230, 230], fontSize: 7 },
        alternateRowStyles: { fillColor: [28, 28, 28] },
        styles: { cellPadding: 2 },
        margin: { left: 14, right: 14 }
      });

      // Add page numbering & verification to all pages
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(7);
        doc.text(`Page ${p} of ${totalPages} - RetailOS Verified Financial & Stock Engine`, 14, pageHeight - 6);
        doc.text(`Reconciliation Timestamp: ${dateStr} ${timeStr}`, pageWidth - 70, pageHeight - 6);
      }

      doc.save(`RetailOS_Inventory_Valuation_Audit_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setError('Failed to generate PDF inventory report. Please try again.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Download Comprehensive CSV Spreadsheet
  const downloadInventoryCSV = () => {
    setIsDownloadingCsv(true);
    try {
      const headers = [
        'SKU / Code',
        'Product Name',
        'Category',
        'Unit Cost Price ($)',
        'Unit Selling Price ($)',
        'Starting Stock (Units)',
        'Starting Stock Cost Value ($)',
        'Starting Stock Retail Potential ($)',
        'Units Sold Till-To-Date',
        'Realized Sales Revenue ($)',
        'Realized Gross Profit ($)',
        'Current Stock (Units)',
        'Till-To-Date Stock Cost Value ($)',
        'Till-To-Date Retail Potential ($)',
        'Minimum Stock Threshold',
        'Reorder Status',
        'Reorder Deficit (Units)',
        'Suggested Reorder Qty (Units)',
        'Estimated Reorder Cost ($)',
        'Movement Status',
        'Tied-Up Capital in Dead Stock ($)',
        'Depletion Rate (%)',
        'Last Sold Date'
      ];

      const rows = stockAnalytics.map(item => [
        `"${item.code || ''}"`,
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${CATEGORY_MAP[item.category_id] || item.category_id}"`,
        safeNum(item.cost_price).toFixed(2),
        safeNum(item.selling_price).toFixed(2),
        item.startingQty,
        item.startingCostVal.toFixed(2),
        item.startingRetailVal.toFixed(2),
        item.unitsSold,
        item.realizedRevenue.toFixed(2),
        item.realizedProfit.toFixed(2),
        item.currentQty,
        item.currentCostVal.toFixed(2),
        item.currentRetailVal.toFixed(2),
        item.minLevel,
        item.isOutOfStock ? 'CRITICAL OUT OF STOCK' : item.needsReorder ? 'LOW STOCK' : 'OPTIMAL',
        item.deficit,
        item.suggestedReorderQty,
        item.estimatedReorderCost.toFixed(2),
        item.isDeadStock ? 'DEAD STOCK' : 'ACTIVE STOCK',
        item.deadStockCapital.toFixed(2),
        item.depletionPercent.toFixed(1),
        item.lastSold ? `"${new Date(item.lastSold).toLocaleDateString()}"` : '"Never"'
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `RetailOS_Inventory_Stock_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('CSV Download Error:', err);
      setError('Failed to export inventory CSV.');
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!formData.category_id) {
      setError('Category ID is required for database mapping.');
      return;
    }

    try {
      if (editingItem) {
        const { error: updateError } = await supabase
          .from('inventory')
          .update(formData)
          .eq('id', editingItem.id);
        
        if (updateError) throw updateError;
      } else {
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        const { error: insertError } = await supabase
          .from('inventory')
          .insert([{ ...formData, created_at: timeString }]);
        
        if (insertError) throw insertError;
      }
      
      setIsModalOpen(false);
      setEditingItem(null);
      fetchData();
    } catch (err) {
      setError('Database Write Error: ' + (err as any)?.message);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to delete this item? This action will remove the row from the inventory table.')) {
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      fetchData();
    } catch (err) {
      setError('Database Delete Error: ' + (err as any)?.message);
    }
  }

  if (loading && items.length === 0) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      {/* Top Analytical Cards: Starting Stock vs Till-To-Date, Reorders & Dead vs Active Stock */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Starting Stock vs Till-to-Date Value */}
        <div className="bg-[#050505] border border-white/10 hover:border-[#FFD700]/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden transition-all group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-[#FFD700]/5 blur-[45px] rounded-full pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              <Boxes size={12} className="text-[#FFD700]" />
              Stock Valuation Trajectory
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/5">
              {inventorySummary.depletionRate.toFixed(0)}% Depleted
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Till-To-Date Current Stock</p>
              <h3 className="text-2xl font-black text-white flex items-baseline gap-1 group-hover:gold-text transition-colors">
                <span className="text-[#FFD700] text-lg">$</span>
                {inventorySummary.totalCurrentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                {inventorySummary.totalCurrentQty} units on hand
              </p>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Starting Inception Stock</span>
                <span className="font-bold text-slate-300">
                  ${inventorySummary.totalStartingCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-slate-600 text-[10px] ml-1">({inventorySummary.totalStartingQty} units)</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Sold To Date</span>
                <span className="font-bold text-emerald-400">+{inventorySummary.totalUnitsSold} units</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Minimum Items Needing Reorder */}
        <div className={cn(
          "bg-[#050505] border rounded-3xl p-6 shadow-2xl relative overflow-hidden transition-all group",
          inventorySummary.reorderItems.length > 0 
            ? "border-amber-500/30 hover:border-amber-500/60" 
            : "border-white/10 hover:border-emerald-500/40"
        )}>
          <div className={cn(
            "absolute top-0 right-0 w-28 h-28 blur-[45px] rounded-full pointer-events-none",
            inventorySummary.reorderItems.length > 0 ? "bg-amber-500/10" : "bg-emerald-500/5"
          )} />
          
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              <ShieldAlert size={12} className={inventorySummary.reorderItems.length > 0 ? "text-amber-400" : "text-emerald-400"} />
              Minimum Stock Alerts
            </span>
            {inventorySummary.outOfStockItems.length > 0 && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                {inventorySummary.outOfStockItems.length} OUT OF STOCK
              </span>
            )}
          </div>

          <div className="mt-3 space-y-2">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Items Below Minimum Level</p>
              <h3 className={cn(
                "text-2xl font-black flex items-baseline gap-2",
                inventorySummary.reorderItems.length > 0 ? "text-amber-400" : "text-emerald-400"
              )}>
                {inventorySummary.reorderItems.length}
                <span className="text-xs text-slate-400 font-medium">products need reorder</span>
              </h3>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                Deficit shortage: <span className="text-amber-300 font-bold">{inventorySummary.totalReorderDeficitUnits} units</span>
              </p>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Est. Replenish Cost</span>
                <span className="font-bold text-amber-200">
                  ${inventorySummary.totalReorderCostEst.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <button 
                onClick={() => setStockFilter(stockFilter === 'reorder' ? 'all' : 'reorder')}
                className="text-[10px] uppercase font-black text-amber-400 hover:text-amber-300 hover:underline transition-all"
              >
                {stockFilter === 'reorder' ? 'Clear Filter' : 'View Watchlist →'}
              </button>
            </div>
          </div>
        </div>

        {/* Card 3: Dead vs Active Stock Analysis */}
        <div className="bg-[#050505] border border-white/10 hover:border-cyan-500/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden transition-all group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/5 blur-[45px] rounded-full pointer-events-none" />
          
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              <Activity size={12} className="text-cyan-400" />
              Dead vs Active Stock
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              {inventorySummary.activeStockPercent.toFixed(0)}% Active Ratio
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active vs Dormant Catalog</p>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-black text-emerald-400">
                  {inventorySummary.activeItems.length} <span className="text-xs text-slate-400 font-normal">Active</span>
                </span>
                <span className="text-slate-600">/</span>
                <span className="text-2xl font-black text-rose-400">
                  {inventorySummary.deadItems.length} <span className="text-xs text-slate-400 font-normal">Dead</span>
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                Trapped Capital: <span className="text-rose-400 font-bold">${inventorySummary.deadStockCapitalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </p>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Dead Stock Units</span>
                <span className="font-bold text-slate-300">{inventorySummary.deadStockUnitsTotal} dormant units</span>
              </div>
              <button 
                onClick={() => setStockFilter(stockFilter === 'dead' ? 'all' : 'dead')}
                className="text-[10px] uppercase font-black text-cyan-400 hover:text-cyan-300 hover:underline transition-all"
              >
                {stockFilter === 'dead' ? 'Clear Filter' : 'Inspect Dead →'}
              </button>
            </div>
          </div>
        </div>

        {/* Card 4: Total Asset Valuation & Liquidity */}
        <div className="bg-[#050505] border border-white/10 hover:border-[#FFD700]/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden transition-all group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-[#FFD700]/5 blur-[45px] rounded-full pointer-events-none" />
          
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              <DollarSign size={12} className="text-[#FFD700]" />
              Total Liquidity & Potential
            </span>
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          </div>

          <div className="mt-3 space-y-2">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Catalog Cost Valuation</p>
              <h3 className="text-2xl font-black text-white flex items-baseline gap-1 group-hover:gold-text transition-colors">
                <span className="text-[#FFD700] text-lg">$</span>
                {inventorySummary.totalCurrentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                Retail Potential: <span className="text-[#FFD700] font-bold">${inventorySummary.totalCurrentRetailVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </p>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Catalog Breadth</span>
                <span className="font-bold text-slate-300">{items.length} Registered SKUs</span>
              </div>
              <button 
                onClick={() => setIsAuditModalOpen(true)}
                className="text-[10px] uppercase font-black text-[#FFD700] hover:underline transition-all flex items-center gap-1"
              >
                <Eye size={12} />
                Full Audit Modal
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="text-rose-500 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-black text-rose-500 uppercase tracking-tighter">Database Error Detected</p>
            <p className="text-xs text-rose-400 mt-1 font-mono">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500/50 hover:text-rose-500">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Action Bar & Controls: Search, Filters & Report Downloads */}
      <div className="vault-card p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
            <input 
              type="text" 
              placeholder="Search by product name, code, SKU, or category..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-white placeholder:text-slate-600 font-medium"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Action Buttons: Download PDF, Download CSV, and Register Item */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Download PDF Audit Report */}
            <button
              onClick={downloadInventoryPDF}
              disabled={isDownloadingPdf}
              className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl text-xs font-black uppercase tracking-wider transition-all hover:border-[#FFD700]/40 active:scale-95 disabled:opacity-50"
              title="Download comprehensive PDF Inventory & Valuation report"
            >
              {isDownloadingPdf ? (
                <Loader2 size={16} className="animate-spin text-[#FFD700]" />
              ) : (
                <Download size={16} className="text-[#FFD700]" />
              )}
              <span>{isDownloadingPdf ? 'Generating PDF...' : 'Download PDF Report'}</span>
            </button>

            {/* Download CSV Ledger */}
            <button
              onClick={downloadInventoryCSV}
              disabled={isDownloadingCsv}
              className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl text-xs font-black uppercase tracking-wider transition-all hover:border-emerald-500/40 active:scale-95 disabled:opacity-50"
              title="Download Excel / CSV compatible Stock Audit Spreadsheet"
            >
              {isDownloadingCsv ? (
                <Loader2 size={16} className="animate-spin text-emerald-400" />
              ) : (
                <FileSpreadsheet size={16} className="text-emerald-400" />
              )}
              <span>{isDownloadingCsv ? 'Exporting...' : 'Export CSV'}</span>
            </button>

            {/* Interactive Audit View Modal */}
            <button
              onClick={() => setIsAuditModalOpen(true)}
              className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl text-xs font-black uppercase tracking-wider transition-all hover:border-cyan-500/40 active:scale-95"
              title="View full audit analytics on screen"
            >
              <Eye size={16} className="text-cyan-400" />
              <span>Audit View</span>
            </button>

            {/* Register Item */}
            <button 
              onClick={() => {
                setEditingItem(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-3 bg-[#FFD700] text-[#0a0a0a] rounded-2xl text-xs font-black hover:bg-[#FFD700]/90 transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)] active:scale-95 uppercase tracking-wider ml-auto lg:ml-0"
            >
              <Plus size={16} />
              Register Item
            </button>
          </div>
        </div>

        {/* Filter Tabs: All, Needs Reorder, Dead Stock, Active Stock */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mr-2 flex items-center gap-1">
            <Filter size={12} />
            Filter View:
          </span>

          <button
            onClick={() => setStockFilter('all')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              stockFilter === 'all'
                ? "bg-[#FFD700] text-[#0a0a0a] shadow-[0_0_15px_rgba(255,215,0,0.3)]"
                : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            )}
          >
            All Products
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-md font-mono",
              stockFilter === 'all' ? "bg-black/20 text-black font-black" : "bg-white/10 text-slate-300"
            )}>
              {stockAnalytics.length}
            </span>
          </button>

          <button
            onClick={() => setStockFilter('reorder')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              stockFilter === 'reorder'
                ? "bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                : "bg-white/5 text-slate-400 hover:text-amber-300 hover:bg-white/10"
            )}
          >
            Needs Reorder (Low/Out)
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-md font-mono font-black",
              stockFilter === 'reorder' ? "bg-black/20 text-black" : "bg-amber-500/20 text-amber-300"
            )}>
              {inventorySummary.reorderItems.length}
            </span>
          </button>

          <button
            onClick={() => setStockFilter('dead')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              stockFilter === 'dead'
                ? "bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                : "bg-white/5 text-slate-400 hover:text-rose-300 hover:bg-white/10"
            )}
          >
            Dead Stock (Zero Sales)
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-md font-mono font-black",
              stockFilter === 'dead' ? "bg-black/20 text-white" : "bg-rose-500/20 text-rose-300"
            )}>
              {inventorySummary.deadItems.length}
            </span>
          </button>

          <button
            onClick={() => setStockFilter('active')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              stockFilter === 'active'
                ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                : "bg-white/5 text-slate-400 hover:text-cyan-300 hover:bg-white/10"
            )}
          >
            Active Stock (Moving)
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-md font-mono font-black",
              stockFilter === 'active' ? "bg-black/20 text-black" : "bg-cyan-500/20 text-cyan-300"
            )}>
              {inventorySummary.activeItems.length}
            </span>
          </button>

          {stockFilter !== 'all' && (
            <button
              onClick={() => setStockFilter('all')}
              className="text-[10px] text-slate-500 hover:text-slate-300 uppercase font-black ml-auto underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Inventory Table & Mobile List */}
      <div className="vault-card overflow-hidden">
        {/* Desktop Table */}
        <div className="desktop-table w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Product Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Code / Category</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cost / Selling</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Starting Stock</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Units Sold</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Current Stock (Min)</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status & Dynamics</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="max-w-xs mx-auto">
                      <Package size={40} className="mx-auto text-slate-800 mb-4" />
                      <p className="text-slate-500 font-black uppercase tracking-tighter">No inventory records found.</p>
                      <p className="text-[10px] text-slate-600 mt-1 uppercase">
                        {stockFilter !== 'all' ? `No items matched the "${stockFilter}" filter.` : 'Check your Supabase connection or search keywords.'}
                      </p>
                      {stockFilter !== 'all' && (
                        <button
                          onClick={() => setStockFilter('all')}
                          className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 text-[#FFD700] rounded-xl text-xs font-bold"
                        >
                          Show All Products
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item?.id} className="hover:bg-white/5 transition-colors group">
                    {/* Product Name & ID */}
                    <td className="px-6 py-4">
                      <span className="font-bold text-white block group-hover:gold-text transition-colors">
                        {item?.name || 'Unnamed Product'}
                      </span>
                      <span className="text-[10px] text-slate-600 font-mono">{item?.id}</span>
                    </td>

                    {/* Code & Category */}
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-mono bg-white/5 px-2 py-1 rounded border border-white/10 text-slate-300">
                        {item?.code || 'N/A'}
                      </span>
                      <span className="block text-[11px] font-black text-slate-500 uppercase tracking-tighter mt-1">
                        {CATEGORY_MAP[item?.category_id] || `ID: ${item?.category_id}`}
                      </span>
                    </td>

                    {/* Cost & Selling Price */}
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-slate-400">
                        Cost: <span className="text-slate-300">${safeNum(item?.cost_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="text-xs font-black text-[#FFD700]">
                        Price: ${safeNum(item?.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </td>

                    {/* Starting Stock Value & Units */}
                    <td className="px-6 py-4">
                      <div className="text-sm font-black text-slate-200">
                        {item.startingQty} <span className="text-[10px] text-slate-500 font-normal">units</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        Val: ${item.startingCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </td>

                    {/* Sold to Date */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-emerald-400">
                          {item.unitsSold}
                        </span>
                        {item.unitsSold > 0 && (
                          <span className="text-[10px] font-mono text-slate-500">
                            (${item.realizedRevenue.toLocaleString(undefined, { minimumFractionDigits: 0 })})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-600 block">
                        {item.depletionPercent.toFixed(0)}% sold
                      </span>
                    </td>

                    {/* Current Stock vs Min Level */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm font-black",
                          item.isOutOfStock ? "text-rose-500" : item.needsReorder ? "text-amber-400" : "text-white"
                        )}>
                          {item.currentQty}
                        </span>
                        <span className="text-[10px] text-slate-600 font-bold uppercase">
                          (Min: {item.minLevel})
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        Val: ${item.currentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </td>

                    {/* Status Badges: Reorder + Dead/Active */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        {/* Reorder Status */}
                        {item.isOutOfStock ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Out of Stock
                          </span>
                        ) : item.needsReorder ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Low Stock (Reorder)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Optimal Level
                          </span>
                        )}

                        {/* Dead vs Active Stock Status */}
                        {item.isDeadStock ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                            Dead Stock ($0 Sales)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                            Active Stock
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setEditingItem(item)}
                          className="p-2 text-slate-500 hover:text-[#FFD700] hover:bg-[#FFD700]/10 rounded-xl transition-all"
                          title="Edit Item"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                          title="Delete Item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
        <div className="mobile-card-list p-4 space-y-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Package size={40} className="mx-auto text-slate-800 mb-4" />
              <p className="text-slate-500 font-black uppercase tracking-tighter">No inventory records found.</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div key={item.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-black text-white uppercase tracking-tighter">{item.name}</h3>
                    <p className="text-[10px] text-slate-600 font-mono">{item.code || 'N/A'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingItem(item)} className="p-2 bg-white/5 rounded-lg text-slate-400 hover:text-[#FFD700]"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 bg-rose-500/10 rounded-lg text-rose-500"><Trash2 size={14} /></button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {item.isOutOfStock ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      Out of Stock
                    </span>
                  ) : item.needsReorder ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Low Stock
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Optimal
                    </span>
                  )}

                  {item.isDeadStock ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                      Dead Stock
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                      Active ({item.unitsSold} sold)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Starting Stock</p>
                    <p className="text-xs font-bold text-slate-300">{item.startingQty} units <span className="text-[10px] text-slate-500">(${item.startingCostVal.toLocaleString()})</span></p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Current Stock (Min)</p>
                    <p className={cn("text-xs font-black", item.needsReorder ? "text-amber-400" : "text-white")}>
                      {item.currentQty} <span className="text-[9px] text-slate-600">(Min: {item.minLevel})</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Cost / Selling</p>
                    <p className="text-xs font-bold text-slate-400">
                      ${safeNum(item.cost_price).toLocaleString()} / <span className="text-[#FFD700]">${safeNum(item.selling_price).toLocaleString()}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Till-Date Valuation</p>
                    <p className="text-xs font-black text-[#FFD700]">
                      ${item.currentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Interactive In-App Inventory Audit Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-md" onClick={() => setIsAuditModalOpen(false)} />
          <div className="relative w-full max-w-5xl bg-[#0a0a0a] border border-[#FFD700]/30 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-[#FFD700] rounded-full animate-pulse shadow-[0_0_10px_rgba(255,215,0,0.8)]" />
                  <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                    Inventory Audit & Valuation Intelligence
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Starting Stock vs Till-to-Date Value • Minimum Reorder Items • Dead vs Active Stock Analysis
                </p>
              </div>

              {/* Header Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadInventoryPDF}
                  disabled={isDownloadingPdf}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#FFD700] text-black font-black text-xs rounded-xl hover:bg-[#FFD700]/90 transition-all uppercase tracking-wider"
                >
                  {isDownloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  PDF Report
                </button>
                <button
                  onClick={downloadInventoryCSV}
                  disabled={isDownloadingCsv}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/10 text-white font-bold text-xs rounded-xl hover:bg-white/20 transition-all uppercase tracking-wider"
                >
                  {isDownloadingCsv ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} className="text-emerald-400" />}
                  Export CSV
                </button>
                <button 
                  onClick={() => setIsAuditModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors ml-2"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Subtabs */}
            <div className="px-6 pt-4 pb-2 border-b border-white/5 bg-[#050505] flex gap-2 overflow-x-auto">
              <button
                onClick={() => setAuditTab('overview')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                  auditTab === 'overview'
                    ? "bg-[#FFD700] text-black shadow-[0_0_15px_rgba(255,215,0,0.3)]"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                Executive Matrix
              </button>
              <button
                onClick={() => setAuditTab('reorder')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5",
                  auditTab === 'reorder'
                    ? "bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                    : "text-slate-400 hover:text-amber-300 hover:bg-white/5"
                )}
              >
                Reorder Watchlist
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/20 font-mono font-bold">
                  {inventorySummary.reorderItems.length}
                </span>
              </button>
              <button
                onClick={() => setAuditTab('dead')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5",
                  auditTab === 'dead'
                    ? "bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                    : "text-slate-400 hover:text-rose-300 hover:bg-white/5"
                )}
              >
                Dead Stock Analysis
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/20 font-mono font-bold">
                  {inventorySummary.deadItems.length}
                </span>
              </button>
              <button
                onClick={() => setAuditTab('ledger')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                  auditTab === 'ledger'
                    ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                    : "text-slate-400 hover:text-cyan-300 hover:bg-white/5"
                )}
              >
                Full Valuation Ledger
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* TAB 1: EXECUTIVE MATRIX */}
              {auditTab === 'overview' && (
                <div className="space-y-6">
                  {/* KPI Triad */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Inception vs Current Stock</p>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-400">Starting Stock:</span>
                          <span className="text-sm font-mono font-bold text-slate-300">
                            ${inventorySummary.totalStartingCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-400">Till-To-Date Stock:</span>
                          <span className="text-sm font-mono font-black text-[#FFD700]">
                            ${inventorySummary.totalCurrentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline pt-2 border-t border-white/5">
                          <span className="text-xs text-slate-400">Realized Revenue:</span>
                          <span className="text-xs font-mono font-bold text-emerald-400">
                            +${inventorySummary.totalRealizedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 border border-amber-500/20 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Reorder Requirements</p>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-400">Items Needing Restock:</span>
                          <span className="text-sm font-mono font-black text-amber-300">
                            {inventorySummary.reorderItems.length} products
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-400">Total Deficit Shortage:</span>
                          <span className="text-sm font-mono font-bold text-amber-400">
                            {inventorySummary.totalReorderDeficitUnits} units
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline pt-2 border-t border-white/5">
                          <span className="text-xs text-slate-400">Est. Replenishment Capital:</span>
                          <span className="text-xs font-mono font-bold text-amber-200">
                            ${inventorySummary.totalReorderCostEst.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 border border-rose-500/20 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Dead vs Active Liquidity</p>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-400">Dead Stock Dormant Capital:</span>
                          <span className="text-sm font-mono font-black text-rose-400">
                            ${inventorySummary.deadStockCapitalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-400">Active Stock Moving Capital:</span>
                          <span className="text-sm font-mono font-bold text-cyan-400">
                            ${inventorySummary.activeStockCapitalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline pt-2 border-t border-white/5">
                          <span className="text-xs text-slate-400">Dead Catalog Proportion:</span>
                          <span className="text-xs font-mono font-bold text-rose-300">
                            {inventorySummary.deadStockPercent.toFixed(1)}% of SKUs
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Narrative & Recommendations */}
                  <div className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                    <h4 className="text-sm font-black text-[#FFD700] uppercase tracking-wider flex items-center gap-2">
                      <TrendingUp size={16} />
                      Inventory Health & Capital Turnover Assessment
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Across your entire registered catalog of <strong className="text-white">{items.length} SKUs</strong>, you started with <strong className="text-white">{inventorySummary.totalStartingQty} units</strong> valued at <strong className="text-white">${inventorySummary.totalStartingCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>. Till-to-date, <strong className="text-emerald-400">{inventorySummary.totalUnitsSold} units</strong> have been sold, realizing <strong className="text-emerald-400">${inventorySummary.totalRealizedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> in gross revenue with an overall depletion rate of <strong className="text-[#FFD700]">{inventorySummary.depletionRate.toFixed(1)}%</strong>.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-1">Reorder Priority Action</span>
                        <p className="text-xs text-slate-300">
                          {inventorySummary.reorderItems.length > 0 ? (
                            <>There are <strong>{inventorySummary.reorderItems.length} products</strong> at or below minimum threshold (including <strong>{inventorySummary.outOfStockItems.length} completely out of stock</strong>). We recommend allocating <strong>${inventorySummary.totalReorderCostEst.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> to re-stock optimal levels.</>
                          ) : (
                            'All inventory levels are currently above minimum safety stock. No immediate reorders required.'
                          )}
                        </p>
                      </div>

                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                        <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-1">Dead Stock Liquidation Action</span>
                        <p className="text-xs text-slate-300">
                          {inventorySummary.deadItems.length > 0 ? (
                            <>There are <strong>{inventorySummary.deadItems.length} products</strong> with zero recorded movement, trapping <strong>${inventorySummary.deadStockCapitalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> in non-productive capital. Consider clearance discounting or bundling.</>
                          ) : (
                            '100% of your registered products have recorded sales activity. Zero dormant stock.'
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: REORDER WATCHLIST */}
              {auditTab === 'reorder' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider">
                        Minimum Stock Items ({inventorySummary.reorderItems.length})
                      </h4>
                      <p className="text-xs text-slate-500">Products at or below their configured minimum stock threshold</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                      Total Deficit: {inventorySummary.totalReorderDeficitUnits} units
                    </span>
                  </div>

                  {inventorySummary.reorderItems.length === 0 ? (
                    <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl">
                      <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
                      <p className="text-sm font-black text-white uppercase">All Inventory Levels Optimal</p>
                      <p className="text-xs text-slate-500 mt-1">No products are currently at or below minimum stock level.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-white/5 border-b border-white/10 text-slate-400 text-[10px] uppercase font-black">
                            <th className="p-3">Product</th>
                            <th className="p-3">Code</th>
                            <th className="p-3">Current Qty</th>
                            <th className="p-3">Min Level</th>
                            <th className="p-3">Deficit</th>
                            <th className="p-3">Suggested Order</th>
                            <th className="p-3">Unit Cost</th>
                            <th className="p-3">Est. Cost</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-medium">
                          {inventorySummary.reorderItems.map(item => (
                            <tr key={item.id} className="hover:bg-white/5">
                              <td className="p-3 font-bold text-white">{item.name}</td>
                              <td className="p-3 font-mono text-slate-400">{item.code || 'N/A'}</td>
                              <td className="p-3 font-black text-amber-400">{item.currentQty}</td>
                              <td className="p-3 text-slate-400">{item.minLevel}</td>
                              <td className="p-3 font-bold text-rose-400">{item.deficit > 0 ? `-${item.deficit}` : '0'}</td>
                              <td className="p-3 font-bold text-emerald-400">+{item.suggestedReorderQty}</td>
                              <td className="p-3 text-slate-400">${safeNum(item.cost_price).toFixed(2)}</td>
                              <td className="p-3 font-black text-[#FFD700]">${item.estimatedReorderCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className="p-3">
                                {item.isOutOfStock ? (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                    Out of Stock
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Low Stock
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: DEAD STOCK ANALYSIS */}
              {auditTab === 'dead' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-rose-400 uppercase tracking-wider">
                        Dead Stock Intelligence ({inventorySummary.deadItems.length} Products)
                      </h4>
                      <p className="text-xs text-slate-500">Products with zero recorded sales activity tying up liquidity</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-rose-300 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20">
                      Trapped Capital: ${inventorySummary.deadStockCapitalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {inventorySummary.deadItems.length === 0 ? (
                    <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl">
                      <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
                      <p className="text-sm font-black text-white uppercase">Zero Dead Stock</p>
                      <p className="text-xs text-slate-500 mt-1">Every product in your catalog has generated active customer sales!</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-white/5 border-b border-white/10 text-slate-400 text-[10px] uppercase font-black">
                            <th className="p-3">Product</th>
                            <th className="p-3">Code</th>
                            <th className="p-3">Dormant Qty</th>
                            <th className="p-3">Unit Cost</th>
                            <th className="p-3">Selling Price</th>
                            <th className="p-3">Capital Tied Up</th>
                            <th className="p-3">Turnover Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-medium">
                          {inventorySummary.deadItems.map(item => (
                            <tr key={item.id} className="hover:bg-white/5">
                              <td className="p-3 font-bold text-white">{item.name}</td>
                              <td className="p-3 font-mono text-slate-400">{item.code || 'N/A'}</td>
                              <td className="p-3 font-bold text-slate-200">{item.currentQty} units</td>
                              <td className="p-3 text-slate-400">${safeNum(item.cost_price).toFixed(2)}</td>
                              <td className="p-3 text-[#FFD700]">${safeNum(item.selling_price).toFixed(2)}</td>
                              <td className="p-3 font-black text-rose-400">${item.deadStockCapital.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-800 text-slate-400 border border-slate-700">
                                  0 Units Sold
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: FULL VALUATION LEDGER */}
              {auditTab === 'ledger' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-cyan-400 uppercase tracking-wider">
                        Complete Inception-to-Date Stock Ledger
                      </h4>
                      <p className="text-xs text-slate-500">Starting stock, units sold, current on-hand stock and till-to-date valuation</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#FFD700] bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                      Total Asset Value: ${inventorySummary.totalCurrentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-white/10 max-h-[50vh]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-[#121212] z-10 border-b border-white/10">
                        <tr className="text-slate-400 text-[10px] uppercase font-black">
                          <th className="p-3">Product Name</th>
                          <th className="p-3">Starting Qty</th>
                          <th className="p-3">Start Val ($)</th>
                          <th className="p-3">Sold Qty</th>
                          <th className="p-3">Current Qty</th>
                          <th className="p-3">Current Val ($)</th>
                          <th className="p-3">Health</th>
                          <th className="p-3">Movement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium">
                        {stockAnalytics.map(item => (
                          <tr key={item.id} className="hover:bg-white/5">
                            <td className="p-3 font-bold text-white">
                              {item.name}
                              <span className="text-[10px] text-slate-500 font-mono block">{item.code || 'N/A'}</span>
                            </td>
                            <td className="p-3 font-bold text-slate-300">{item.startingQty}</td>
                            <td className="p-3 font-mono text-slate-400">${item.startingCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 font-bold text-emerald-400">+{item.unitsSold}</td>
                            <td className="p-3 font-black text-white">{item.currentQty}</td>
                            <td className="p-3 font-black text-[#FFD700]">${item.currentCostVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="p-3">
                              {item.isOutOfStock ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-500/20 text-rose-400">Out</span>
                              ) : item.needsReorder ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500/20 text-amber-300">Low</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400">Optimal</span>
                              )}
                            </td>
                            <td className="p-3">
                              {item.isDeadStock ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-800 text-slate-400">Dead</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-cyan-500/10 text-cyan-300">Active</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-white/10 bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-slate-500 font-mono">
                RetailOS Financial Engine • Instant PDF & CSV Generation Ready
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadInventoryCSV}
                  disabled={isDownloadingCsv}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-white/10 flex items-center gap-1.5"
                >
                  <FileSpreadsheet size={14} className="text-emerald-400" />
                  Export CSV
                </button>
                <button
                  onClick={downloadInventoryPDF}
                  disabled={isDownloadingPdf}
                  className="px-5 py-2.5 bg-[#FFD700] text-black rounded-xl text-xs font-black uppercase tracking-wider transition-all hover:bg-[#FFD700]/90 shadow-[0_0_20px_rgba(255,215,0,0.2)] flex items-center gap-1.5"
                >
                  {isDownloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Download Official PDF Report
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CRUD Modal: Register or Modify Asset (Preserved with 100% integrity) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[130] flex justify-end">
          <div className="absolute inset-0 bg-[#0a0a0a]/80 backdrop-blur-md" onClick={() => {
            setIsModalOpen(false);
            setEditingItem(null);
          }} />
          <div className="relative w-full max-w-md bg-[#0a0a0a] border-l border-white/10 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div>
                <h2 className="text-xl font-black text-[#FFD700] uppercase tracking-tighter">
                  {editingItem ? 'Modify Asset' : 'Register New Asset'}
                </h2>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">
                  Vault Entry Protocol
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingItem(null);
                }} 
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-500 hover:text-[#FFD700]"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Product Name</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#FFD700]/50 outline-none font-bold text-white placeholder:text-slate-800"
                  placeholder="Official Product Name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Database Code (SKU)</label>
                <input 
                  required
                  type="text" 
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value})}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#FFD700]/50 outline-none font-mono text-sm text-white placeholder:text-slate-800"
                  placeholder="UNIQUE_CODE_001"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cost Price ($)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.cost_price || 0}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setFormData({...formData, cost_price: isNaN(val) ? 0 : val});
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#FFD700]/50 outline-none font-bold text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Selling Price ($)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.selling_price || 0}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setFormData({...formData, selling_price: isNaN(val) ? 0 : val});
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#FFD700]/50 outline-none font-black text-[#FFD700]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Category Mapping</label>
                <select 
                  required
                  value={formData.category_id}
                  onChange={e => {
                    const id = parseInt(e.target.value);
                    setFormData({
                      ...formData, 
                      category_id: id,
                      category: CATEGORY_MAP[id] || 'Other'
                    });
                  }}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#FFD700]/50 outline-none appearance-none font-black text-white"
                >
                  <option value={1}>1 - Oils</option>
                  <option value={2}>2 - Spare Parts</option>
                  <option value={3}>3 - Electrical Spares</option>
                </select>
                <p className="text-[10px] text-slate-600 italic">Maps to Integer ID and Text Category in table.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantity</label>
                  <input 
                    required
                    type="number" 
                    value={formData.quantity || 0}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      setFormData({...formData, quantity: isNaN(val) ? 0 : val});
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#FFD700]/50 outline-none text-white font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Min Stock Level</label>
                  <input 
                    required
                    type="number" 
                    value={formData.min_stock_level || 0}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      setFormData({...formData, min_stock_level: isNaN(val) ? 0 : val});
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#FFD700]/50 outline-none text-white font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                <input 
                  type="checkbox"
                  id="active-checkbox"
                  checked={formData.active}
                  onChange={e => setFormData({...formData, active: e.target.checked})}
                  className="w-5 h-5 rounded border-white/10 bg-transparent text-[#FFD700] focus:ring-[#FFD700]"
                />
                <label htmlFor="active-checkbox" className="text-xs font-black text-slate-400 cursor-pointer uppercase tracking-tighter">
                  Active in Inventory
                </label>
              </div>
            </form>

            <div className="p-8 border-t border-white/10 bg-white/5 flex gap-4">
              <button 
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingItem(null);
                }}
                className="flex-1 px-4 py-4 border border-white/10 rounded-2xl text-xs font-black text-slate-500 hover:bg-white/5 transition-all uppercase tracking-tighter"
              >
                Discard
              </button>
              <button 
                onClick={handleSubmit}
                className="flex-1 px-4 py-4 bg-[#FFD700] text-[#0a0a0a] rounded-2xl text-xs font-black hover:bg-[#FFD700]/90 transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)] uppercase tracking-tighter"
              >
                {editingItem ? 'Execute Update' : 'Execute Insert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
