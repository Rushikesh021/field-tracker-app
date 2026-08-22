import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '../config/firebase';
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
  PhoneCall,
  Cpu,
  AlertTriangle,
  RefreshCw,
  X,
  Download,
  Trash2,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  Sparkles,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Gauge,
  MapPin,
  ChevronDown
} from 'lucide-react';
import { ImageLightboxModal } from './ImageLightboxModal';
import { callPhoneNumber } from '../services/dialerService';
import {
  requestNotificationPermission,
  sendDeviceNotification,
  playNotificationSound
} from '../services/notificationService';
import {
  exportClientsToExcel,
  exportClientsToCSV,
  type ExportableClient
} from '../services/exportService';

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

interface AdminPortalViewProps {
  currentUser: User;
  onSignOut: () => void;
}

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  currentUser,
  onSignOut
}) => {
  // Data states
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Lightbox Modal state
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState('');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Delete Client state
  const [deletingClient, setDeletingClient] = useState<ClientRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Export dropdown state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Real-time Notification Alert States
  const [activeAlerts, setActiveAlerts] = useState<NewEntryAlert[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NewEntryAlert[]>([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Refs for tracking initial Firestore sync
  const isInitialLoadRef = useRef(true);
  const knownClientIdsRef = useRef<Set<string>>(new Set());
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Request notifications on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setShowNotificationsPanel(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Trigger New Entry Pop-up Alert
  const triggerNewEntryAlert = useCallback((newRecord: ClientRecord) => {
    const alertId = `${newRecord.id}-${Date.now()}`;
    const alertItem: NewEntryAlert = {
      id: alertId,
      client: newRecord,
      receivedAt: new Date()
    };

    setActiveAlerts((prev) => [alertItem, ...prev.slice(0, 3)]);
    setNotificationHistory((prev) => [alertItem, ...prev.slice(0, 49)]);

    if (soundEnabled) {
      playNotificationSound();
    }

    sendDeviceNotification(
      `New Client Intake: ${newRecord.partyName}`,
      `Submitted by ${newRecord.submittedBy} • ${newRecord.contactNumber} • ${newRecord.machineCount} machines`
    );

    // Auto-dismiss floating banner after 7 seconds
    setTimeout(() => {
      setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
    }, 7000);
  }, [soundEnabled]);

  const dismissAlert = (alertId: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const viewAlertClient = (client: ClientRecord) => {
    setSelectedClient(client);
    setShowNotificationsPanel(false);
  };

  // Real-time Firestore Listener
  useEffect(() => {
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
      (error) => {
        console.warn('Fallback querying clients without order due to composite index:', error);
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
  }, [triggerNewEntryAlert]);

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
      setActionSuccess(`Record marked as ${newStatus}.`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status.');
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

  // Open Lightbox
  const openLightbox = (photos: string[], startIndex = 0, title = 'Client Photos', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLightboxPhotos(photos);
    setLightboxIndex(startIndex);
    setLightboxTitle(title);
    setIsLightboxOpen(true);
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

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setShowExportMenu(false);
    setIsExporting(true);
    try {
      const filterLabel = statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1);
      if (format === 'xlsx') {
        await exportClientsToExcel(filteredClients as ExportableClient[], filterLabel);
      } else {
        await exportClientsToCSV(filteredClients as ExportableClient[], filterLabel);
      }
    } finally {
      setIsExporting(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col antialiased">
      {/* Top Navigation Header */}
      <header
        className="bg-slate-900/95 border-b border-slate-800 sticky top-0 z-30 shadow-md backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Field Tracker
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  ADMIN DASHBOARD
                </span>
              </div>
              <p className="text-xs text-slate-400">Live Client Verification & Management</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border transition ${
                soundEnabled
                  ? 'border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              }`}
              title={soundEnabled ? 'Alert Sounds: On' : 'Alert Sounds: Muted'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Notification Bell with Dropdown */}
            <div className="relative" ref={notifDropdownRef}>
              <button
                onClick={() => setShowNotificationsPanel(!showNotificationsPanel)}
                className={`p-2 rounded-xl border transition relative ${
                  showNotificationsPanel
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Live Entry Alerts"
              >
                {notificationHistory.length > 0 ? (
                  <BellRing className="w-4 h-4 text-indigo-400" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {notificationHistory.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-black flex items-center justify-center shadow-sm animate-pulse">
                    {notificationHistory.length > 9 ? '9+' : notificationHistory.length}
                  </span>
                )}
              </button>

              {showNotificationsPanel && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-3.5 bg-slate-900/80 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Live Submissions ({notificationHistory.length})
                      </span>
                    </div>
                    {notificationHistory.length > 0 && (
                      <button
                        onClick={() => setNotificationHistory([])}
                        className="text-[11px] font-semibold text-slate-400 hover:text-rose-400 transition"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-700/60">
                    {notificationHistory.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No new entries received during this session yet.
                      </div>
                    ) : (
                      notificationHistory.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => viewAlertClient(item.client)}
                          className="p-3 hover:bg-slate-700/50 transition cursor-pointer flex items-start gap-3 group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-indigo-600 group-hover:text-white transition">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-white truncate">
                                {item.client.partyName}
                              </p>
                              <span className="text-[10px] text-slate-400">
                                {item.receivedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 mt-0.5 truncate">
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

            {/* User Profile Avatar */}
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Admin Avatar"
                className="w-9 h-9 rounded-full object-cover border border-slate-700 shadow-sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs">
                {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : currentUser.email?.charAt(0).toUpperCase() || 'A'}
              </div>
            )}

            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-bold text-white max-w-[150px] truncate">
                {currentUser.displayName || currentUser.email}
              </span>
              <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">
                Administrator
              </span>
            </div>

            {/* Accessible Logout Button */}
            <button
              onClick={onSignOut}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition border border-slate-700"
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
            className="pointer-events-auto rounded-2xl bg-slate-800 border border-indigo-500/60 shadow-2xl p-4 animate-in slide-in-from-top-6 fade-in duration-300 ring-4 ring-indigo-500/20 overflow-hidden relative text-white"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>New Client Intake!</span>
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-start gap-3">
              {alert.client.photos && alert.client.photos.length > 0 ? (
                <img
                  src={alert.client.photos[0]}
                  alt={alert.client.partyName}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-700 flex-shrink-0 shadow-xs"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center flex-shrink-0 border border-indigo-500/30">
                  <Building2 className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-white truncate">
                  {alert.client.partyName}
                </h4>
                <p className="text-xs text-slate-300 font-medium mt-0.5">
                  📞 {alert.client.contactNumber} • ⚙️ {alert.client.machineCount} machines
                </p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Submitted by <span className="font-semibold text-slate-200">{alert.client.submittedBy}</span>
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-700 flex items-center justify-end gap-2">
              <button
                onClick={() => dismissAlert(alert.id)}
                className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-white transition"
              >
                Dismiss
              </button>
              <button
                onClick={() => viewAlertClient(alert.client)}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1"
              >
                <span>Inspect Entry</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <main
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 w-full space-y-6"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Action Success Alert */}
        {actionSuccess && (
          <div className="rounded-2xl bg-emerald-950/80 border border-emerald-600/50 p-4 shadow-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-2.5 text-emerald-200 text-sm font-semibold">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-800/90 rounded-2xl p-4 sm:p-5 border border-slate-700/80 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Clients</span>
              <div className="w-8 h-8 rounded-lg bg-slate-700 text-slate-300 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-white mt-2">{metrics.total}</p>
          </div>

          <div className="bg-slate-800/90 rounded-2xl p-4 sm:p-5 border border-slate-700/80 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Pending Review</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-400 mt-2">{metrics.submitted}</p>
          </div>

          <div className="bg-slate-800/90 rounded-2xl p-4 sm:p-5 border border-slate-700/80 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Verified</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2">{metrics.verified}</p>
          </div>

          <div className="bg-slate-800/90 rounded-2xl p-4 sm:p-5 border border-slate-700/80 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Rejected</span>
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-rose-400 mt-2">{metrics.rejected}</p>
          </div>
        </div>

        {/* Toolbar: Search, Filters & Export Menu */}
        <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700/80 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by party, phone, address, submitter..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-500 transition"
            />
          </div>

          <div className="flex items-center gap-2.5 justify-between md:justify-end overflow-x-auto pb-1 md:pb-0">
            {/* Status Filter Tabs */}
            <div className="flex rounded-xl bg-slate-900/80 p-1 border border-slate-700 flex-shrink-0">
              {(['all', 'submitted', 'verified', 'rejected'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition ${
                    statusFilter === filter
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Export Dropdown Button */}
            <div className="relative flex-shrink-0" ref={exportDropdownRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={isExporting}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 transition flex items-center gap-2 disabled:opacity-60"
                title="Export filtered records"
              >
                {isExporting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Export ({filteredClients.length})</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    onClick={() => handleExport('xlsx')}
                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white flex items-center gap-2.5 transition"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>Export as Excel (.xlsx)</span>
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white flex items-center gap-2.5 transition"
                  >
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>Export as CSV (.csv)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Client Records Table / Cards */}
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 shadow-md overflow-hidden">
          {dataLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-7 h-7 animate-spin text-indigo-500" />
              <p className="text-xs font-medium tracking-wide">Syncing real-time records...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-16 text-center text-slate-400 px-4">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-sm font-bold text-slate-300">No client records found</p>
              <p className="text-xs text-slate-500 mt-1">Try selecting another filter or clear search input.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-700/80 bg-slate-900/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Party & Contact</th>
                    <th className="py-3.5 px-4">Capacity & Machines</th>
                    <th className="py-3.5 px-4">Photos</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Submitted By</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-sm">
                  {filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className="hover:bg-slate-700/30 transition cursor-pointer group"
                    >
                      {/* Party & Contact */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-white group-hover:text-indigo-400 transition">
                          {client.partyName}
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                          <span>{client.contactNumber}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              callPhoneNumber(client.contactNumber);
                            }}
                            className="p-1 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-600 hover:text-white transition"
                            title="Call Party directly"
                          >
                            <PhoneCall className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Capacity & Machines */}
                      <td className="py-4 px-4">
                        <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{client.machineCount} machines</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
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
                                className="w-9 h-9 rounded-lg object-cover border border-slate-700 hover:scale-105 transition shadow-sm cursor-zoom-in"
                              />
                            ))}
                            {client.photos.length > 2 && (
                              <span
                                onClick={(e) => openLightbox(client.photos!, 2, client.partyName, e)}
                                className="w-9 h-9 rounded-lg bg-slate-700 text-slate-300 text-[10px] font-bold flex items-center justify-center border border-slate-600 hover:bg-slate-600 transition cursor-zoom-in"
                              >
                                +{client.photos.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">No photos</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                            client.status === 'verified'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : client.status === 'rejected'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {client.status || 'submitted'}
                        </span>
                      </td>

                      {/* Submitter & Call Agent Button */}
                      <td className="py-4 px-4">
                        <div className="text-xs font-semibold text-slate-200 truncate max-w-[160px]">
                          {client.submittedBy}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {formatDate(client.createdAt)}
                        </div>
                      </td>

                      {/* Verification Actions */}
                      <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {client.status !== 'verified' && (
                            <button
                              onClick={(e) => handleUpdateStatus(client.id, 'verified', e)}
                              disabled={updatingId === client.id}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1 disabled:opacity-60 active:scale-95"
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
                              className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/40 transition flex items-center gap-1 disabled:opacity-60 active:scale-95"
                              title="Reject Record"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Reject</span>
                            </button>
                          )}

                          {/* Delete Record */}
                          <button
                            onClick={() => setDeletingClient(client)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition border border-transparent hover:border-rose-500/30"
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

      {/* Client Detail Review Modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col text-white">
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-900/80">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base truncate">{selectedClient.partyName}</h3>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
              {/* Call Agent & Contact Section */}
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Contact / Submitter
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono font-bold text-white">{selectedClient.contactNumber}</span>
                    <span className="text-xs text-slate-400">({selectedClient.submittedBy})</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => callPhoneNumber(selectedClient.contactNumber)}
                    className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Call Contact</span>
                  </button>
                </div>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                    Machines
                  </span>
                  <p className="font-semibold text-slate-200 mt-1">{selectedClient.machineCount} units</p>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                    Capacity
                  </span>
                  <p className="font-semibold text-slate-200 mt-1">{selectedClient.monthlyCapacity}</p>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Status</span>
                  <p className="mt-1">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                        selectedClient.status === 'verified'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : selectedClient.status === 'rejected'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {selectedClient.status || 'submitted'}
                    </span>
                  </p>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Submitted At</span>
                  <p className="text-slate-300 text-xs mt-1">{formatDate(selectedClient.createdAt)}</p>
                </div>
              </div>

              {/* Address */}
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                  Factory / Office Address
                </span>
                <p className="text-slate-300 text-xs leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
                  {selectedClient.address}
                </p>
              </div>

              {/* Photos Gallery */}
              {selectedClient.photos && selectedClient.photos.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    Attached Photos ({selectedClient.photos.length}) — Click to Inspect with Zoom
                  </span>
                  <div className="grid grid-cols-3 gap-2.5">
                    {selectedClient.photos.map((p, i) => (
                      <div
                        key={i}
                        onClick={() => openLightbox(selectedClient.photos!, i, selectedClient.partyName)}
                        className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-900 aspect-square cursor-zoom-in shadow-sm hover:scale-[1.02] transition"
                      >
                        <img src={p} alt="inspection" className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white text-[10px] font-bold rounded">
                          #{i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/80 flex items-center justify-between">
              <button
                onClick={() => setDeletingClient(selectedClient)}
                className="px-3 py-2 text-rose-400 hover:bg-rose-500/10 rounded-xl text-xs font-semibold transition"
              >
                Delete Record
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdateStatus(selectedClient.id, 'rejected')}
                  className="px-4 py-2 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/20 text-xs font-bold transition active:scale-95"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedClient.id, 'verified')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md active:scale-95"
                >
                  Verify Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal with Pinch-to-zoom & Pan */}
      <ImageLightboxModal
        isOpen={isLightboxOpen}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        title={lightboxTitle}
        onClose={() => setIsLightboxOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      {deletingClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full p-6 space-y-4 text-white animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-lg">Delete Record?</h3>
            </div>
            <p className="text-sm text-slate-300">
              Are you sure you want to permanently delete <span className="font-bold text-white">"{deletingClient.partyName}"</span>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingClient(null)}
                className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-700 text-sm font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md transition disabled:opacity-60 flex items-center gap-2 active:scale-95"
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
