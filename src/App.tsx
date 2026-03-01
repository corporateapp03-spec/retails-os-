import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package,
  ShoppingCart, 
  History,
  Menu, 
  X,
  Search,
  ShieldCheck
} from 'lucide-react';
import { cn } from './lib/utils';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Sales from './pages/Sales';
import Outflow from './pages/Outflow';

type Page = 'dashboard' | 'inventory' | 'pos' | 'sales' | 'outflow';

export default function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'pos', label: 'POS', icon: ShoppingCart },
    { id: 'sales', label: 'Sales Archive', icon: History },
    { id: 'outflow', label: 'Outflow Guardian', icon: ShieldCheck },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-slate-900 text-white transition-all duration-300 ease-in-out flex flex-col",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          <div className={cn("font-bold text-xl tracking-tight text-blue-400", !isSidebarOpen && "hidden")}>
            RetailOS
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 hover:bg-slate-800 rounded-md transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id as Page)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                activePage === item.id 
                  ? "bg-blue-600 text-white" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon size={20} className={cn(activePage === item.id ? "text-white" : "group-hover:text-white")} />
              <span className={cn("font-medium", !isSidebarOpen && "hidden")}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className={cn("flex items-center gap-3 px-3 py-2", !isSidebarOpen && "justify-center")}>
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
              AD
            </div>
            {isSidebarOpen && (
              <div className="flex flex-col">
                <span className="text-sm font-medium">Admin User</span>
                <span className="text-xs text-slate-500">corporate@retailos.com</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-semibold text-slate-800 capitalize">
            {activePage}
          </h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Global search..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 rounded-full text-sm w-64 transition-all outline-none"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {activePage === 'dashboard' && <Dashboard />}
          {activePage === 'inventory' && <Inventory />}
          {activePage === 'pos' && <POS />}
          {activePage === 'sales' && <Sales />}
          {activePage === 'outflow' && <Outflow />}
        </div>
      </main>
    </div>
  );
}
