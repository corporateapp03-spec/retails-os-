import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Key, 
  ShieldCheck, 
  Save, 
  AlertCircle,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Settings() {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const storedPin = localStorage.getItem('retailos_manager_pin') || import.meta.env.VITE_MANAGER_PIN || '7007';

    if (currentPin !== storedPin) {
      setMessage({ type: 'error', text: 'Current PIN is incorrect' });
      return;
    }

    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      setMessage({ type: 'error', text: 'New PIN must be exactly 4 digits' });
      return;
    }

    if (newPin !== confirmPin) {
      setMessage({ type: 'error', text: 'New PINs do not match' });
      return;
    }

    localStorage.setItem('retailos_manager_pin', newPin);
    // Dispatch storage event for other tabs/components
    window.dispatchEvent(new Event('storage'));
    
    setMessage({ type: 'success', text: 'Manager PIN updated successfully' });
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-4 border-b border-white/5 pb-8">
        <div className="p-3 bg-[#FFD700]/10 rounded-2xl border border-[#FFD700]/20">
          <SettingsIcon className="text-[#FFD700]" size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase font-sans">System Settings</h1>
          <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-1">Configure Vault Access & Security Controls</p>
        </div>
      </div>

      <div className="vault-card p-8 rounded-[2.5rem] border border-white/5 bg-[#0d0d0d] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <ShieldCheck size={120} className="text-[#FFD700]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <Lock className="text-[#FFD700]" size={20} />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Update Manager PIN</h2>
          </div>

          <form onSubmit={handleUpdatePin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Current 4-Digit PIN</label>
              <div className="relative">
                <input 
                  type={showPin ? "text" : "password"}
                  maxLength={4}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-xl font-black tracking-[0.5em] text-white focus:border-[#FFD700] transition-colors outline-none text-center"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">New 4-Digit PIN</label>
                <input 
                  type={showPin ? "text" : "password"}
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-xl font-black tracking-[0.5em] text-white focus:border-[#FFD700] transition-colors outline-none text-center"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Confirm New PIN</label>
                <input 
                  type={showPin ? "text" : "password"}
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-xl font-black tracking-[0.5em] text-white focus:border-[#FFD700] transition-colors outline-none text-center"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button 
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
              >
                {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPin ? 'Hide PINs' : 'Show PINs'}
              </button>

              <button 
                type="submit"
                className="gold-btn py-3 px-8 flex items-center gap-3"
              >
                <Save size={18} />
                <span>Save Security Configuration</span>
              </button>
            </div>
          </form>

          {message && (
            <div className={cn(
              "mt-8 p-4 rounded-2xl border flex items-center gap-3 animate-in slide-in-from-top-2 duration-300",
              message.type === 'success' 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                : "bg-rose-500/10 border-rose-500/20 text-rose-500"
            )}>
              {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <p className="text-[10px] font-black uppercase tracking-widest">{message.text}</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 bg-blue-500/5 rounded-3xl border border-blue-500/10">
        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
          <ShieldCheck size={14} />
          Note on Security
        </h3>
        <p className="text-xs text-slate-400 font-medium leading-relaxed">
          The Manager PIN is stored locally in your browser's secure storage. 
          It protects sensitive operations like profit distribution, strategic decisions, and financial archives. 
          If you clear your browser data, the PIN will reset to the system default.
        </p>
      </div>
    </div>
  );
}
