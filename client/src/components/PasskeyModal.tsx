import React, { useState } from 'react';
import { ShieldCheck, KeyRound, X, AlertTriangle, Lock } from 'lucide-react';

interface PasskeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  correctPasskey: string;
}

export const PasskeyModal: React.FC<PasskeyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  correctPasskey
}) => {
  const [passkeyInput, setPasskeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passkeyInput.trim() === correctPasskey) {
      setError(null);
      setPasskeyInput('');
      onSuccess();
    } else {
      setError('Access Denied: Invalid Admin Passkey. Only authorized managers can enter Admin Console.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white relative">
          <button
            onClick={() => { setError(null); setPasskeyInput(''); onClose(); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600/30 border border-blue-400/30 mb-3 text-blue-300">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-extrabold text-white tracking-tight">
            Admin Passkey Required
          </h3>
          <p className="text-xs text-slate-300 mt-1">
            Access to the Executive Verification Console is restricted to authorized managers.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Enter Admin Passkey
            </label>
            <div className="relative">
              <input
                type="password"
                required
                autoFocus
                value={passkeyInput}
                onChange={(e) => setPasskeyInput(e.target.value)}
                placeholder="Enter passkey (e.g. admin123)"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Field agents cannot access without management authorization.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setError(null); setPasskeyInput(''); onClose(); }}
              className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md shadow-blue-500/25 transition"
            >
              Authorize & Enter Console
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
