import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { InventoryItem, Category } from '../types';
import { Search, Plus, Filter, MoreVertical, Package, AlertCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form state
  const [newItem, setNewItem] = useState({
    name: '',
    sku: '',
    cost: 0,
    selling_price: 0,
    category_id: '',
    status: 'in_stock'
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch items and categories separately to avoid "relationship not found" errors
      // if the foreign key constraint is missing in the database.
      const [itemsRes, catsRes] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('categories').select('*')
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (catsRes.error) throw catsRes.error;

      const categoriesMap = (catsRes.data || []).reduce((acc, cat) => {
        acc[cat.id] = cat;
        return acc;
      }, {} as Record<string, Category>);

      const joinedItems = (itemsRes.data || []).map(item => ({
        ...item,
        categories: categoriesMap[item.category_id]
      }));

      setItems(joinedItems);
      setCategories(catsRes.data || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
      const msg = (err as any).message || 'Failed to fetch inventory';
      
      if (msg.includes('relationship')) {
        setError('Database Relationship Error: The "inventory" table is missing a Foreign Key constraint to "categories". Please run the SQL fix below.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('inventory')
        .insert([newItem]);
      
      if (error) throw error;
      
      setIsModalOpen(false);
      setNewItem({
        name: '',
        sku: '',
        cost: 0,
        selling_price: 0,
        category_id: '',
        status: 'in_stock'
      });
      fetchData();
    } catch (err) {
      alert('Error adding item: ' + (err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by name or SKU..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <Filter size={16} />
            Filter
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            New Item
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-bottom border-slate-200">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cost</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center text-rose-600 max-w-xl mx-auto">
                      <AlertCircle size={32} className="mb-2" />
                      <p className="font-medium">Error: {error}</p>
                      {error.includes('Relationship') && (
                        <div className="mt-4 p-4 bg-slate-900 text-slate-100 rounded-lg text-left font-mono text-xs w-full overflow-x-auto">
                          <p className="text-slate-400 mb-2">-- Run this in Supabase SQL Editor:</p>
                          <code>
                            ALTER TABLE inventory<br />
                            ADD CONSTRAINT fk_category<br />
                            FOREIGN KEY (category_id)<br />
                            REFERENCES categories(id);
                          </code>
                        </div>
                      )}
                      <p className="text-xs mt-4 text-rose-500">Check RLS policies or credentials if the error persists.</p>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="max-w-md mx-auto">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                        <Package size={24} />
                      </div>
                      <h3 className="text-slate-900 font-semibold text-lg">No Items Found</h3>
                      <p className="text-slate-500 text-sm mt-2">
                        We connected to Supabase, but the <strong>inventory</strong> table returned 0 rows.
                      </p>
                      
                      <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl text-left">
                        <p className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-3">Why is this empty?</p>
                        <ul className="text-xs text-blue-700 space-y-2 list-disc pl-4">
                          <li>
                            <strong>Row Level Security (RLS):</strong> Your table likely has RLS enabled but no policy. 
                            Go to Supabase &gt; Authentication &gt; Policies and add a "SELECT" policy for the <code>anon</code> role.
                          </li>
                          <li>
                            <strong>Table Name:</strong> Ensure your table is named exactly <code>inventory</code> (all lowercase).
                          </li>
                          <li>
                            <strong>Data Sync:</strong> If you just added data, try refreshing the page.
                          </li>
                        </ul>
                      </div>
                      
                      <button 
                        onClick={() => fetchData()}
                        className="mt-6 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                      >
                        Refresh Data
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    No items found matching "{searchTerm}".
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                          <Package size={20} />
                        </div>
                        <span className="font-medium text-slate-900">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{item.sku}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded">
                        {item.categories?.name || 'Uncategorized'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">${(item.cost ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">${(item.selling_price ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-xs font-medium px-2 py-1 rounded-full",
                        item.status === 'in_stock' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      )}>
                        {(item.status || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-1 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all">
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Item Modal (Slide-over style) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Add New Inventory Item</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Product Name</label>
                <input 
                  required
                  type="text" 
                  value={newItem.name}
                  onChange={e => setNewItem({...newItem, name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Wireless Mouse"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">SKU</label>
                <input 
                  required
                  type="text" 
                  value={newItem.sku}
                  onChange={e => setNewItem({...newItem, sku: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="WM-001"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Cost Price ($)</label>
                  <input 
                    required
                    type="number" 
                    value={newItem.cost}
                    onChange={e => setNewItem({...newItem, cost: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Selling Price ($)</label>
                  <input 
                    required
                    type="number" 
                    value={newItem.selling_price}
                    onChange={e => setNewItem({...newItem, selling_price: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Category</label>
                <select 
                  required
                  value={newItem.category_id}
                  onChange={e => setNewItem({...newItem, category_id: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
                >
                  <option value="">Select a category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Initial Status</label>
                <select 
                  value={newItem.status}
                  onChange={e => setNewItem({...newItem, status: e.target.value as any})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
                >
                  <option value="in_stock">In Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                </select>
              </div>
            </form>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddItem}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Save Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
