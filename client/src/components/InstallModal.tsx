import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Download,
  CheckCircle,
  X,
  Share,
  PlusSquare,
  Sparkles
} from 'lucide-react';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallModal: React.FC<InstallModalProps> = ({ isOpen, onClose }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Detect if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone;
    if (isStandalone) {
      setIsInstalled(true);
    }

    // Capture PWA install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      alert('PWA install prompt is not directly available in this browser. Please use your browser menu "Add to Home screen" or "Install App".');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/30 border border-indigo-400/30 mb-3 text-indigo-300">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-extrabold text-white tracking-tight">
            Install Mobile App
          </h3>
          <p className="text-xs text-indigo-200 mt-1">
            Install Field Tracker on your Android phone or iPhone for high-speed field access.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-sm text-slate-700 flex-1">
          {/* Quick Install Option for Android / PWA */}
          <div className="rounded-2xl bg-indigo-50/70 border border-indigo-100 p-4 space-y-3">
            <div className="flex items-center gap-2 text-indigo-900 font-bold">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>1-Click Fast Install (Android / iOS PWA)</span>
            </div>
            {isInstalled ? (
              <div className="p-3 bg-emerald-100/80 border border-emerald-300 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>App is already running in Standalone App Mode!</span>
              </div>
            ) : (
              <>
                <p className="text-xs text-indigo-700 leading-relaxed">
                  Installs a full-screen app icon on your home screen with camera access and offline caching.
                </p>
                <button
                  onClick={handleInstallPWA}
                  className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-500/25 transition flex items-center justify-center gap-2 active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Install to Home Screen</span>
                </button>
              </>
            )}
          </div>

          {/* iOS Instructions */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-xs uppercase tracking-wider">
              <span>🍎 iPhone / iPad (Safari)</span>
            </div>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>Open this page in <span className="font-semibold text-slate-800">Safari</span> on your iPhone.</li>
              <li>
                Tap the <span className="font-semibold text-indigo-600 inline-flex items-center gap-1"><Share className="w-3.5 h-3.5" /> Share</span> button at the bottom of Safari.
              </li>
              <li>
                Scroll down and tap <span className="font-semibold text-slate-800 inline-flex items-center gap-1"><PlusSquare className="w-3.5 h-3.5" /> Add to Home Screen</span>.
              </li>
            </ol>
          </div>

          {/* Android APK Direct Instructions */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-xs uppercase tracking-wider">
              <span>🤖 Android Phone (Chrome & Native APK)</span>
            </div>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>Open this page in <span className="font-semibold text-slate-800">Google Chrome</span> on your Android phone.</li>
              <li>Tap the 3 dots menu in Chrome &rarr; tap <span className="font-semibold text-indigo-600">"Install app"</span> or <span className="font-semibold text-indigo-600">"Add to Home screen"</span>.</li>
              <li>Or build the native standalone APK from the Capacitor project folder.</li>
            </ol>
          </div>

          {/* Wi-Fi URL helper */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
            <div className="font-bold flex items-center gap-1.5 text-emerald-800 mb-0.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Direct Phone Network URL:</span>
            </div>
            <span className="font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-300 inline-block mt-1 select-all">
              http://192.168.2.118:5173
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
