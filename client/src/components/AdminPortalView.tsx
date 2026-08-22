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
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  LogOut,
  PhoneCall,
  Cpu,
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
  ChevronDown,
  Scissors,
  Tag
} from 'lucide-react';
import { ImageLightboxModal } from './ImageLightboxModal';
import { callPhoneNumber } from '../services/dialerService';
import {
  requestNotificationPermission,
  sendDeviceNotification,
  playNotificationSound
} from '../services/notificationService';
import { setAppBadgeCount } from '../services/badgeService';
import {
  exportClientsToExcel,
  exportClientsToCSV,
  type ExportableClient
} from '../services/exportService';

export interface ClientRecord {
  id: string;
  partyName: string;
  contactPerson?: string;
  contactNumber: string;
  gstNumber?: string;
  cityMarket?: string;
  fabricType?: string;
  weaveSpecs?: string;
  requirementType?: string;
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

  // Delete modal state
  const [deletingClient, setDeletingClient] = useState<ClientRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Export menu dropdown state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Live Notifications State
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeAlerts, setActiveAlerts] = useState<NewEntryAlert[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NewEntryAlert[]>([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Track known IDs to distinguish initial load vs new arrivals
  const isInitialLoadRef = useRef(true);
  const knownClientIdsRef = useRef<Set<string>>(new Set());

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setShowNotificationsPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Request native & browser notification permissions on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Trigger sound, toast alert and system notification for new entries
  const triggerNewEntryAlert = useCallback((newRecord: ClientRecord) => {
    const alertId = `${newRecord.id || Date.now()}-${Math.random()}`;
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
      `New Fabric Order: ${newRecord.partyName}`,
      `Submitted by ${newRecord.submittedBy} • ${newRecord.contactNumber} • ${newRecord.machineCount} looms`
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

  // Update launcher home screen app icon badge with pending review count
  useEffect(() => {
    const pendingCount = clients.filter((c) => c.status === 'submitted' || !c.status).length;
    setAppBadgeCount(pendingCount);
  }, [clients]);

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

      setActionSuccess(`Order status updated to "${newStatus.toUpperCase()}".`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert(error.message || 'Failed to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Delete handler
  const handleDeleteClient = async () => {
    if (!deletingClient) return;
    const clientName = deletingClient.partyName;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'clients', deletingClient.id));
      if (selectedClient && selectedClient.id === deletingClient.id) {
        setSelectedClient(null);
      }
      setDeletingClient(null);
      setActionSuccess(`Order "${clientName}" was permanently deleted.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert(error.message || 'Failed to delete order.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open Lightbox
  const openLightbox = (
    photosList: string[],
    startIndex = 0,
    title = 'Fabric Swatch Inspection',
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setLightboxPhotos(photosList);
    setLightboxIndex(startIndex);
    setLightboxTitle(title);
    setIsLightboxOpen(true);
  };

  // Filtered clients based on status and search query
  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const currentStatus = client.status || 'submitted';
      const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter;
      if (!matchesStatus) return false;

      if (!searchTerm.trim()) return true;

      const q = searchTerm.toLowerCase();
      return (
        client.partyName?.toLowerCase().includes(q) ||
        client.contactPerson?.toLowerCase().includes(q) ||
        client.contactNumber?.toLowerCase().includes(q) ||
        client.cityMarket?.toLowerCase().includes(q) ||
        client.fabricType?.toLowerCase().includes(q) ||
        client.address?.toLowerCase().includes(q) ||
        client.submittedBy?.toLowerCase().includes(q)
      );
    });
  }, [clients, statusFilter, searchTerm]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = clients.length;
    const submitted = clients.filter((c) => !c.status || c.status === 'submitted').length;
    const verified = clients.filter((c) => c.status === 'verified').length;
    const rejected = clients.filter((c) => c.status === 'rejected').length;
    return { total, submitted, verified, rejected };
  }, [clients]);

  // Export handler
  const handleExport = async (format: 'xlsx' | 'csv') => {
    setShowExportMenu(false);
    setIsExporting(true);
    try {
      const exportableList: ExportableClient[] = filteredClients.map((c) => ({
        id: c.id,
        partyName: c.partyName,
        contactPerson: c.contactPerson,
        contactNumber: c.contactNumber,
        gstNumber: c.gstNumber,
        cityMarket: c.cityMarket,
        fabricType: c.fabricType,
        weaveSpecs: c.weaveSpecs,
        requirementType: c.requirementType,
        machineCount: c.machineCount,
        monthlyCapacity: c.monthlyCapacity,
        address: c.address,
        photos: c.photos,
        status: c.status || 'submitted',
        submittedBy: c.submittedBy,
        createdAt: c.createdAt
      }));

      const filterLabel =
        statusFilter === 'all'
          ? 'All'
          : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1);

      if (format === 'xlsx') {
        await exportClientsToExcel(exportableList, filterLabel);
      } else {
        await exportClientsToCSV(exportableList, filterLabel);
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert(`Export error: ${error.message || 'Unknown export failure'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const formatDate = (timestamp?: Timestamp | null) => {
    if (!timestamp) return 'Recent';
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Top Navigation Header with Texhub Branding */}
      <header
        className="bg-slate-900/95 border-b border-slate-800 sticky top-0 z-30 shadow-md backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-[#FF5722] flex items-center justify-center shadow-md">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight">
                  <span className="text-white">TEX</span><span className="text-[#FF5722]">HUB</span>
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/30">
                  ADMIN CONSOLE
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Fabric Designing | Developing | Weaving</p>
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
                    ? 'bg-[#FF5722]/20 border-[#FF5722] text-[#FF5722]'
                    : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Live Entry Alerts"
              >
                {notificationHistory.length > 0 ? (
                  <BellRing className="w-4 h-4 text-[#FF5722]" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {notificationHistory.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF5722] text-white rounded-full text-[10px] font-black flex items-center justify-center shadow-sm animate-pulse">
                    {notificationHistory.length > 9 ? '9+' : notificationHistory.length}
                  </span>
                )}
              </button>

              {showNotificationsPanel && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#FF5722]" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Live Orders ({notificationHistory.length})
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

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800">
                    {notificationHistory.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No new orders received during this session yet.
                      </div>
                    ) : (
                      notificationHistory.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => viewAlertClient(item.client)}
                          className="p-3 hover:bg-slate-800/60 transition cursor-pointer flex items-start gap-3 group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-[#FF5722]/20 text-[#FF5722] flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#FF5722] group-hover:text-white transition">
                            <Scissors className="w-4 h-4" />
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
              <div className="w-9 h-9 rounded-full bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/40 flex items-center justify-center font-bold text-xs">
                {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : currentUser.email?.charAt(0).toUpperCase() || 'A'}
              </div>
            )}

            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-bold text-white max-w-[150px] truncate">
                {currentUser.displayName || currentUser.email}
              </span>
              <span className="text-[10px] text-[#FF5722] font-semibold uppercase tracking-wider">
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
            className="pointer-events-auto rounded-2xl bg-slate-900 border border-[#FF5722]/60 shadow-2xl p-4 animate-in slide-in-from-top-6 fade-in duration-300 ring-4 ring-[#FF5722]/20 overflow-hidden relative text-white"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#FF5722] uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>New Texhub Order!</span>
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
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
                <div className="w-12 h-12 rounded-xl bg-[#FF5722]/20 text-[#FF5722] flex items-center justify-center flex-shrink-0 border border-[#FF5722]/30">
                  <Scissors className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-white truncate">
                  {alert.client.partyName}
                </h4>
                <p className="text-xs text-slate-300 font-medium mt-0.5">
                  📞 {alert.client.contactNumber} • ⚙️ {alert.client.machineCount} looms
                </p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Submitted by <span className="font-semibold text-slate-200">{alert.client.submittedBy}</span>
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={() => dismissAlert(alert.id)}
                className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-white transition"
              >
                Dismiss
              </button>
              <button
                onClick={() => viewAlertClient(alert.client)}
                className="px-3 py-1 bg-[#FF5722] hover:bg-[#E64A19] text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1"
              >
                <span>Inspect Order</span>
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
          <div className="bg-slate-900/90 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Orders</span>
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-white mt-2">{metrics.total}</p>
          </div>

          <div className="bg-slate-900/90 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Pending Review</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-400 mt-2">{metrics.submitted}</p>
          </div>

          <div className="bg-slate-900/90 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Verified</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2">{metrics.verified}</p>
          </div>

          <div className="bg-slate-900/90 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-md">
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
        <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by mill, person, phone, city, fabric..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5722] focus:border-[#FF5722] placeholder-slate-500 transition"
            />
          </div>

          <div className="flex items-center gap-2.5 justify-between md:justify-end overflow-x-auto pb-1 md:pb-0">
            {/* Status Filter Tabs */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 flex-shrink-0">
              {(['all', 'submitted', 'verified', 'rejected'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition ${
                    statusFilter === filter
                      ? 'bg-[#FF5722] text-white shadow-sm'
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
                className="px-3.5 py-2 bg-[#FF5722] hover:bg-[#E64A19] active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-[#FF5722]/30 transition flex items-center gap-2 disabled:opacity-60"
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
                <div className="absolute right-0 mt-2 w-56 bg-slate-900 rounded-xl shadow-2xl border border-slate-700 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    onClick={() => handleExport('xlsx')}
                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2.5 transition"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>Texhub Excel Report (.xlsx)</span>
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2.5 transition"
                  >
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>Texhub CSV Report (.csv)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Client Records Table */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-md overflow-hidden">
          {dataLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-7 h-7 animate-spin text-[#FF5722]" />
              <p className="text-xs font-medium tracking-wide">Syncing Texhub order records...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-16 text-center text-slate-400 px-4">
              <Scissors className="w-12 h-12 mx-auto mb-3 text-slate-700" />
              <p className="text-sm font-bold text-slate-300">No textile orders found</p>
              <p className="text-xs text-slate-500 mt-1">Try selecting another filter or clear search input.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Mill & Contact</th>
                    <th className="py-3.5 px-4">Fabric & Specs</th>
                    <th className="py-3.5 px-4">Looms & Volume</th>
                    <th className="py-3.5 px-4">Swatches</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Field Agent</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className="hover:bg-slate-800/40 transition cursor-pointer group"
                    >
                      {/* Mill & Contact */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-white group-hover:text-[#FF5722] transition">
                          {client.partyName}
                        </div>
                        {client.contactPerson && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            {client.contactPerson}
                          </div>
                        )}
                        <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                          <span>{client.contactNumber}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              callPhoneNumber(client.contactNumber);
                            }}
                            className="p-1 rounded-lg bg-[#FF5722]/20 text-[#FF5722] hover:bg-[#FF5722] hover:text-white transition"
                            title="Call Mill / Client directly"
                          >
                            <PhoneCall className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Fabric & Specs */}
                      <td className="py-4 px-4">
                        <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/30">
                          {client.fabricType || 'Cotton Woven Dobby'}
                        </span>
                        {client.weaveSpecs && (
                          <div className="text-xs text-slate-400 mt-1 truncate max-w-xs">
                            {client.weaveSpecs}
                          </div>
                        )}
                        {client.cityMarket && (
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-500" />
                            <span>{client.cityMarket}</span>
                          </div>
                        )}
                      </td>

                      {/* Looms & Volume */}
                      <td className="py-4 px-4">
                        <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-[#FF5722]" />
                          <span>{client.machineCount} looms</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
                          {client.monthlyCapacity}
                        </div>
                      </td>

                      {/* Swatch Thumbnails */}
                      <td className="py-4 px-4">
                        {client.photos && client.photos.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            {client.photos.slice(0, 2).map((photo, pIdx) => (
                              <img
                                key={pIdx}
                                src={photo}
                                alt="swatch thumb"
                                onClick={(e) => openLightbox(client.photos!, pIdx, client.partyName, e)}
                                className="w-9 h-9 rounded-lg object-cover border border-slate-700 hover:scale-105 transition shadow-sm cursor-zoom-in"
                              />
                            ))}
                            {client.photos.length > 2 && (
                              <span
                                onClick={(e) => openLightbox(client.photos!, 2, client.partyName, e)}
                                className="w-9 h-9 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center border border-slate-700 hover:bg-slate-700 transition cursor-zoom-in"
                              >
                                +{client.photos.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">No swatches</span>
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

                      {/* Submitter */}
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
          <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col text-white">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <Scissors className="w-5 h-5 text-[#FF5722]" />
                <h3 className="font-bold text-white text-base truncate">{selectedClient.partyName}</h3>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
              {/* Call Client & Submitter Section */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Contact / Submitter
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono font-bold text-white">{selectedClient.contactNumber}</span>
                    {selectedClient.contactPerson && (
                      <span className="text-xs text-slate-300">({selectedClient.contactPerson})</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Field Agent: {selectedClient.submittedBy}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => callPhoneNumber(selectedClient.contactNumber)}
                    className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-[#FF5722] hover:bg-[#E64A19] text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Call Mill Contact</span>
                  </button>
                </div>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Scissors className="w-3.5 h-3.5 text-[#FF5722]" />
                    Fabric Type
                  </span>
                  <p className="font-semibold text-slate-200 mt-1">{selectedClient.fabricType || 'Cotton Woven Dobby'}</p>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-[#FF5722]" />
                    Requirement
                  </span>
                  <p className="font-semibold text-slate-200 mt-1">{selectedClient.requirementType || 'Make to Order'}</p>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-[#FF5722]" />
                    Looms / Machines
                  </span>
                  <p className="font-semibold text-slate-200 mt-1">{selectedClient.machineCount} looms</p>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 text-[#FF5722]" />
                    Monthly Capacity
                  </span>
                  <p className="font-semibold text-slate-200 mt-1">{selectedClient.monthlyCapacity}</p>
                </div>

                {selectedClient.gstNumber && (
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase">GST Number</span>
                    <p className="font-mono text-slate-200 mt-1">{selectedClient.gstNumber}</p>
                  </div>
                )}

                {selectedClient.cityMarket && (
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase">City / Market</span>
                    <p className="text-slate-200 mt-1">{selectedClient.cityMarket}</p>
                  </div>
                )}

                <div className="col-span-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">Weave & Quality Specs</span>
                  <p className="text-slate-200 mt-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-xs">
                    {selectedClient.weaveSpecs || 'Standard Dobby Construction'}
                  </p>
                </div>

                <div className="col-span-2">
                  <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#FF5722]" />
                    Mill / Factory Address
                  </span>
                  <p className="text-slate-300 mt-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    {selectedClient.address}
                  </p>
                </div>
              </div>

              {/* Swatch Photos Lightbox Trigger */}
              {selectedClient.photos && selectedClient.photos.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Fabric Swatch & Mill Photos ({selectedClient.photos.length}) — Click to Zoom
                  </span>
                  <div className="grid grid-cols-3 gap-2.5">
                    {selectedClient.photos.map((photo, pIdx) => (
                      <div
                        key={pIdx}
                        onClick={(e) => openLightbox(selectedClient.photos!, pIdx, selectedClient.partyName, e)}
                        className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-950 aspect-square cursor-zoom-in shadow-sm"
                      >
                        <img
                          src={photo}
                          alt={`Swatch ${pIdx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white rounded text-[10px] font-bold">
                          #{pIdx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-3">
              <button
                onClick={() => setDeletingClient(selectedClient)}
                className="px-3.5 py-2 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Order</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handleUpdateStatus(selectedClient.id, 'rejected', e)}
                  disabled={updatingId === selectedClient.id || selectedClient.status === 'rejected'}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject</span>
                </button>

                <button
                  onClick={(e) => handleUpdateStatus(selectedClient.id, 'verified', e)}
                  disabled={updatingId === selectedClient.id || selectedClient.status === 'verified'}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Verify</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 max-w-md w-full p-6 space-y-4 text-white animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Permanently Delete Order?</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              Are you sure you want to delete the record for{' '}
              <span className="font-bold text-white">"{deletingClient.partyName}"</span> ({deletingClient.contactNumber})?
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingClient(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteClient}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/30 transition flex items-center gap-2 disabled:opacity-60 active:scale-95"
              >
                {isDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Yes, Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Lightbox Modal */}
      <ImageLightboxModal
        isOpen={isLightboxOpen}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        title={lightboxTitle}
        onClose={() => setIsLightboxOpen(false)}
      />
    </div>
  );
};
