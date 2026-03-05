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
  const [isClosing, setIsClosing] = useState(false);

  // The Golden PIN
  const MASTER_PIN = '7007';

  useEffect(() => {
    // Check session storage on mount and when activePage changes
    const unlocked = sessionStorage.getItem('manager_vault_unlocked') === 'true';
    setIsUnlocked(unlocked);
    
    // Reset PIN if switching away from protected page (optional, but safer)
    if (!protectedPages.includes(activePage)) {
      setPin('');
      setError(false);
    }
  }, [activePage, protectedPages]);

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
    if (pin === MASTER_PIN) {
      sessionStorage.setItem('manager_vault_unlocked', 'true');
      setIsUnlocked(true);
      setPin('');
    } else {
      setError(true);
      setPin('');
      // Shake animation effect handled by framer motion
    }
  };

  // Auto-submit when 4 digits are entered
  useEffect(() => {
    if (pin.length === 4) {
      const timer = setTimeout(() => handleSubmit(), 300);
      return () => clearTimeout(timer);
    }
  }, [pin]);

  if (!protectedPages.includes(activePage) || isUnlocked) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FFD700]/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#FFD700]/5 blur-[120px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-12">
          <motion.div 
            animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
            className={cn(
              "inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 border-2 transition-all duration-500",
              error ? "border-red-500 bg-red-500/10 text-red-500" : "border-[#FFD700]/30 bg-[#FFD700]/5 text-[#FFD700]"
            )}
          >
            {error ? <ShieldAlert size={40} /> : <Lock size={40} />}
          </motion.div>
          <h1 className="text-3xl font-black text-[#FFD700] tracking-tighter uppercase">Manager Vault</h1>
          <p className="text-slate-500 mt-2 text-sm font-medium">Restricted Area. Enter 4-digit Authorization PIN.</p>
        </div>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-4 mb-12">
          {[0, 1, 2, 3].map((i) => (
            <div 
              key={i}
              className={cn(
                "w-4 h-4 rounded-full border-2 transition-all duration-300",
                pin.length > i 
                  ? "bg-[#FFD700] border-[#FFD700] shadow-[0_0_15px_rgba(255,215,0,0.5)]" 
                  : "border-slate-800 bg-transparent"
              )}
            />
          ))}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-4 max-w-[320px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              className="aspect-square flex items-center justify-center text-2xl font-black text-white bg-white/5 border border-white/10 rounded-2xl hover:bg-[#FFD700]/10 hover:border-[#FFD700]/50 hover:text-[#FFD700] transition-all active:scale-90 group"
            >
              <span className="group-hover:drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]">{num}</span>
            </button>
          ))}
          <div />
          <button
            onClick={() => handleNumberClick('0')}
            className="aspect-square flex items-center justify-center text-2xl font-black text-white bg-white/5 border border-white/10 rounded-2xl hover:bg-[#FFD700]/10 hover:border-[#FFD700]/50 hover:text-[#FFD700] transition-all active:scale-90 group"
          >
            <span className="group-hover:drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]">0</span>
          </button>
          <button
            onClick={handleDelete}
            className="aspect-square flex items-center justify-center text-white bg-white/5 border border-white/10 rounded-2xl hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-500 transition-all active:scale-90"
          >
            <Delete size={24} />
          </button>
        </div>

        {error && (
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-red-500 text-xs font-bold mt-8 uppercase tracking-widest"
          >
            Invalid Authorization PIN
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
