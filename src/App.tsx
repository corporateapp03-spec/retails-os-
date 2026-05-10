import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package,
  ShoppingCart, 
  History,
  Menu, 
  X,
  Search,
  ShieldCheck,
  PieChart,
  TrendingUp,
  LogOut,
  User,
  Zap
} from 'lucide-react';
import { cn } from './lib/utils';
import { supabase, isConfigured } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Sales from './pages/Sales';
import Outflow from './pages/Outflow';
import ProfitDistribution from './pages/ProfitDistribution';
import StrategicDecision from './pages/StrategicDecision';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import PinGuard from './components/PinGuard';
import ThemeSwitcher from './components/ThemeSwitcher';
import { SafeRender } from './components/SafeRender';
import { AlertTriangle, Key, ExternalLink } from 'lucide-react';

type Page = 'dashboard' | 'inventory' | 'pos' | 'sales' | 'outflow' | 'strategic-decision' | 'profit-distribution';

export default function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('retailos_theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    // Apply theme class to body
    if (theme === 'light') {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
    localStorage.setItem('retailos_theme', theme);
  }, [theme]);

  useEffect(() => {
    // If not configured, we don't even try to get session to avoid "Failed to fetch"
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // Check initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch((err) => {
        console.error('Initial session fetch failed:', err);
        // If it's a fetch error, we might want to flag it
        if (err.message === 'Failed to fetch') {
          // This will be caught by the sub-components or we can show a global error
          // For now we just let it go and components will show their own error states
        }
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true);
      }
    });

    // SECURITY: Sign out on tab switch, refresh, or close
    const handleSecurityExit = () => {
      supabase.auth.signOut();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleSecurityExit();
      }
    };

    window.addEventListener('beforeunload', handleSecurityExit);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleSecurityExit);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0a] flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFD700]"></div>
        <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] animate-pulse">Establishing Secure Connection...</p>
      </div>
    );
  }

  if (isResettingPassword) {
    return <ResetPassword onComplete={() => setIsResettingPassword(false)} />;
  }

  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="vault-card p-12 text-center max-w-xl w-full border-[#FFD700]/30 shadow-[0_0_50px_rgba(255,215,0,0.1)]">
          <div className="w-20 h-20 bg-[#FFD700]/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-[#FFD700]/20">
            <AlertTriangle className="text-[#FFD700]" size={40} />
          </div>
          <h2 className="text-white font-black uppercase tracking-tighter text-3xl mb-4">Connection Required</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-md mx-auto font-medium">
            The RetailOS core is currently disconnected from its central database. To proceed, you must configure your Supabase credentials in the AI Studio Secrets panel.
          </p>
          
          <div className="grid gap-4 mb-10">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-left flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <Key className="text-blue-400" size={16} />
              </div>
              <div>
                <p className="text-white text-[10px] font-black uppercase tracking-widest mb-1">VITE_SUPABASE_URL</p>
                <p className="text-slate-500 text-[10px] font-mono break-all">Your project URL from Supabase dashboard</p>
              </div>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-left flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Key className="text-emerald-400" size={16} />
              </div>
              <div>
                <p className="text-white text-[10px] font-black uppercase tracking-widest mb-1">VITE_SUPABASE_ANON_KEY</p>
                <p className="text-slate-500 text-[10px] font-mono break-all">The "anon" public API key</p>
              </div>
            </div>
          </div>

          <a 
            href="https://supabase.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="gold-btn w-full py-4 flex items-center justify-center gap-3 no-underline"
          >
            <ExternalLink size={20} />
            <span>Launch Supabase Console</span>
          </a>
          
          <p className="text-slate-600 text-[10px] mt-8 uppercase font-black tracking-[0.2em]">
            System Offline • Standing By for Authorization
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <SafeRender>
        <Login />
      </SafeRender>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'pos', label: 'POS', icon: ShoppingCart },
    { id: 'sales', label: 'Sales Archive', icon: History },
    { id: 'outflow', label: 'Outflow Guardian', icon: ShieldCheck },
    { id: 'strategic-decision', label: 'Strategic Hub', icon: Zap },
    { id: 'profit-distribution', label: 'Profit Distribution', icon: TrendingUp },
  ];

  return (
    <SafeRender>
      <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden selection:bg-[#FFD700]/30 relative">
        {/* Mobile Overlay */}
        {isMobile && isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[950] animate-in fade-in duration-300"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside 
          className={cn(
            "bg-[#050505] text-white transition-all duration-500 ease-in-out flex flex-col border-r border-white/5 relative z-sidebar",
            isMobile 
              ? cn("fixed inset-y-0 left-0 z-[1000] w-72", !isSidebarOpen && "-translate-x-full")
              : cn(isSidebarOpen ? "w-72" : "w-20")
          )}
        >
        <div className="p-8 flex items-center justify-between">
          <div className={cn("font-black text-2xl tracking-tighter text-[#FFD700] drop-shadow-[0_0_15px_rgba(255,215,0,0.4)] transition-all duration-500", !isSidebarOpen && "opacity-0 scale-50 pointer-events-none")}>
            RETAIL<span className="text-white">OS</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-[#FFD700] border border-transparent hover:border-white/10"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id as Page)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                activePage === item.id 
                  ? "bg-[#FFD700] text-[#0a0a0a] shadow-[0_0_25px_rgba(255,215,0,0.2)]" 
                  : "text-slate-500 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={20} className={cn("transition-transform duration-300 group-hover:scale-110", activePage === item.id ? "text-[#0a0a0a]" : "group-hover:text-[#FFD700]")} />
              <span className={cn("font-black text-xs uppercase tracking-widest transition-all duration-500", !isSidebarOpen && "opacity-0 translate-x-10 pointer-events-none")}>
                {item.label}
              </span>
              {activePage === item.id && (
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-[#0a0a0a]/20" />
              )}
            </button>
          ))}
          
          <div className="pt-6 pb-2">
            <ThemeSwitcher theme={theme} setTheme={setTheme} isSidebarOpen={isSidebarOpen} />
          </div>
        </nav>

        <div className="p-6 border-t border-white/5 space-y-4">
          <div className={cn("flex items-center gap-4 px-2 py-2 rounded-2xl bg-white/5 border border-white/5 transition-all duration-500", !isSidebarOpen && "justify-center bg-transparent border-transparent")}>
            <div className="w-10 h-10 rounded-xl bg-[#FFD700] flex items-center justify-center text-[#0a0a0a] font-black shrink-0 shadow-[0_0_15px_rgba(255,215,0,0.3)]">
              <User size={20} />
            </div>
            {isSidebarOpen && (
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-black uppercase tracking-tighter truncate text-white">{session.user.email?.split('@')[0]}</span>
                <span className="text-[10px] text-slate-500 truncate font-mono">{session.user.email}</span>
              </div>
            )}
          </div>
          <button 
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-500 transition-all duration-300 border border-transparent hover:border-rose-500/20",
              !isSidebarOpen && "justify-center"
            )}
          >
            <LogOut size={20} />
            {isSidebarOpen && <span className="text-xs font-black uppercase tracking-widest">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between px-4 md:px-10 shrink-0 relative z-40">
          <div className="flex items-center gap-4">
            {isMobile && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-[#FFD700]"
              >
                <Menu size={24} />
              </button>
            )}
            <div className="h-8 w-1 bg-[#FFD700] rounded-full hidden sm:block" />
            <h1 className="text-lg md:text-2xl font-black text-white uppercase tracking-tighter truncate max-w-[150px] sm:max-w-none">
              {activePage.replace('-', ' ')}
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative group hidden md:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-[#FFD700] transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Global vault search..." 
                className="pl-12 pr-6 py-2.5 bg-white/5 border border-white/10 focus:border-[#FFD700]/50 rounded-2xl text-xs w-72 transition-all outline-none text-white placeholder:text-slate-700 font-medium"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-10 relative custom-scrollbar w-full">
          {/* Background Glows */}
          <div className="absolute top-0 right-0 w-full sm:w-[800px] h-[800px] bg-[#FFD700]/5 blur-[150px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-full sm:w-[600px] h-[600px] bg-blue-500/5 blur-[150px] rounded-full pointer-events-none" />
          
          <div className="relative z-10 w-full max-w-[1400px] mx-auto">
            <PinGuard protectedPages={['dashboard', 'outflow', 'sales', 'strategic-decision', 'profit-distribution']} activePage={activePage}>
              {activePage === 'dashboard' && <Dashboard />}
              {activePage === 'inventory' && <Inventory />}
              {activePage === 'pos' && <POS />}
              {activePage === 'sales' && <Sales />}
              {activePage === 'outflow' && <Outflow />}
              {activePage === 'strategic-decision' && <StrategicDecision />}
              {activePage === 'profit-distribution' && <ProfitDistribution />}
            </PinGuard>
          </div>
        </div>
      </main>
    </div>
    </SafeRender>
  );
}
