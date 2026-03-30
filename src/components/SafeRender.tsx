import React, { ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SafeRender extends React.Component<any, any> {
  state: any;
  props: any;

  constructor(props: any) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
          <div className="vault-card p-12 text-center max-w-lg w-full border-[#FFD700]/20">
            <AlertTriangle className="text-[#FFD700] mx-auto mb-6" size={64} />
            <h2 className="text-white font-black uppercase tracking-tighter text-2xl mb-4">System Recovery Mode</h2>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              A critical rendering collapse was detected. The Safe-Render wrapper has intercepted the failure to prevent a total system blackout.
            </p>
            <div className="bg-black/40 rounded-xl p-4 mb-8 text-left border border-white/5">
              <p className="text-[#FFD700] text-[10px] font-mono break-all">
                {this.state.error?.message || 'Unknown Execution Error'}
              </p>
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="gold-btn w-full py-4 flex items-center justify-center gap-3"
            >
              <RefreshCw size={20} />
              <span>Re-Initialize System</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
