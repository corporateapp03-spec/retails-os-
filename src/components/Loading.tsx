import React from 'react';

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center h-64 w-full space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFD700]"></div>
      <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] animate-pulse">Accessing Secure Vault...</p>
    </div>
  );
}
