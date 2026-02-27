import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { InventoryItem } from '../types';
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
  AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';

const CATEGORY_MAP: Record<number, string> = {
  1: 'Parts',
  2: 'Oils',
  3: 'Electrical'
};

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    cost_price: 0,
    selling_price: 0,
    category_id: 1,
    min_stock: 0,
    max_stock: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem?.name || '',
        code: editingItem?.code || '',
        cost_price: editingItem?.cost_price || 0,
        selling_price: editingItem?.selling_price || 0,
        category_id: editingItem?.category_id || 1,
        min_stock: editingItem?.min_stock || 0,
        max_stock: editingItem?.max_stock || 0
      });
      setIsModalOpen(true);
    } else {
      setFormData({
        name: '',
        code: '',
        cost_price: 0,
        selling_price: 0,
        category_id: 1,
        min_stock: 0,
        max_stock: 0
      });
    }
  }, [editingItem]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('inventory')
        .select('*');

      if (fetchError) throw fetchError;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setError((err as any)?.message || 'Failed to fetch inventory data from Supabase.');
    } finally {
      setLoading(false);
    }
  }

  const totalAssetValue = items.reduce((acc, item) => acc + (item?.cost_price || 0), 0);

  const filteredItems = items.filter(item => 
    (item?.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (item?.code || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

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
        const { error: insertError } = await supabase
          .from('inventory')
          .insert([formData]);
        
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
      {/* Asset Valuation Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Total Asset Value</p>
            <h2 className="text-3xl font-black mt-2 flex items-baseline gap-1">
              <span className="text-blue-400 text-xl">$</span>
              {totalAssetValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h2>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">SUM(inventory.cost_price)</p>
          </div>
          <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-blue-400">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Stock Items</p>
            <h2 className="text-3xl font-black mt-2 text-slate-900">
              {items.length}
            </h2>
          </div>
          <Package size={32} className="text-slate-200" />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">System Status</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-slate-700">Live Connection</span>
            </div>
          </div>
          <TrendingUp size={32} className="text-slate-200" />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="text-rose-600 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-bold text-rose-900">Database Error Detected</p>
            <p className="text-xs text-rose-700 mt-1 font-mono">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by name or code..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
        <button 
          onClick={() => {
            setEditingItem(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
        >
          <Plus size={18} />
          Add Item
        </button>
      </div>

      {/* Inventory Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Code</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Price</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock (Min/Max)</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="max-w-xs mx-auto">
                      <Package size={40} className="mx-auto text-slate-200 mb-4" />
                      <p className="text-slate-500 font-medium">No inventory records found.</p>
                      <p className="text-[10px] text-slate-400 mt-1">Check your Supabase connection or filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item?.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-900 block">{item?.name || 'Unnamed Product'}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{item?.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
                        {item?.code || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-700">
                        {CATEGORY_MAP[item?.category_id] || `ID: ${item?.category_id}`}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-600">
                        ${(item?.cost_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-black text-blue-600">
                        ${(item?.selling_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{item?.quantity ?? 0}</span>
                        <span className="text-[10px] text-slate-400">
                          ({item?.min_stock ?? 0} / {item?.max_stock ?? 0})
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => setEditingItem(item)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit Item"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
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
      </div>

      {/* CRUD Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => {
            setIsModalOpen(false);
            setEditingItem(null);
          }} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {editingItem ? 'Modify Item' : 'Register New Item'}
                </h2>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">
                  Database Reader/Writer Mode
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingItem(null);
                }} 
                className="p-2 hover:bg-white rounded-full transition-colors shadow-sm"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Name</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  placeholder="Official Product Name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Database Code (SKU)</label>
                <input 
                  required
                  type="text" 
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value})}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                  placeholder="UNIQUE_CODE_001"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost Price ($)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.cost_price}
                    onChange={e => setFormData({...formData, cost_price: parseFloat(e.target.value)})}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selling Price ($)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.selling_price}
                    onChange={e => setFormData({...formData, selling_price: parseFloat(e.target.value)})}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category Mapping</label>
                <select 
                  required
                  value={formData.category_id}
                  onChange={e => setFormData({...formData, category_id: parseInt(e.target.value)})}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white font-bold text-slate-700"
                >
                  <option value={1}>1 - Parts</option>
                  <option value={2}>2 - Oils</option>
                  <option value={3}>3 - Electrical</option>
                </select>
                <p className="text-[10px] text-slate-400 italic">Maps to Integer ID in categories table.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Min Stock</label>
                  <input 
                    required
                    type="number" 
                    value={formData.min_stock}
                    onChange={e => setFormData({...formData, min_stock: parseInt(e.target.value)})}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Max Stock</label>
                  <input 
                    required
                    type="number" 
                    value={formData.max_stock}
                    onChange={e => setFormData({...formData, max_stock: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </form>

            <div className="p-8 border-t border-slate-100 bg-slate-50 flex gap-4">
              <button 
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingItem(null);
                }}
                className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-white transition-all"
              >
                Discard
              </button>
              <button 
                onClick={handleSubmit}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
              >
                {editingItem ? 'Commit Update' : 'Commit Insert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
