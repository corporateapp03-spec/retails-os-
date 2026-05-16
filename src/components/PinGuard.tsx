import React, { useState, useEffect } from 'react';
import { Lock, Delete, ArrowRight, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface PinGuardProps {
  children: React.ReactNode;
  protectedPages: string[];
  activePage: string;
}

export default function PinGuard({ children, protectedPages, activePage }: PinGuardProps) {
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [error, setError] = useState(false);

  // The Golden PIN from env or default
  const [masterPin, setMasterPin] = useState(() => {
    return localStorage.getItem('retailos_manager_pin') || import.meta.env.VITE_MANAGER_PIN || '7007';
  });

  useEffect(() => {
    // Sync PIN if it changes in localStorage from settings
    const handleStorage = () => {
      const saved = localStorage.getItem('retailos_manager_pin');
      if (saved) setMasterPin(saved);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    // Volatile Security: Reset unlock status on every page change
    setIsUnlocked(false);
    setPin('');
    setError(false);
  }, [activePage]);

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin === masterPin) {
      setIsUnlocked(true);
      setPin('');
    } else {
      setError(true);
      setPin('');
    }
  };

  // Auto-submit when 4 digits are entered
  useEffect(() => {
    if (pin.length === 4) {
      const timer = setTimeout(() => handleSubmit(), 300);
      return () => clearTimeout(timer);
    }
  }, [pin]);

  // Global Keyboard Support
  useEffect(() => {
    if (!protectedPages.includes(activePage) || isUnlocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Numbers 0-9 (top row and numpad)
      if (/^[0-9]$/.test(e.key)) {
        handleNumberClick(e.key);
      }
      // Backspace to delete
      else if (e.key === 'Backspace') {
        handleDelete();
      }
      // Enter to submit (though auto-submit handles 4 digits)
      else if (e.key === 'Enter' && pin.length === 4) {
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, protectedPages, activePage, isUnlocked]);

  if (!protectedPages.includes(activePage) || isUnlocked) {
    return <>{children}</>;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-pin-pad bg-[#0a0a0a] flex flex-col items-center justify-center p-4 overflow-hidden"
    >
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#FFD700]/10 blur-[150px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#FFD700]/10 blur-[150px] rounded-full animate-pulse delay-1000" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-12">
          <motion.div 
            animate={error ? { x: [-10, 10, -10, 10, 0], scale: [1, 1.1, 1] } : {}}
            className={cn(
              "inline-flex items-center justify-center w-24 h-24 rounded-[2.5rem] mb-8 border-2 transition-all duration-500 shadow-2xl",
              error 
                ? "border-red-500 bg-red-500/10 text-red-500 shadow-red-500/20" 
                : "border-[#FFD700]/30 bg-[#FFD700]/5 text-[#FFD700] shadow-[#FFD700]/20"
            )}
          >
            {error ? <ShieldAlert size={48} /> : <Lock size={48} />}
          </motion.div>
          <h1 className="text-4xl font-black text-[#FFD700] tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]">Manager Vault</h1>
          <p className="text-slate-500 mt-3 text-sm font-black uppercase tracking-widest opacity-80">Restricted Access • Authorization Required</p>
        </div>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-6 mb-16">
          {[0, 1, 2, 3].map((i) => (
            <motion.div 
              key={i}
              initial={false}
              animate={{
                scale: pin.length > i ? 1.2 : 1,
                backgroundColor: pin.length > i ? "#FFD700" : "transparent"
              }}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-all duration-300",
                pin.length > i 
                  ? "border-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.8)]" 
                  : "border-slate-800"
              )}
            />
          ))}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-6 max-w-[360px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              className="aspect-square flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-[2rem] hover:bg-[#FFD700]/10 hover:border-[#FFD700]/50 hover:text-[#FFD700] transition-all active:scale-90 group relative overflow-hidden"
            >
              <span className="text-3xl font-black text-white group-hover:text-[#FFD700] transition-colors z-10">{num}</span>
              <div className="absolute inset-0 bg-gradient-to-br from-[#FFD700]/0 to-[#FFD700]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
          <div />
          <button
            onClick={() => handleNumberClick('0')}
            className="aspect-square flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-[2rem] hover:bg-[#FFD700]/10 hover:border-[#FFD700]/50 hover:text-[#FFD700] transition-all active:scale-90 group relative overflow-hidden"
          >
            <span className="text-3xl font-black text-white group-hover:text-[#FFD700] transition-colors z-10">0</span>
            <div className="absolute inset-0 bg-gradient-to-br from-[#FFD700]/0 to-[#FFD700]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button
            onClick={handleDelete}
            className="aspect-square flex items-center justify-center text-slate-500 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-500 transition-all active:scale-90"
          >
            <Delete size={32} />
          </button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center mt-12"
            >
              <span className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-full text-red-500 text-[10px] font-black uppercase tracking-[0.2em]">
                Invalid Authorization PIN
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      <div className="absolute bottom-8 text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">
        Secure RetailOS Terminal v4.0
      </div>
    </motion.div>
  );
}
