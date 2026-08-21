import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  auth,
  db
} from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import {
  ShieldCheck,
  Building2,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Phone,
  Cpu,
  AlertTriangle,
  RefreshCw,
  X,
  UserCheck,
  Download,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  Sparkles,
  ExternalLink,
  ArrowLeft
} from 'lucide-react';

export interface ClientRecord {
  id: string;
  partyName: string;
  contactNumber: string;
  machineCount: number;
  monthlyCapacity: string;
  address: string;
  photos?: string[];
  status?: 'submitted' | 'verified' | 'rejected';
  submittedBy: string;
  submittedByUid?: string;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
}

interface NewEntryAlert {
  id: string;
  client: ClientRecord;
  receivedAt: Date;
}

const ADMIN_PASSKEY = 'admin123';

interface AdminPortalViewProps {
  onSwitchToAgent: () => void;
}

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({ onSwitchToAgent }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth form states
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [passkey, setPasskey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Data states
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Lightbox Modal state
  const [lightboxPhotos, setLightboxPhotos] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState('');

  // Delete Client state
  const [deletingClient, setDeletingClient] = useState<ClientRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Real-time Notification Alert States
  const [activeAlerts, setActiveAlerts] = useState<NewEntryAlert[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NewEntryAlert[]>([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopNotifyEnabled, setDesktopNotifyEnabled] = useState(false);

  // Refs for tracking initial Firestore sync & audio context
  const isInitialLoadRef = useRef(true);
  const knownClientIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Request browser desktop notification permission
  const requestDesktopNotifications = useCallback(async () => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      try {
        const perm = await Notification.requestPermission();
        setDesktopNotifyEnabled(perm === 'granted');
      } catch (err) {
        console.warn('Desktop notification error:', err);
      }
    }
  }, []);

  // Play synthesized notification chime using Web Audio API
  const playNotificationChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(698.46, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, now + 0.15);
      gain2.gain.setValueAtTime(0, now + 0.15);
      gain2.gain.linearRampToValueAtTime(0.35, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.6);
    } catch (err) {
      console.warn('Audio chime error:', err);
    }
  }, [soundEnabled]);

  // Trigger New Entry Pop-up Alert
  const triggerNewEntryAlert = useCallback((newRecord: ClientRecord) => {
    const alertId = `${newRecord.id}-${Date.now()}`;
    const alertItem: NewEntryAlert = {
      id: alertId,
      client: newRecord,
      receivedAt: new Date()
    };

    setActiveAlerts((prev) => [alertItem, ...prev.slice(0, 4)]);
    setNotificationHistory((prev) => [alertItem, ...prev.slice(0, 49)]);
    playNotificationChime();

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`New Client Entry: ${newRecord.partyName}`, {
          body: `Added by ${newRecord.submittedBy} • ${newRecord.contactNumber} • ${newRecord.machineCount} machines`,
          icon: '/favicon.svg'
        });
      } catch (err) {
        console.warn('Notification error:', err);
      }
    }

    setTimeout(() => {
      setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
    }, 7500);
  }, [playNotificationChime]);

  const dismissAlert = (alertId: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const viewAlertClient = (client: ClientRecord) => {
    setSelectedClient(client);
    setShowNotificationsPanel(false);
  };

  // Real-time Firestore Listener
  useEffect(() => {
    if (!currentUser) {
      setClients([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    isInitialLoadRef.current = true;

    const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records: ClientRecord[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ClientRecord, 'id'>)
        }));

        if (!isInitialLoadRef.current) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const docId = change.doc.id;
              if (!knownClientIdsRef.current.has(docId)) {
                const newRecord: ClientRecord = {
                  id: docId,
                  ...(change.doc.data() as Omit<ClientRecord, 'id'>)
                };
                triggerNewEntryAlert(newRecord);
              }
            }
          });
        }

        knownClientIdsRef.current = new Set(snapshot.docs.map((d) => d.id));
        isInitialLoadRef.current = false;
        setClients(records);
        setDataLoading(false);
      },
      () => {
        const fallbackQ = collection(db, 'clients');
        onSnapshot(fallbackQ, (snapshot) => {
          const records: ClientRecord[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<ClientRecord, 'id'>)
          }));
          records.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
          });
          setClients(records);
          setDataLoading(false);
        });
      }
    );

    return () => unsubscribe();
  }, [currentUser, triggerNewEntryAlert]);

  // Google OAuth Sign In
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        setAuthError(error.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Email/Password Auth Handler
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const emailTrimmed = authEmail.trim();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailTrimmed)) {
      setAuthError('Please enter a valid Google email address (e.g. admin@gmail.com).');
      return;
    }

    if (isRegistering && passkey.trim() !== ADMIN_PASSKEY) {
      setAuthError(`Invalid Admin Passkey. You need authorization to register as an Administrator.`);
      return;
    }

    setAuthSubmitting(true);
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, emailTrimmed, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, emailTrimmed, authPassword);
      }
      setAuthEmail('');
      setAuthPassword('');
      setPasskey('');
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      let msg = error.message || 'Authentication failed.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        msg = 'Invalid email or password.';
      } else if (error.code === 'auth/email-already-in-use') {
        msg = 'An account with this email already exists. Please log in.';
      } else if (error.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      }
      setAuthError(msg);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Status update handler
  const handleUpdateStatus = async (
    clientId: string,
    newStatus: 'submitted' | 'verified' | 'rejected',
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setUpdatingId(clientId);
    try {
      const clientRef = doc(db, 'clients', clientId);
      await updateDoc(clientRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Delete client handler
  const handleConfirmDelete = async () => {
    if (!deletingClient) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'clients', deletingClient.id));
      if (selectedClient && selectedClient.id === deletingClient.id) {
        setSelectedClient(null);
      }
      setActionSuccess(`Record "${deletingClient.partyName}" permanently deleted.`);
      setDeletingClient(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error('Error deleting record:', err);
      alert('Failed to delete record.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredClients.length === 0) {
      alert('No client records to export.');
      return;
    }

    const headers = [
      'Party Name',
      'Contact Number',
      'Machine Count',
      'Monthly Capacity',
      'Address',
      'Photos Count',
      'Status',
      'Submitted By',
      'Created Date'
    ];

    const rows = filteredClients.map((client) => [
      `"${(client.partyName || '').replace(/"/g, '""')}"`,
      `"${(client.contactNumber || '').replace(/"/g, '""')}"`,
      client.machineCount ?? 0,
      `"${(client.monthlyCapacity || '').replace(/"/g, '""')}"`,
      `"${(client.address || '').replace(/"/g, '""')}"`,
      client.photos ? client.photos.length : 0,
      `"${(client.status || 'submitted').toUpperCase()}"`,
      `"${(client.submittedBy || '').replace(/"/g, '""')}"`,
      `"${formatDate(client.createdAt)}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `clients_export_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Open Lightbox
  const openLightbox = (photos: string[], startIndex = 0, title = 'Client Photos', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLightboxPhotos(photos);
    setLightboxIndex(startIndex);
    setLightboxTitle(title);
  };

  const closeLightbox = () => {
    setLightboxPhotos(null);
    setLightboxIndex(0);
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = clients.length;
    const submitted = clients.filter((c) => c.status === 'submitted' || !c.status).length;
    const verified = clients.filter((c) => c.status === 'verified').length;
    const rejected = clients.filter((c) => c.status === 'rejected').length;
    return { total, submitted, verified, rejected };
  }, [clients]);

  // Filtered & Searched Data
  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'submitted' && client.status !== 'submitted' && client.status) {
          return false;
        }
        if (statusFilter !== 'submitted' && client.status !== statusFilter) {
          return false;
        }
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const nameMatch = client.partyName?.toLowerCase().includes(term);
        const phoneMatch = client.contactNumber?.toLowerCase().includes(term);
        const addressMatch = client.address?.toLowerCase().includes(term);
        const submitterMatch = client.submittedBy?.toLowerCase().includes(term);
        return nameMatch || phoneMatch || addressMatch || submitterMatch;
      }

      return true;
    });
  }, [clients, statusFilter, searchTerm]);

  const formatDate = (timestamp: Timestamp | null) => {
    if (!timestamp) return 'Just now';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as unknown as number);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return 'Recent';
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium tracking-wide">Loading Executive Admin Console...</p>
        </div>
      </div>
    );
  }

  // Not Logged In View
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <button
            onClick={onSwitchToAgent}
            className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Field Agent Mode</span>
          </button>

          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-xl shadow-blue-500/25 mb-4 text-white">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Admin Verification Console
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Executive Verification & Client Management Portal
          </p>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
            {/* Google One-Click Sign In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authSubmitting}
              className="w-full py-3 px-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-xs transition flex items-center justify-center gap-3 disabled:opacity-60 group"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Separator */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-slate-400 font-semibold tracking-wider">
                  Or with Google Email
                </span>
              </div>
            </div>

            {/* Toggle Tab */}
            <div className="flex rounded-xl bg-slate-100 p-1 mb-5">
              <button
                type="button"
                onClick={() => { setIsRegistering(false); setAuthError(null); }}
                className={`w-1/2 py-2 text-sm font-semibold rounded-lg transition-all ${
                  !isRegistering
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Admin Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsRegistering(true); setAuthError(null); }}
                className={`w-1/2 py-2 text-sm font-semibold rounded-lg transition-all ${
                  isRegistering
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Register Admin
              </button>
            </div>

            {authError && (
              <div className="mb-5 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Google Email Address
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isRegistering && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Passkey Authorization
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={passkey}
                      onChange={(e) => setPasskey(e.target.value)}
                      placeholder="Enter passkey (e.g. admin123)"
                      className="w-full pl-9 pr-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Passkey required to verify authorization</p>
                </div>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-500/30 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {authSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                {isRegistering ? 'Register as Admin' : 'Access Admin Portal'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Logged In Admin Dashboard
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Field Tracker Portal</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  ADMIN CONSOLE
                </span>
              </div>
              <p className="text-xs text-slate-500">Live Real-time Client Verification</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Switch to Agent Mode Button */}
            <button
              onClick={onSwitchToAgent}
              className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center gap-1.5"
              title="Switch back to Field Agent intake mode"
            >
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Agent Mode</span>
            </button>

            {/* Audio Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border transition ${
                soundEnabled
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
              title={soundEnabled ? 'Alert Sound: Enabled' : 'Alert Sound: Muted'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Notification Bell with Dropdown */}
            <div className="relative" ref={notifDropdownRef}>
              <button
                onClick={() => setShowNotificationsPanel(!showNotificationsPanel)}
                className={`p-2 rounded-xl border transition relative ${
                  showNotificationsPanel
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Live Entry Alerts"
              >
                {notificationHistory.length > 0 ? (
                  <BellRing className="w-4 h-4 text-blue-600" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {notificationHistory.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[10px] font-extrabold flex items-center justify-center animate-pulse">
                    {notificationHistory.length > 9 ? '9+' : notificationHistory.length}
                  </span>
                )}
              </button>

              {showNotificationsPanel && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Live Entry Alerts ({notificationHistory.length})
                      </span>
                    </div>
                    {notificationHistory.length > 0 && (
                      <button
                        onClick={() => setNotificationHistory([])}
                        className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {!desktopNotifyEnabled && (
                    <div className="p-3 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-blue-800">
                        Enable browser desktop pop-up alerts:
                      </span>
                      <button
                        onClick={requestDesktopNotifications}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg shadow-xs transition flex-shrink-0"
                      >
                        Enable
                      </button>
                    </div>
                  )}

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notificationHistory.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No new entries received yet during this session.
                      </div>
                    ) : (
                      notificationHistory.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => viewAlertClient(item.client)}
                          className="p-3 hover:bg-slate-50 transition cursor-pointer flex items-start gap-3 group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-blue-600 group-hover:text-white transition">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {item.client.partyName}
                              </p>
                              <span className="text-[10px] text-slate-400">
                                {item.receivedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                              By {item.client.submittedBy} • {item.client.contactNumber}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Google Avatar"
                className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-xs"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-200">
                {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : currentUser.email?.charAt(0).toUpperCase() || 'A'}
              </div>
            )}

            <button
              onClick={handleSignOut}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition border border-slate-200"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Floating Pop-up Notifications Stack */}
      <div className="fixed top-20 right-4 sm:right-6 z-[80] space-y-3 max-w-sm sm:max-w-md w-full pointer-events-none">
        {activeAlerts.map((alert) => (
          <div
            key={alert.id}
            className="pointer-events-auto rounded-2xl bg-white border-2 border-indigo-500/80 shadow-2xl p-4 animate-in slide-in-from-top-6 fade-in duration-300 ring-4 ring-indigo-500/10 overflow-hidden relative"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>New Client Entry Added!</span>
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-start gap-3">
              {alert.client.photos && alert.client.photos.length > 0 ? (
                <img
                  src={alert.client.photos[0]}
                  alt={alert.client.partyName}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 flex-shrink-0 shadow-xs"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 border border-indigo-100">
                  <Building2 className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 truncate">
                  {alert.client.partyName}
                </h4>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  📞 {alert.client.contactNumber} • ⚙️ {alert.client.machineCount} machines
                </p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Submitted by <span className="font-semibold text-slate-600">{alert.client.submittedBy}</span>
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => dismissAlert(alert.id)}
                className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition"
              >
                Dismiss
              </button>
              <button
                onClick={() => viewAlertClient(alert.client)}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center gap-1"
              >
                <span>View Details</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {/* Action Success Alert */}
        {actionSuccess && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 shadow-sm flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-2.5 text-emerald-900 text-sm font-semibold">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Clients</span>
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{metrics.total}</p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Pending Review</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-amber-600 mt-2">{metrics.submitted}</p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Verified</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-600 mt-2">{metrics.verified}</p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Rejected</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-rose-600 mt-2">{metrics.rejected}</p>
          </div>
        </div>

        {/* Toolbar: Search, Filters, CSV Export */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by party, phone, submitter..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end overflow-x-auto pb-1 md:pb-0">
            {/* Status Filter Tabs */}
            <div className="flex rounded-xl bg-slate-100 p-1 flex-shrink-0">
              {(['all', 'submitted', 'verified', 'rejected'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition ${
                    statusFilter === filter
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 flex-shrink-0"
              title="Download filtered client records as CSV spreadsheet"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Client Records Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {dataLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <p className="text-xs font-medium">Fetching real-time records...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No client records found</p>
              <p className="text-xs text-slate-400 mt-1">Try clearing filters or search term</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Party & Contact</th>
                    <th className="py-3.5 px-4">Capacity & Machines</th>
                    <th className="py-3.5 px-4">Photos</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Submitter</th>
                    <th className="py-3.5 px-4 text-right">Verification Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className="hover:bg-slate-50/80 transition cursor-pointer group"
                    >
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 group-hover:text-blue-600 transition">
                          {client.partyName}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {client.contactNumber}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-slate-400" />
                          <span>{client.machineCount} machines</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">
                          {client.monthlyCapacity}
                        </div>
                      </td>

                      {/* Photo Thumbnails */}
                      <td className="py-4 px-4">
                        {client.photos && client.photos.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            {client.photos.slice(0, 2).map((photo, pIdx) => (
                              <img
                                key={pIdx}
                                src={photo}
                                alt="thumb"
                                onClick={(e) => openLightbox(client.photos!, pIdx, client.partyName, e)}
                                className="w-9 h-9 rounded-lg object-cover border border-slate-200 hover:scale-105 transition shadow-xs"
                              />
                            ))}
                            {client.photos.length > 2 && (
                              <span
                                onClick={(e) => openLightbox(client.photos!, 2, client.partyName, e)}
                                className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center border border-slate-200 transition"
                              >
                                +{client.photos.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No photos</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                            client.status === 'verified'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : client.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {client.status || 'submitted'}
                        </span>
                      </td>

                      {/* Submitter */}
                      <td className="py-4 px-4">
                        <div className="text-xs font-semibold text-slate-700">{client.submittedBy}</div>
                        <div className="text-[11px] text-slate-400">{formatDate(client.createdAt)}</div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {client.status !== 'verified' && (
                            <button
                              onClick={(e) => handleUpdateStatus(client.id, 'verified', e)}
                              disabled={updatingId === client.id}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1 disabled:opacity-60"
                              title="Verify Record"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Verify</span>
                            </button>
                          )}

                          {client.status !== 'rejected' && (
                            <button
                              onClick={(e) => handleUpdateStatus(client.id, 'rejected', e)}
                              disabled={updatingId === client.id}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition flex items-center gap-1 disabled:opacity-60"
                              title="Reject Record"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Reject</span>
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => setDeletingClient(client)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition border border-transparent hover:border-rose-200"
                            title="Delete Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Details Modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">{selectedClient.partyName}</h3>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Contact</span>
                  <p className="font-mono font-semibold text-slate-800 mt-0.5">{selectedClient.contactNumber}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Status</span>
                  <p className="font-semibold capitalize mt-0.5">{selectedClient.status || 'submitted'}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Machines</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{selectedClient.machineCount} units</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Capacity</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{selectedClient.monthlyCapacity}</p>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Address</span>
                <p className="text-slate-700 mt-0.5">{selectedClient.address}</p>
              </div>

              {selectedClient.photos && selectedClient.photos.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    Attached Photos ({selectedClient.photos.length})
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedClient.photos.map((p, i) => (
                      <img
                        key={i}
                        src={p}
                        alt="photo"
                        onClick={() => openLightbox(selectedClient.photos!, i, selectedClient.partyName)}
                        className="w-full aspect-square object-cover rounded-xl border border-slate-200 hover:opacity-90 cursor-pointer transition shadow-xs"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <button
                onClick={() => setDeletingClient(selectedClient)}
                className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition"
              >
                Delete Record
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdateStatus(selectedClient.id, 'rejected')}
                  className="px-4 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedClient.id, 'verified')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
                >
                  Verify Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxPhotos && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="absolute top-4 left-4 text-white text-sm font-bold truncate max-w-xs sm:max-w-md">
            {lightboxTitle} ({lightboxIndex + 1}/{lightboxPhotos.length})
          </div>
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="relative max-w-4xl w-full max-h-[85vh] flex items-center justify-center">
            <img
              src={lightboxPhotos[lightboxIndex]}
              alt="fullscreen"
              className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
            {lightboxPhotos.length > 1 && (
              <>
                <button
                  onClick={() => setLightboxIndex((prev) => (prev > 0 ? prev - 1 : lightboxPhotos.length - 1))}
                  className="absolute left-2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white transition"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setLightboxIndex((prev) => (prev < lightboxPhotos.length - 1 ? prev + 1 : 0))}
                  className="absolute right-2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white transition"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center border border-rose-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg">Delete Record?</h3>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to permanently delete <span className="font-bold text-slate-900">"{deletingClient.partyName}"</span>?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingClient(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md transition disabled:opacity-60 flex items-center gap-2"
              >
                {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
