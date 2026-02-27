import React from 'react';

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center h-64 w-full space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      <p className="text-slate-500 font-medium animate-pulse">Loading data from Supabase...</p>
    </div>
  );
}
