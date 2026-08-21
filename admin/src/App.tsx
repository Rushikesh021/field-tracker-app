import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  auth,
  db
} from './config/firebase';
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
  RotateCcw,
  Search,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Phone,
  Cpu,
  Gauge,
  MapPin,
  AlertTriangle,
  RefreshCw,
  X,
  UserCheck,
  Download,
  Camera,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Trash2,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  Sparkles,
  ExternalLink,
  Smartphone,
  Wifi,
  ZoomIn,
  ZoomOut,
  RotateCw
} from 'lucide-react';

export interface ClientRecord {
  id: string;
  partyName: string;
  contactNumber: string;
  machineCount: number;
  monthlyCapacity: string;
  address: string;
  photos?: string[];
  status: 'submitted' | 'verified' | 'rejected';
  submittedBy: string;
  submittedByUid?: string;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface NewEntryNotification {
  id: string;
  client: ClientRecord;
  receivedAt: Date;
}

/**
 * Plays a subtle two-tone chime via Web Audio API when a new client entry is received.
 */
export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Note 1 (F5: 698.46 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(698.46, now);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Note 2 (A5: 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (err) {
    console.debug('Audio chime playback omitted:', err);
  }
}

const ADMIN_PASSKEY = "admin123";

export default function App() {
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

  // Data & Filters
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('all');
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Delete State
  const [deletingClient, setDeletingClient] = useState<ClientRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Real-time Notification Alert States
  const [activeAlerts, setActiveAlerts] = useState<NewEntryNotification[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NewEntryNotification[]>([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopNotifyEnabled, setDesktopNotifyEnabled] = useState(false);
  const isInitialLoadRef = useRef(true);
  const knownClientIdsRef = useRef<Set<string>>(new Set());
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Lightbox & CSV Export States
  interface LightboxState {
    photos: string[];
    currentIndex: number;
    partyName: string;
  }
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxRotation, setLightboxRotation] = useState(0);
  const [lightboxPosition, setLightboxPosition] = useState({ x: 0, y: 0 });
  const [isLightboxDragging, setIsLightboxDragging] = useState(false);
  const [lightboxDragStart, setLightboxDragStart] = useState({ x: 0, y: 0 });
  const [isExporting, setIsExporting] = useState(false);

  const dismissAlert = (alertId: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const viewAlertClient = (client: ClientRecord, alertId?: string) => {
    setSelectedClient(client);
    if (alertId) {
      dismissAlert(alertId);
    }
    setShowNotificationsPanel(false);
  };

  const triggerNewEntryAlert = useCallback((newClient: ClientRecord) => {
    const alertItem: NewEntryNotification = {
      id: `${newClient.id}-${Date.now()}`,
      client: newClient,
      receivedAt: new Date()
    };

    // Add to active toast queue (shows floating pop-up)
    setActiveAlerts((prev) => [alertItem, ...prev].slice(0, 4));

    // Add to notification history list
    setNotificationHistory((prev) => [alertItem, ...prev].slice(0, 25));

    // Play subtle chime sound if enabled
    if (soundEnabled) {
      playNotificationChime();
    }

    // Trigger Desktop OS Notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification('New Client Entry Received!', {
          body: `${newClient.partyName} (${newClient.contactNumber}) submitted by ${newClient.submittedBy}`,
          icon: '/favicon.svg'
        });
        notif.onclick = () => {
          window.focus();
          setSelectedClient(newClient);
        };
      } catch (err) {
        console.debug('Desktop notification error:', err);
      }
    }
  }, [soundEnabled]);

  // Auto-dismiss oldest active toast after 7.5 seconds
  useEffect(() => {
    if (activeAlerts.length === 0) return;
    const timer = setTimeout(() => {
      setActiveAlerts((prev) => prev.slice(0, prev.length - 1));
    }, 7500);
    return () => clearTimeout(timer);
  }, [activeAlerts]);

  // Request browser desktop notification permission
  const requestDesktopNotifications = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setDesktopNotifyEnabled(perm === 'granted');
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setDesktopNotifyEnabled(true);
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setShowNotificationsPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deletingClient) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'clients', deletingClient.id));
      if (selectedClient && selectedClient.id === deletingClient.id) {
        setSelectedClient(null);
      }
      setDeletingClient(null);
    } catch (err) {
      console.error('Error deleting client record:', err);
      alert('Failed to delete client. Please check connection.');
    } finally {
      setIsDeleting(false);
    }
  };

  const resetLightboxZoom = useCallback(() => {
    setLightboxZoom(1);
    setLightboxRotation(0);
    setLightboxPosition({ x: 0, y: 0 });
    setIsLightboxDragging(false);
  }, []);

  const openLightbox = (photos: string[], index: number, partyName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!photos || photos.length === 0) return;
    resetLightboxZoom();
    setLightbox({
      photos,
      currentIndex: index >= 0 && index < photos.length ? index : 0,
      partyName
    });
  };

  const closeLightbox = useCallback(() => {
    resetLightboxZoom();
    setLightbox(null);
  }, [resetLightboxZoom]);

  const nextLightboxPhoto = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    resetLightboxZoom();
    setLightbox((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        currentIndex: (prev.currentIndex + 1) % prev.photos.length
      };
    });
  }, [resetLightboxZoom]);

  const prevLightboxPhoto = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    resetLightboxZoom();
    setLightbox((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        currentIndex: (prev.currentIndex - 1 + prev.photos.length) % prev.photos.length
      };
    });
  }, [resetLightboxZoom]);

  // Keyboard navigation for photo lightbox
  useEffect(() => {
    if (!lightbox) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextLightboxPhoto();
      if (e.key === 'ArrowLeft') prevLightboxPhoto();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightbox, closeLightbox, nextLightboxPhoto, prevLightboxPhoto]);

  // Export Filtered Clients to CSV File
  const handleExportCSV = () => {
    if (filteredClients.length === 0) {
      alert('No client records to export in the current filtered view.');
      return;
    }

    setIsExporting(true);
    try {
      const headers = [
        'Party Name',
        'Contact Number',
        'Machine Count',
        'Monthly Capacity',
        'Address',
        'Status',
        'Submitted By',
        'Submission Date',
        'Photo Count'
      ];

      const formatCsvDate = (ts: Timestamp | null) => {
        if (!ts) return 'N/A';
        try {
          const date = ts.toDate ? ts.toDate() : new Date(ts as unknown as number);
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const hh = String(date.getHours()).padStart(2, '0');
          const min = String(date.getMinutes()).padStart(2, '0');
          const ss = String(date.getSeconds()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
        } catch {
          return 'N/A';
        }
      };

      const rows = filteredClients.map((client) => [
        client.partyName || '',
        client.contactNumber || '',
        client.machineCount ?? 0,
        client.monthlyCapacity || '',
        client.address || '',
        client.status || 'submitted',
        client.submittedBy || '',
        formatCsvDate(client.createdAt),
        client.photos ? client.photos.length : 0
      ]);

      const csvContent =
        '\uFEFF' +
        [headers, ...rows]
          .map((row) =>
            row
              .map((cell) => {
                const stringVal = cell === null || cell === undefined ? '' : String(cell);
                return `"${stringVal.replace(/"/g, '""')}"`;
              })
              .join(',')
          )
          .join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      link.href = url;
      link.setAttribute('download', `clients_export_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting CSV:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time onSnapshot listener for clients collection with real-time entry alerts
  useEffect(() => {
    if (!currentUser) {
      setClients([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    // Order by createdAt desc, with fallback if indexes aren't built yet
    const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records: ClientRecord[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ClientRecord, 'id'>)
        }));

        // Detect newly added records in real time (after initial load)
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

        // Cache known client IDs & mark initial load as completed
        knownClientIdsRef.current = new Set(snapshot.docs.map((d) => d.id));
        isInitialLoadRef.current = false;

        setClients(records);
        setDataLoading(false);
      },
      (error) => {
        console.warn('Fallback querying without order due to missing index:', error);
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

          // Detect new entries in fallback mode
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
        });
      }
    );

    return () => unsubscribe();
  }, [currentUser, triggerNewEntryAlert]);

  // Google OAuth Sign In / Registration Handler
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
        setAuthError(error.message || 'Google sign-in failed. Please try again with an authorized Google account.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Auth Handler
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
      let msg = error.message || 'Authentication failed. Please verify your credentials.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        msg = 'Invalid email or password.';
      } else if (error.code === 'auth/email-already-in-use') {
        msg = 'An account with this email already exists. Please log in or continue with Google.';
      } else if (error.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'Please enter a valid Google email address.';
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

      // Update selected client if modal is open
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Live Metrics calculation
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
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'submitted' && client.status !== 'submitted' && client.status) {
          return false;
        }
        if (statusFilter !== 'submitted' && client.status !== statusFilter) {
          return false;
        }
      }

      // Search term
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

  // Format date helper
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
          <p className="text-sm font-medium tracking-wide">Loading Enterprise Admin Portal...</p>
        </div>
      </div>
    );
  }

  // Not Logged In View
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-xl shadow-blue-500/25 mb-4 text-white">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Field Tracker Admin
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Executive Verification & Client Management Portal
          </p>

          {/* Mobile Phone Access Guidance Badge */}
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-900/60 border border-blue-500/30 text-blue-200 text-xs shadow-inner">
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mobile Ready Console (iOS Safari & Android Chrome)</span>
          </div>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          {/* Wi-Fi Local Network Access URL Card */}
          <div className="mb-4 rounded-2xl bg-blue-950/80 border border-blue-500/40 p-3.5 text-xs text-blue-200 flex items-start gap-2.5 shadow-lg backdrop-blur-sm">
            <Wifi className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>Access on Mobile or Local Devices:</span>
              </div>
              <p className="text-blue-300 mt-0.5 leading-relaxed">
                Connect device to the same Wi-Fi & open:{' '}
                <span className="font-mono text-emerald-300 font-bold select-all bg-blue-900/80 px-1.5 py-0.5 rounded border border-blue-700">
                  http://192.168.2.118:5174
                </span>
              </p>
            </div>
          </div>
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
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">Please use your real Google / Gmail account</p>
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
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition pr-10"
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
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
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

          <div className="flex items-center gap-2.5">
            {/* Audio Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border transition ${
                soundEnabled
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
              title={soundEnabled ? 'Alert Sound: Enabled (Click to Mute)' : 'Alert Sound: Muted (Click to Enable)'}
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

              {/* Notification History Dropdown */}
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

                  {/* Desktop notification prompt if not yet enabled */}
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
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                {item.client.machineCount} machines
                              </span>
                              {item.client.photos && item.client.photos.length > 0 && (
                                <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-0.5">
                                  <Camera className="w-2.5 h-2.5" />
                                  {item.client.photos.length} photo(s)
                                </span>
                              )}
                            </div>
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

            <div className="hidden sm:flex flex-col text-right ml-1">
              <span className="text-xs font-bold text-slate-800">
                {currentUser.displayName || currentUser.email}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium flex items-center justify-end gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Google Verified Admin
              </span>
            </div>
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

      {/* Real-time Floating Pop-up Notifications Stack */}
      <div className="fixed top-20 right-4 sm:right-6 z-[80] space-y-3 max-w-sm sm:max-w-md w-full pointer-events-none">
        {activeAlerts.map((alert) => (
          <div
            key={alert.id}
            className="pointer-events-auto rounded-2xl bg-white border-2 border-indigo-500/80 shadow-2xl p-4 animate-in slide-in-from-top-6 fade-in duration-300 ring-4 ring-indigo-500/10 overflow-hidden relative"
          >
            {/* Pulsating banner */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 uppercase tracking-wider">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
                </span>
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
              {/* Photo or Building Icon */}
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
                <h4 className="text-sm font-extrabold text-slate-900 truncate">
                  {alert.client.partyName}
                </h4>
                <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>{alert.client.contactNumber}</span>
                  <span>•</span>
                  <span>{alert.client.machineCount} machines</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  Submitted by <span className="font-semibold text-slate-700">{alert.client.submittedBy}</span>
                </p>
              </div>
            </div>

            {/* Pop-up Action Bar */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">
                {alert.receivedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => viewAlertClient(alert.client, alert.id)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>View Details</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Metrics Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Clients</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.total}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">All registered records</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* Pending / Submitted */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Pending Review</p>
              <h3 className="text-2xl font-extrabold text-amber-600 mt-1">{metrics.submitted}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Awaiting verification</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          {/* Verified */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Verified</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{metrics.verified}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Approved & onboarded</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>

          {/* Rejected */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">Rejected</p>
              <h3 className="text-2xl font-extrabold text-rose-600 mt-1">{metrics.rejected}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Disapproved entries</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <XCircle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Search, Filters & Actions Bar */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Search */}
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by party name, phone, address..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Status Filter Tabs & CSV Export */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-slate-100 rounded-xl">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({clients.length})
              </button>
              <button
                onClick={() => setStatusFilter('submitted')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  statusFilter === 'submitted'
                    ? 'bg-white text-amber-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pending ({metrics.submitted})
              </button>
              <button
                onClick={() => setStatusFilter('verified')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  statusFilter === 'verified'
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Verified ({metrics.verified})
              </button>
              <button
                onClick={() => setStatusFilter('rejected')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  statusFilter === 'rejected'
                    ? 'bg-white text-rose-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Rejected ({metrics.rejected})
              </button>
            </div>

            {/* Export to CSV Button */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredClients.length === 0 || isExporting}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-sm hover:shadow transition flex items-center gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export filtered records to CSV"
            >
              {isExporting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              ) : (
                <Download className="w-4 h-4 text-blue-400" />
              )}
              <span>Export to CSV ({filteredClients.length})</span>
            </button>
          </div>
        </div>

        {/* Data View */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              Client Submissions ({filteredClients.length})
            </h3>
            {dataLoading && (
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Live sync...
              </span>
            )}
          </div>

          {filteredClients.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-slate-700">No client records found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {searchTerm
                  ? 'No records matched your search query. Try clearing your search filter.'
                  : 'Client submissions entered via the Client app will automatically show up here in real time.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-6">Party & Details</th>
                    <th className="py-3 px-6">Contact Number</th>
                    <th className="py-3 px-6">Capacity & Machines</th>
                    <th className="py-3 px-6">Factory Photos</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6">Submitted At</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {filteredClients.map((client) => {
                    const isRowUpdating = updatingId === client.id;
                    return (
                      <tr
                        key={client.id}
                        onClick={() => setSelectedClient(client)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-900">{client.partyName}</div>
                          <div className="text-xs text-slate-500 line-clamp-1 max-w-xs">{client.address}</div>
                        </td>

                        <td className="py-4 px-6">
                          <span className="font-mono font-medium text-slate-700">{client.contactNumber}</span>
                        </td>

                        <td className="py-4 px-6">
                          <div className="font-medium text-slate-800">{client.machineCount} machines</div>
                          <div className="text-xs text-slate-500">{client.monthlyCapacity}</div>
                        </td>

                        {/* Interactive Photo Thumbnails */}
                        <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                          {client.photos && client.photos.length > 0 ? (
                            <div className="flex items-center gap-1.5">
                              {client.photos.map((photo, pIdx) => (
                                <div
                                  key={pIdx}
                                  onClick={(e) => openLightbox(client.photos!, pIdx, client.partyName, e)}
                                  className="relative w-9 h-9 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 hover:border-blue-500 hover:ring-2 hover:ring-blue-400/40 hover:scale-105 transition-all cursor-pointer group/thumb flex-shrink-0 shadow-xs"
                                  title={`View photo #${pIdx + 1} (${client.partyName})`}
                                >
                                  <img
                                    src={photo}
                                    alt={`${client.partyName} photo ${pIdx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                                    <Eye className="w-3.5 h-3.5 text-white drop-shadow" />
                                  </div>
                                </div>
                              ))}
                              <span className="text-[10px] font-bold text-slate-500 ml-1 px-1.5 py-0.5 rounded bg-slate-100">
                                {client.photos.length}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <ImageIcon className="w-3.5 h-3.5 text-slate-300" />
                              <span className="italic">No photos</span>
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-6">
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

                        <td className="py-4 px-6 text-xs text-slate-500">
                          {formatDate(client.createdAt)}
                        </td>

                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {/* Verify Action */}
                            <button
                              disabled={isRowUpdating || client.status === 'verified'}
                              onClick={(e) => handleUpdateStatus(client.id, 'verified', e)}
                              className={`p-1.5 rounded-lg border transition ${
                                client.status === 'verified'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600 opacity-60 cursor-default'
                                  : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-500 hover:text-emerald-700'
                              }`}
                              title="Verify Client"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>

                            {/* Reject Action */}
                            <button
                              disabled={isRowUpdating || client.status === 'rejected'}
                              onClick={(e) => handleUpdateStatus(client.id, 'rejected', e)}
                              className={`p-1.5 rounded-lg border transition ${
                                client.status === 'rejected'
                                  ? 'bg-rose-50 border-rose-200 text-rose-600 opacity-60 cursor-default'
                                  : 'border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-500 hover:text-rose-700'
                              }`}
                              title="Reject Client"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>

                            {/* Reset to Pending Action */}
                            <button
                              disabled={isRowUpdating || client.status === 'submitted'}
                              onClick={(e) => handleUpdateStatus(client.id, 'submitted', e)}
                              className={`p-1.5 rounded-lg border transition ${
                                client.status === 'submitted'
                                  ? 'bg-amber-50 border-amber-200 text-amber-600 opacity-60 cursor-default'
                                  : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50 text-slate-500 hover:text-amber-700'
                              }`}
                              title="Reset to Pending"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>

                            {/* Delete Action */}
                            <button
                              disabled={isRowUpdating}
                              onClick={() => setDeletingClient(client)}
                              className="p-1.5 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                              title="Delete Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Details Modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Client Details</h3>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Party Name</span>
                <p className="text-lg font-extrabold text-slate-900">{selectedClient.partyName}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Contact Number</span>
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {selectedClient.contactNumber}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
                  <div className="mt-0.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        selectedClient.status === 'verified'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : selectedClient.status === 'rejected'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {selectedClient.status || 'submitted'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Machine Count</span>
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                    <Cpu className="w-3.5 h-3.5 text-slate-400" />
                    {selectedClient.machineCount} Units
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Monthly Capacity</span>
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                    <Gauge className="w-3.5 h-3.5 text-slate-400" />
                    {selectedClient.monthlyCapacity}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Address</span>
                <p className="text-xs text-slate-700 flex items-start gap-1.5 mt-1 bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  {selectedClient.address}
                </p>
              </div>

              {/* Photo Gallery in Details Modal */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-blue-600" />
                    Factory / Office Photos ({selectedClient.photos?.length || 0})
                  </span>
                  {selectedClient.photos && selectedClient.photos.length > 0 && (
                    <span className="text-[11px] text-blue-600 font-medium">Click thumbnail to enlarge</span>
                  )}
                </div>

                {selectedClient.photos && selectedClient.photos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2.5">
                    {selectedClient.photos.map((photo, pIdx) => (
                      <div
                        key={pIdx}
                        onClick={() => openLightbox(selectedClient.photos!, pIdx, selectedClient.partyName)}
                        className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-video sm:aspect-square cursor-pointer shadow-sm hover:border-blue-500 transition"
                      >
                        <img
                          src={photo}
                          alt={`${selectedClient.partyName} - Photo ${pIdx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                          <Maximize2 className="w-3.5 h-3.5 text-white drop-shadow" />
                          <span className="text-[10px] text-white font-semibold">View</span>
                        </div>
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-white rounded text-[9px] font-bold">
                          #{pIdx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <ImageIcon className="w-4 h-4 text-slate-300" />
                    <span>No factory/office photos attached for this client.</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs text-slate-500">
                <div>
                  <span className="font-semibold text-slate-600 block">Submitted By:</span>
                  <span className="truncate block">{selectedClient.submittedBy}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-600 block">Submission Time:</span>
                  <span>{formatDate(selectedClient.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer / Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setDeletingClient(selectedClient)}
                className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs transition flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Record
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdateStatus(selectedClient.id, 'verified')}
                  disabled={updatingId === selectedClient.id || selectedClient.status === 'verified'}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition disabled:opacity-50 flex items-center gap-1"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Verify
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedClient.id, 'rejected')}
                  disabled={updatingId === selectedClient.id || selectedClient.status === 'rejected'}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-sm transition disabled:opacity-50 flex items-center gap-1"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedClient.id, 'submitted')}
                  disabled={updatingId === selectedClient.id || selectedClient.status === 'submitted'}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs transition disabled:opacity-50 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Admin) */}
      {deletingClient && (
        <div className="fixed inset-0 z-[65] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Client Record?</h3>
                <p className="text-xs text-slate-500">Permanent administrative deletion.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              Are you sure you want to permanently delete{' '}
              <span className="font-bold text-slate-900">"{deletingClient.partyName}"</span> ({deletingClient.contactNumber}) from the database?
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingClient(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-md shadow-rose-500/25 transition flex items-center gap-2 disabled:opacity-60"
              >
                {isDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Yes, Delete Record</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox Modal with Zoom & Pan */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 animate-in fade-in duration-200 select-none"
          onClick={closeLightbox}
        >
          {/* Lightbox Header & Zoom Controls */}
          <div
            className="w-full max-w-5xl mx-auto flex items-center justify-between text-white pb-3 border-b border-slate-800/80 gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white leading-tight truncate">{lightbox.partyName}</h4>
                <p className="text-xs text-slate-400">
                  Photo {lightbox.currentIndex + 1} of {lightbox.photos.length}
                </p>
              </div>
            </div>

            {/* Zoom & Rotation Toolbar */}
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 backdrop-blur-md px-2 py-1 rounded-xl shadow-lg text-white">
                <button
                  type="button"
                  onClick={() => setLightboxZoom((prev) => {
                    const next = Math.max(prev - 0.5, 1);
                    if (next === 1) setLightboxPosition({ x: 0, y: 0 });
                    return next;
                  })}
                  disabled={lightboxZoom <= 1}
                  className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition text-slate-300 hover:text-white"
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={resetLightboxZoom}
                  className="px-2 py-0.5 rounded text-xs font-mono font-bold text-blue-400 hover:bg-white/10 transition"
                  title="Click to reset zoom"
                >
                  {Math.round(lightboxZoom * 100)}%
                </button>

                <button
                  type="button"
                  onClick={() => setLightboxZoom((prev) => Math.min(prev + 0.5, 4))}
                  disabled={lightboxZoom >= 4}
                  className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition text-slate-300 hover:text-white"
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-slate-700 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setLightboxRotation((prev) => (prev + 90) % 360)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition text-slate-300 hover:text-white"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={resetLightboxZoom}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition text-slate-300 hover:text-white"
                  title="Reset Fit (1:1)"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={closeLightbox}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700/60"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Center Content with Zoom & Pan */}
          <div
            className="relative flex-1 flex items-center justify-center my-2 sm:my-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              e.preventDefault();
              if (e.deltaY < 0) {
                setLightboxZoom((prev) => Math.min(prev + 0.25, 4));
              } else {
                setLightboxZoom((prev) => {
                  const next = Math.max(prev - 0.25, 1);
                  if (next === 1) setLightboxPosition({ x: 0, y: 0 });
                  return next;
                });
              }
            }}
            onMouseDown={(e) => {
              if (lightboxZoom > 1) {
                setIsLightboxDragging(true);
                setLightboxDragStart({ x: e.clientX - lightboxPosition.x, y: e.clientY - lightboxPosition.y });
              }
            }}
            onMouseMove={(e) => {
              if (isLightboxDragging && lightboxZoom > 1) {
                setLightboxPosition({ x: e.clientX - lightboxDragStart.x, y: e.clientY - lightboxDragStart.y });
              }
            }}
            onMouseUp={() => setIsLightboxDragging(false)}
            onMouseLeave={() => setIsLightboxDragging(false)}
            onDoubleClick={() => {
              if (lightboxZoom > 1) {
                resetLightboxZoom();
              } else {
                setLightboxZoom(2.5);
              }
            }}
          >
            {/* Prev Button */}
            {lightbox.photos.length > 1 && (
              <button
                onClick={prevLightboxPhoto}
                className="absolute left-2 sm:left-6 z-20 p-3 rounded-full bg-slate-900/80 hover:bg-blue-600 text-white transition shadow-xl border border-slate-700/60 hover:scale-110"
                title="Previous Photo (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Main Zoomable Image */}
            <div className="max-h-[70vh] max-w-[90vw] flex items-center justify-center">
              <img
                src={lightbox.photos[lightbox.currentIndex]}
                alt={`${lightbox.partyName} Full Size ${lightbox.currentIndex + 1}`}
                draggable={false}
                style={{
                  transform: `translate(${lightboxPosition.x}px, ${lightboxPosition.y}px) scale(${lightboxZoom}) rotate(${lightboxRotation}deg)`,
                  transition: isLightboxDragging ? 'none' : 'transform 0.15s ease-out',
                  touchAction: 'none'
                }}
                className="max-h-[68vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800/80 cursor-grab active:cursor-grabbing select-none"
              />
            </div>

            {/* Next Button */}
            {lightbox.photos.length > 1 && (
              <button
                onClick={nextLightboxPhoto}
                className="absolute right-2 sm:right-6 z-20 p-3 rounded-full bg-slate-900/80 hover:bg-blue-600 text-white transition shadow-xl border border-slate-700/60 hover:scale-110"
                title="Next Photo (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Lightbox Bottom Thumbnail Strip & Hint */}
          <div
            className="w-full max-w-xl mx-auto flex flex-col items-center gap-2 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.photos.length > 1 && (
              <div className="flex items-center justify-center gap-2 overflow-x-auto max-w-full py-1">
                {lightbox.photos.map((imgSrc, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      resetLightboxZoom();
                      setLightbox((prev) => (prev ? { ...prev, currentIndex: idx } : null));
                    }}
                    className={`relative w-12 h-12 rounded-xl overflow-hidden border-2 transition flex-shrink-0 ${
                      lightbox.currentIndex === idx
                        ? 'border-blue-500 ring-2 ring-blue-400/50 scale-105'
                        : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={imgSrc} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 text-center select-none">
              💡 Scroll mouse to zoom • Drag to pan when zoomed • Double click to zoom in/reset
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
