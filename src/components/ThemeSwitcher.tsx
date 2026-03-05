import React from 'react';
import { Sun, Moon, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface ThemeSwitcherProps {
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  isSidebarOpen?: boolean;
}

export default function ThemeSwitcher({ theme, setTheme, isSidebarOpen = true }: ThemeSwitcherProps) {
  return (
    <div className={cn(
      "vault-card p-4 flex flex-col gap-4",
      !isSidebarOpen && "items-center p-2"
    )}>
      {isSidebarOpen && (
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={14} className="text-[#FFD700]" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Luxury Interface</span>
        </div>
      )}
      
      <div className={cn(
        "flex gap-2",
        !isSidebarOpen && "flex-col"
      )}>
        <button
          onClick={() => setTheme('dark')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all duration-300 border",
            theme === 'dark' 
              ? "bg-[#FFD700] border-[#FFD700] text-[#0a0a0a] shadow-[0_0_15px_rgba(255,215,0,0.3)]" 
              : "bg-white/5 border-white/10 text-slate-500 hover:border-white/20"
          )}
          title="Golden Dark"
        >
          <Moon size={16} />
          {isSidebarOpen && <span className="text-[10px] font-black uppercase tracking-widest">Golden Dark</span>}
        </button>

        <button
          onClick={() => setTheme('light')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all duration-300 border",
            theme === 'light' 
              ? "bg-[#1a1a1a] border-[#1a1a1a] text-white shadow-lg" 
              : "bg-white/5 border-white/10 text-slate-500 hover:border-white/20"
          )}
          title="Clean White"
        >
          <Sun size={16} />
          {isSidebarOpen && <span className="text-[10px] font-black uppercase tracking-widest">Clean White</span>}
        </button>
      </div>
    </div>
  );
}
