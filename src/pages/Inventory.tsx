import React, { useEffect, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
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
  1: 'Oils',
  2: 'Spare Parts',
  3: 'Electrical Spares'
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

  async function fetchData() {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('inventory')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;
      setItems(data || []);
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

  // Pure Reader Logic: Totals are derived from the absolute source of truth (the items array)
  const safeNum = (val: any) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const totalAssetValue = items.reduce((acc, item) => acc + (safeNum(item?.cost_price) * safeNum(item?.quantity)), 0);

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
      {/* Asset Valuation Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#050505] border border-white/5 rounded-3xl p-6 shadow-2xl flex items-center justify-between group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFD700]/5 blur-[40px] rounded-full" />
          <div className="relative z-10">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Total Asset Value</p>
            <h2 className="text-3xl font-black mt-2 flex items-baseline gap-1 text-white group-hover:gold-text transition-all">
              <span className="text-[#FFD700] text-xl">$</span>
              {totalAssetValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h2>
            <p className="text-[10px] text-slate-600 mt-2 font-mono uppercase tracking-tighter">Inventory Liquidity</p>
          </div>
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-[#FFD700] border border-white/5 group-hover:gold-glow transition-all">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="vault-card p-6 flex items-center justify-between group">
          <div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Stock Items</p>
            <h2 className="text-3xl font-black mt-2 text-white group-hover:gold-text transition-all">
              {items.length}
            </h2>
          </div>
          <Package size={32} className="text-white/10 group-hover:text-[#FFD700]/20 transition-colors" />
        </div>

        <div className="vault-card p-6 flex items-center justify-between group">
          <div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">System Status</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 bg-[#FFD700] rounded-full animate-pulse shadow-[0_0_10px_rgba(255,215,0,0.5)]" />
              <span className="text-sm font-black text-white uppercase tracking-tighter">Live Connection</span>
            </div>
          </div>
          <TrendingUp size={32} className="text-white/10 group-hover:text-[#FFD700]/20 transition-colors" />
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

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
          <input 
            type="text" 
            placeholder="Search by name or code..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm focus:border-[#FFD700]/50 outline-none transition-all text-white placeholder:text-slate-700 font-medium"
          />
        </div>
        <button 
          onClick={() => {
            setEditingItem(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-[#FFD700] text-[#0a0a0a] rounded-2xl text-sm font-black hover:bg-[#FFD700]/90 transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)] active:scale-95 uppercase tracking-tighter"
        >
          <Plus size={18} />
          Register Item
        </button>
      </div>

      {/* Inventory Table & Mobile List */}
      <div className="vault-card overflow-hidden">
        {/* Desktop Table */}
        <div className="desktop-table w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Product Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Code</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cost</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Price</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Stock (Min Level)</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="max-w-xs mx-auto">
                      <Package size={40} className="mx-auto text-slate-800 mb-4" />
                      <p className="text-slate-500 font-black uppercase tracking-tighter">No inventory records found.</p>
                      <p className="text-[10px] text-slate-600 mt-1 uppercase">Check your Supabase connection or filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item?.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="font-bold text-white block group-hover:gold-text transition-colors">{item?.name || 'Unnamed Product'}</span>
                      <span className="text-[10px] text-slate-600 font-mono">{item?.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-mono bg-white/5 px-2 py-1 rounded border border-white/10 text-slate-400">
                        {item?.code || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">
                        {CATEGORY_MAP[item?.category_id] || `ID: ${item?.category_id}`}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-500">
                        ${safeNum(item?.cost_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-black text-[#FFD700]">
                        ${safeNum(item?.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white">{item?.quantity ?? 0}</span>
                        <span className="text-[10px] text-slate-600 font-bold uppercase">
                          (Min: {item?.min_stock_level ?? 5})
                        </span>
                      </div>
                    </td>
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
        <div className="mobile-card-list p-4">
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
                    <p className="text-[10px] text-slate-600 font-mono">{item.code}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingItem(item)} className="p-2 bg-white/5 rounded-lg text-slate-400"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 bg-rose-500/10 rounded-lg text-rose-500"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Category</p>
                    <p className="text-xs font-bold text-slate-400">{CATEGORY_MAP[item.category_id] || 'Other'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Stock Level</p>
                    <p className="text-xs font-bold text-white">{item.quantity} <span className="text-[9px] text-slate-600">(Min: {item.min_stock_level})</span></p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Cost Price</p>
                    <p className="text-xs font-bold text-slate-500">${safeNum(item.cost_price).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Selling Price</p>
                    <p className="text-xs font-black text-[#FFD700]">${safeNum(item.selling_price).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CRUD Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex justify-end">
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
