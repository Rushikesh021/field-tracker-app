import React, { useState, useEffect, useCallback, useRef } from 'react';
import { auth, db } from './config/firebase';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import {
  Building2,
  Phone,
  Cpu,
  Gauge,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Send,
  UserCheck,
  Clock,
  Sparkles,
  RefreshCw,
  Eye,
  EyeOff,
  Camera,
  Image as ImageIcon,
  X,
  Upload,
  Trash2,
  Pencil,
  Save,
  Compass,
  User as UserIcon,
  Shield,
  Layers
} from 'lucide-react';
import { AdminPortalView } from './components/AdminPortalView';
import { ImageLightboxModal } from './components/ImageLightboxModal';
import { syncUserProfile, type UserProfile } from './services/userService';
import {
  sendDeviceNotification,
  playNotificationSound
} from './services/notificationService';
import { initializeNativePermissions } from './services/permissionService';
import {
  incrementAppBadgeCount,
  clearAppBadgeCount
} from './services/badgeService';
import {
  compressImageFile,
  compressBase64OrDataUrl
} from './services/imageService';

export interface ClientRecord {
  id?: string;
  partyName: string;
  contactNumber: string;
  machineCount: number;
  monthlyCapacity: string;
  address: string;
  photos?: string[];
  status: 'submitted' | 'verified' | 'rejected';
  submittedBy: string;
  submittedByUid: string;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
}

const INTAKE_DRAFT_KEY = 'field_tracker_intake_draft';

export default function App() {
  // Current user & role state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth Form State (Single Unified Login Screen)
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedSignupRole, setSelectedSignupRole] = useState<'agent' | 'admin'>('agent');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Agent Navigation Tab: 'intake' | 'submissions'
  const [agentActiveTab, setAgentActiveTab] = useState<'intake' | 'submissions'>('intake');

  // Intake Form State with Offline Form Preservation
  const [partyName, setPartyName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [machineCount, setMachineCount] = useState<string>('');
  const [monthlyCapacity, setMonthlyCapacity] = useState('');
  const [address, setAddress] = useState('');

  // Photos State (Up to 6 photos)
  const MAX_PHOTOS = 6;
  const [photos, setPhotos] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Lightbox Modal state
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState('');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Edit Entry State
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [editPartyName, setEditPartyName] = useState('');
  const [editContactNumber, setEditContactNumber] = useState('');
  const [editMachineCount, setEditMachineCount] = useState('');
  const [editMonthlyCapacity, setEditMonthlyCapacity] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [isEditCompressing, setIsEditCompressing] = useState(false);
  const [editPhotoError, setEditPhotoError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editCameraInputRef = useRef<HTMLInputElement>(null);

  // Delete Entry State
  const [deletingClient, setDeletingClient] = useState<ClientRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Deduplication state
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [duplicateClient, setDuplicateClient] = useState<ClientRecord | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // User's submissions history & status tracking
  const [mySubmissions, setMySubmissions] = useState<ClientRecord[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionFilter, setSubmissionFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('all');

  // Tracking previous statuses for real-time status change notification
  const previousStatusMapRef = useRef<Map<string, string>>(new Map());
  const isInitialSubmissionsLoadRef = useRef(true);

  // Modal open tracker refs for hardware back button handling
  const isLightboxOpenRef = useRef(isLightboxOpen);
  const editingClientRef = useRef(editingClient);
  const deletingClientRef = useRef(deletingClient);

  useEffect(() => {
    isLightboxOpenRef.current = isLightboxOpen;
  }, [isLightboxOpen]);

  useEffect(() => {
    editingClientRef.current = editingClient;
  }, [editingClient]);

  useEffect(() => {
    deletingClientRef.current = deletingClient;
  }, [deletingClient]);

  // Restore cached draft from localStorage on startup
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(INTAKE_DRAFT_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.partyName) setPartyName(parsed.partyName);
        if (parsed.contactNumber) setContactNumber(parsed.contactNumber);
        if (parsed.machineCount) setMachineCount(parsed.machineCount);
        if (parsed.monthlyCapacity) setMonthlyCapacity(parsed.monthlyCapacity);
        if (parsed.address) setAddress(parsed.address);
      }
    } catch (e) {
      console.warn('Error reading cached draft:', e);
    }
  }, []);

  // Save active form inputs to offline draft cache
  useEffect(() => {
    if (partyName || contactNumber || machineCount || monthlyCapacity || address) {
      try {
        localStorage.setItem(
          INTAKE_DRAFT_KEY,
          JSON.stringify({
            partyName,
            contactNumber,
            machineCount,
            monthlyCapacity,
            address
          })
        );
      } catch (e) {
        console.warn('Error saving draft:', e);
      }
    }
  }, [partyName, contactNumber, machineCount, monthlyCapacity, address]);

  // Initialize Native Features: Google Auth, Status Bar, Native Permissions, Hardware Back Button
  useEffect(() => {
    try {
      GoogleAuth.initialize({
        clientId: '328644306481-357er1eokqfe7lkbtsiv1tkrp8r05l31.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true
      });
    } catch (e) {
      console.warn('GoogleAuth initialization error:', e);
    }

    if (Capacitor.isNativePlatform()) {
      try {
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
        StatusBar.setBackgroundColor({ color: '#0f172a' }).catch(() => {});
      } catch (e) {
        console.warn('StatusBar error:', e);
      }
    }

    // Gracefully initialize all native permissions on startup
    initializeNativePermissions();

    // Handle Android hardware back button
    let backButtonHandle: any;
    if (Capacitor.isNativePlatform()) {
      backButtonHandle = CapApp.addListener('backButton', () => {
        if (isLightboxOpenRef.current) {
          setIsLightboxOpen(false);
          return;
        }
        if (editingClientRef.current) {
          setEditingClient(null);
          return;
        }
        if (deletingClientRef.current) {
          setDeletingClient(null);
          return;
        }
        // At root level, minimize or exit cleanly
        CapApp.exitApp();
      });
    }

    return () => {
      if (backButtonHandle) {
        backButtonHandle.then((h: any) => h.remove?.());
      }
    };
  }, []);

  // Listen to Auth State & Resolve Role from Firestore users collection
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setAuthLoading(true);
        try {
          const profile = await syncUserProfile(user);
          setUserProfile(profile);
        } catch (err) {
          console.warn('Error resolving user profile:', err);
        } finally {
          setAuthLoading(false);
        }
      } else {
        setUserProfile(null);
        setAuthLoading(false);
        clearAppBadgeCount();
      }
    });
    return () => unsubscribe();
  }, []);

  // Clear badge count when Agent views "My Submissions" tab
  useEffect(() => {
    if (agentActiveTab === 'submissions') {
      clearAppBadgeCount();
    }
  }, [agentActiveTab]);

  // Listen to Agent's submissions in real-time & Trigger Status Change Notifications & Badge Counters
  useEffect(() => {
    if (!currentUser) {
      setMySubmissions([]);
      return;
    }

    setSubmissionsLoading(true);
    isInitialSubmissionsLoadRef.current = true;

    const q = query(
      collection(db, 'clients'),
      where('submittedByUid', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records: ClientRecord[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ClientRecord, 'id'>)
        }));

        // Status change detection for Agent Push Notifications & App Icon Badges
        if (!isInitialSubmissionsLoadRef.current) {
          records.forEach((record) => {
            if (!record.id) return;
            const prevStatus = previousStatusMapRef.current.get(record.id);
            const currentStatus = record.status;

            if (prevStatus && prevStatus !== currentStatus) {
              // Status changed! (e.g. from submitted to verified or rejected)
              if (currentStatus === 'verified') {
                playNotificationSound();
                incrementAppBadgeCount();
                sendDeviceNotification(
                  `Submission Update: ${record.partyName} marked as Verified`,
                  `Your client entry for "${record.partyName}" has been approved and verified by the Admin.`
                );
                setActionSuccess(`Submission Update: "${record.partyName}" marked as Verified.`);
                setTimeout(() => setActionSuccess(null), 6000);
              } else if (currentStatus === 'rejected') {
                playNotificationSound();
                incrementAppBadgeCount();
                sendDeviceNotification(
                  `Submission Update: ${record.partyName} marked as Rejected`,
                  `Your client entry for "${record.partyName}" was marked as rejected by Admin.`
                );
                setActionSuccess(`Submission Update: "${record.partyName}" marked as Rejected.`);
                setTimeout(() => setActionSuccess(null), 6000);
              }
            }
          });
        }

        // Update status map
        const newStatusMap = new Map<string, string>();
        records.forEach((r) => {
          if (r.id) newStatusMap.set(r.id, r.status);
        });
        previousStatusMapRef.current = newStatusMap;
        isInitialSubmissionsLoadRef.current = false;

        setMySubmissions(records);
        setSubmissionsLoading(false);
      },
      (error) => {
        console.warn('Fallback querying submissions without order due to missing index:', error);
        const fallbackQ = query(
          collection(db, 'clients'),
          where('submittedByUid', '==', currentUser.uid)
        );
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

          setMySubmissions(records);
          setSubmissionsLoading(false);
        });
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Debounced Phone Deduplication Check
  const checkDuplicatePhone = useCallback(async (phone: string) => {
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 7) {
      setDuplicateClient(null);
      setIsCheckingPhone(false);
      return;
    }

    setIsCheckingPhone(true);
    try {
      const q = query(
        collection(db, 'clients'),
        where('contactNumber', '==', cleanPhone)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docData = snapshot.docs[0].data() as ClientRecord;
        setDuplicateClient({ id: snapshot.docs[0].id, ...docData });
      } else {
        setDuplicateClient(null);
      }
    } catch (err) {
      console.error('Error checking duplicate phone:', err);
    } finally {
      setIsCheckingPhone(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (contactNumber.trim()) {
        checkDuplicatePhone(contactNumber);
      } else {
        setDuplicateClient(null);
        setIsCheckingPhone(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [contactNumber, checkDuplicatePhone]);

  // GPS Location Autofill
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported on this device.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data && data.display_name) {
              setAddress(data.display_name);
              setIsLocating(false);
              return;
            }
          }
        } catch {
          // Fallback to coordinates string
        }
        setAddress(`GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        alert('Could not retrieve GPS location. Please ensure location permissions are enabled.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // TRUE DIRECT CAMERA CAPTURE (bypasses gallery picker)
  const handleTakePhoto = async () => {
    setPhotoError(null);
    const availableSlots = MAX_PHOTOS - photos.length;
    if (availableSlots <= 0) {
      setPhotoError(`Maximum ${MAX_PHOTOS} photos allowed. Please remove a photo to take a new one.`);
      return;
    }

    try {
      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera, // Direct Camera viewfinder
      });

      if (photo.dataUrl) {
        setIsCompressing(true);
        try {
          const base64 = await compressBase64OrDataUrl(photo.dataUrl, 1280, 0.7);
          setPhotos((prev) => [...prev, base64].slice(0, MAX_PHOTOS));
        } catch (err: unknown) {
          const error = err as { message?: string };
          setPhotoError(error.message || 'Failed to process photo from camera.');
        } finally {
          setIsCompressing(false);
        }
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      if (error?.message && (error.message.includes('User cancelled') || error.message.includes('cancelled') || error.message.includes('No image picked'))) {
        return;
      }
      // Web browser fallback to HTML camera capture input
      cameraInputRef.current?.click();
    }
  };

  // Handle Photo File Selection from Gallery
  const handlePhotoFiles = async (files: FileList | File[]) => {
    setPhotoError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const availableSlots = MAX_PHOTOS - photos.length;
    if (availableSlots <= 0) {
      setPhotoError(`Maximum ${MAX_PHOTOS} photos allowed.`);
      return;
    }

    const filesToProcess = fileArray.slice(0, availableSlots);
    setIsCompressing(true);
    try {
      const compressedList: string[] = [];
      for (const file of filesToProcess) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`"${file.name}" is not a valid image format.`);
        }
        const base64 = await compressImageFile(file, 1280, 0.7);
        compressedList.push(base64);
      }
      setPhotos((prev) => [...prev, ...compressedList].slice(0, MAX_PHOTOS));
    } catch (err: unknown) {
      const error = err as { message?: string };
      setPhotoError(error.message || 'Failed to process image.');
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setPhotoError(null);
  };

  const openLightbox = (photosList: string[], startIndex = 0, title = 'Inspection') => {
    setLightboxPhotos(photosList);
    setLightboxIndex(startIndex);
    setLightboxTitle(title);
    setIsLightboxOpen(true);
  };

  // Start Editing a client record
  const handleStartEdit = (client: ClientRecord) => {
    if (client.status === 'verified') {
      alert('This entry has already been verified by an Administrator and cannot be modified.');
      return;
    }
    setEditingClient(client);
    setEditPartyName(client.partyName || '');
    setEditContactNumber(client.contactNumber || '');
    setEditMachineCount(String(client.machineCount ?? ''));
    setEditMonthlyCapacity(client.monthlyCapacity || '');
    setEditAddress(client.address || '');
    setEditPhotos(client.photos ? [...client.photos] : []);
    setEditError(null);
    setEditPhotoError(null);
  };

  // Camera in Edit Modal
  const handleTakeEditPhoto = async () => {
    setEditPhotoError(null);
    const availableSlots = MAX_PHOTOS - editPhotos.length;
    if (availableSlots <= 0) {
      setEditPhotoError(`Maximum ${MAX_PHOTOS} photos allowed.`);
      return;
    }

    try {
      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (photo.dataUrl) {
        setIsEditCompressing(true);
        try {
          const base64 = await compressBase64OrDataUrl(photo.dataUrl, 1280, 0.7);
          setEditPhotos((prev) => [...prev, base64].slice(0, MAX_PHOTOS));
        } catch (err: unknown) {
          const error = err as { message?: string };
          setEditPhotoError(error.message || 'Failed to compress photo.');
        } finally {
          setIsEditCompressing(false);
        }
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      if (error?.message && (error.message.includes('User cancelled') || error.message.includes('cancelled') || error.message.includes('No image picked'))) {
        return;
      }
      editCameraInputRef.current?.click();
    }
  };

  const handleEditPhotoFiles = async (files: FileList | File[]) => {
    setEditPhotoError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const availableSlots = MAX_PHOTOS - editPhotos.length;
    if (availableSlots <= 0) {
      setEditPhotoError(`Maximum ${MAX_PHOTOS} photos allowed.`);
      return;
    }

    const filesToProcess = fileArray.slice(0, availableSlots);
    setIsEditCompressing(true);
    try {
      const compressedList: string[] = [];
      for (const file of filesToProcess) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`"${file.name}" is not a valid image format.`);
        }
        const base64 = await compressImageFile(file, 1280, 0.7);
        compressedList.push(base64);
      }
      setEditPhotos((prev) => [...prev, ...compressedList].slice(0, MAX_PHOTOS));
    } catch (err: unknown) {
      const error = err as { message?: string };
      setEditPhotoError(error.message || 'Failed to compress photo.');
    } finally {
      setIsEditCompressing(false);
      if (editFileInputRef.current) editFileInputRef.current.value = '';
      if (editCameraInputRef.current) editCameraInputRef.current.value = '';
    }
  };

  const handleRemoveEditPhoto = (indexToRemove: number) => {
    setEditPhotos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setEditPhotoError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !editingClient.id) return;

    if (editingClient.status === 'verified') {
      setEditError('Verified entries cannot be modified.');
      return;
    }

    if (!editPartyName.trim() || !editContactNumber.trim() || !editMachineCount || !editMonthlyCapacity.trim() || !editAddress.trim()) {
      setEditError('Please fill out all required fields.');
      return;
    }

    const countNum = parseInt(editMachineCount, 10);
    if (isNaN(countNum) || countNum < 0) {
      setEditError('Machine count must be a non-negative number.');
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);

    try {
      const clientRef = doc(db, 'clients', editingClient.id);
      await updateDoc(clientRef, {
        partyName: editPartyName.trim(),
        contactNumber: editContactNumber.trim(),
        machineCount: countNum,
        monthlyCapacity: editMonthlyCapacity.trim(),
        address: editAddress.trim(),
        photos: editPhotos,
        updatedAt: serverTimestamp()
      });

      setEditingClient(null);
      setActionSuccess(`Record "${editPartyName.trim()}" updated successfully.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setEditError(error.message || 'Failed to update record.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingClient || !deletingClient.id) return;

    if (deletingClient.status === 'verified') {
      alert('Verified entries cannot be deleted.');
      setDeletingClient(null);
      return;
    }

    const deletedName = deletingClient.partyName;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'clients', deletingClient.id));
      setDeletingClient(null);
      setActionSuccess(`Record "${deletedName}" was deleted.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert(error.message || 'Failed to delete record.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Google OAuth Sign In (Native Android & Web fallback)
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const googleUser = await GoogleAuth.signIn();
        const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
        const userCredential = await signInWithCredential(auth, credential);
        await syncUserProfile(userCredential.user, isRegistering ? selectedSignupRole : undefined);
      } else {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const userCredential = await signInWithPopup(auth, provider);
        await syncUserProfile(userCredential.user, isRegistering ? selectedSignupRole : undefined);
      }
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setAuthError(err.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Email/Password Authentication
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const emailTrimmed = authEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    setAuthSubmitting(true);
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, emailTrimmed, authPassword);
        await syncUserProfile(userCredential.user, selectedSignupRole);
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, emailTrimmed, authPassword);
        await syncUserProfile(userCredential.user);
      }
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      let msg = error.message || 'Authentication failed.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        msg = 'Invalid email or password.';
      } else if (error.code === 'auth/email-already-in-use') {
        msg = 'An account with this email already exists. Please log in or use Continue with Google.';
      } else if (error.code === 'auth/weak-password') {
        msg = 'Password must be at least 6 characters.';
      }
      setAuthError(msg);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
      clearAppBadgeCount();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Submit Intake Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!partyName.trim() || !contactNumber.trim() || !machineCount || !monthlyCapacity.trim() || !address.trim()) {
      setSubmitError('Please fill out all required fields.');
      return;
    }

    const countNum = parseInt(machineCount, 10);
    if (isNaN(countNum) || countNum < 0) {
      setSubmitError('Machine count must be a valid non-negative number.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const submitterName = currentUser.displayName
        ? `${currentUser.displayName} (${currentUser.email})`
        : (currentUser.email || 'Agent User');

      const newRecord = {
        partyName: partyName.trim(),
        contactNumber: contactNumber.trim(),
        machineCount: countNum,
        monthlyCapacity: monthlyCapacity.trim(),
        address: address.trim(),
        photos: photos,
        status: 'submitted' as const,
        submittedBy: submitterName,
        submittedByUid: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'clients'), newRecord);

      // Reset form and clear offline draft
      setPartyName('');
      setContactNumber('');
      setMachineCount('');
      setMonthlyCapacity('');
      setAddress('');
      setPhotos([]);
      setPhotoError(null);
      setDuplicateClient(null);
      setSubmitSuccess(true);

      try {
        localStorage.removeItem(INTAKE_DRAFT_KEY);
      } catch (e) {
        console.warn('Error clearing draft:', e);
      }

      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setSubmitError(error.message || 'Failed to submit client record. Please check connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered submissions for Agent
  const filteredSubmissions = mySubmissions.filter((item) => {
    if (submissionFilter === 'all') return true;
    return item.status === submissionFilter;
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium tracking-wide">Starting Field Tracker...</p>
        </div>
      </div>
    );
  }

  // If user is Admin, render the Admin Portal View automatically!
  if (currentUser && userProfile?.role === 'admin') {
    return (
      <AdminPortalView
        currentUser={currentUser}
        onSignOut={handleSignOut}
      />
    );
  }

  // 1. UNIFIED LOGIN SCREEN (For Both Agents and Admins)
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col justify-center py-8 sm:py-12 sm:px-6 lg:px-8 px-4 antialiased">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-600/30 mb-4 text-white">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            Field Tracker
          </h2>
          <p className="mt-1.5 text-sm text-slate-400">
            Enterprise Mobile Client Intake & Management
          </p>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-slate-900/90 py-8 px-6 shadow-2xl rounded-3xl sm:px-10 border border-slate-800 backdrop-blur-xl">
            {/* Native Google One-Click Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authSubmitting}
              className="w-full py-3 px-4 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-750 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-3 disabled:opacity-60 group active:scale-[0.98]"
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

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-3 text-slate-500 font-bold tracking-wider">
                  Or Email & Password
                </span>
              </div>
            </div>

            {/* Toggle Tab: Sign In vs Register */}
            <div className="flex rounded-xl bg-slate-950 p-1 mb-5 border border-slate-800">
              <button
                type="button"
                onClick={() => { setIsRegistering(false); setAuthError(null); }}
                className={`w-1/2 py-2 text-sm font-bold rounded-lg transition-all ${
                  !isRegistering
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsRegistering(true); setAuthError(null); }}
                className={`w-1/2 py-2 text-sm font-bold rounded-lg transition-all ${
                  isRegistering
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Register
              </button>
            </div>

            {/* Role Picker during Registration */}
            {isRegistering && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Account Role
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedSignupRole('agent')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      selectedSignupRole === 'agent'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>Field Agent</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedSignupRole('admin')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      selectedSignupRole === 'admin'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Administrator</span>
                  </button>
                </div>
              </div>
            )}

            {authError && (
              <div className="mb-4 rounded-xl bg-rose-950/70 border border-rose-700/60 p-3 text-xs text-rose-300 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-600 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-600 transition pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full mt-3 py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {authSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                {isRegistering ? `Register as ${selectedSignupRole === 'admin' ? 'Admin' : 'Agent'}` : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // 2. LOGGED IN AGENT PORTAL
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Top Header */}
      <header
        className="bg-slate-900/95 border-b border-slate-800 sticky top-0 z-30 shadow-md backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight">Field Tracker</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  AGENT
                </span>
              </div>
              <p className="text-xs text-slate-400">Mobile Client Onboarding</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-9 h-9 rounded-full object-cover border border-slate-700 shadow-xs"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs">
                {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : currentUser.email?.charAt(0).toUpperCase() || 'A'}
              </div>
            )}

            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-bold text-white max-w-[140px] truncate">
                {currentUser.displayName || currentUser.email}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center justify-end gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Active Agent
              </span>
            </div>

            {/* Visible Header Logout Button */}
            <button
              onClick={handleSignOut}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition border border-slate-700"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 w-full space-y-6"
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

        {/* Navigation Tabs: New Intake vs My Submissions */}
        <div className="flex rounded-2xl bg-slate-900 p-1.5 border border-slate-800 shadow-md">
          <button
            type="button"
            onClick={() => setAgentActiveTab('intake')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              agentActiveTab === 'intake'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>New Client Intake</span>
          </button>

          <button
            type="button"
            onClick={() => setAgentActiveTab('submissions')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              agentActiveTab === 'submissions'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>My Submissions</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-extrabold border border-slate-700 text-slate-300">
              {mySubmissions.length}
            </span>
          </button>
        </div>

        {/* TAB 1: NEW CLIENT INTAKE FORM */}
        {agentActiveTab === 'intake' && (
          <div className="space-y-6">
            {submitSuccess && (
              <div className="rounded-2xl bg-emerald-950/80 border border-emerald-600/50 p-4 shadow-md flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-emerald-200">Client Entry Submitted Successfully!</h3>
                  <p className="text-xs text-emerald-400/90 mt-0.5">
                    Data has been recorded and submitted for Admin verification. You can track its status in the "My Submissions" tab.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-slate-900/90 rounded-3xl shadow-xl border border-slate-800 overflow-hidden backdrop-blur-sm">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-base font-bold text-white">Client Registration Form</h2>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Direct Field Entry
                </span>
              </div>

              <form onSubmit={handleSubmitForm} className="p-6 sm:p-8 space-y-5 sm:space-y-6">
                {submitError && (
                  <div className="rounded-xl bg-rose-950/70 border border-rose-700/60 p-3.5 text-xs font-medium text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Party Name */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Party Name <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={partyName}
                        onChange={(e) => setPartyName(e.target.value)}
                        placeholder="e.g. Apex Industrial Garments Pvt Ltd"
                        className="w-full pl-10 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-600 transition"
                      />
                    </div>
                  </div>

                  {/* Contact Number + Deduplication */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Contact Number <span className="text-rose-400">*</span>
                      </label>
                      {isCheckingPhone && (
                        <span className="text-xs text-indigo-400 flex items-center gap-1 font-medium">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Checking duplicate...
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="tel"
                        inputMode="tel"
                        required
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        className={`w-full pl-10 pr-4 py-3.5 bg-slate-950 border rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 placeholder-slate-600 transition ${
                          duplicateClient
                            ? 'border-amber-500 focus:ring-amber-500'
                            : 'border-slate-800 focus:ring-indigo-500'
                        }`}
                      />
                    </div>

                    {duplicateClient && (
                      <div className="mt-2.5 p-3 rounded-xl bg-amber-950/70 border border-amber-600/60 text-xs text-amber-200 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Duplicate Detected:</span> A client with phone{' '}
                          <span className="font-semibold text-white">{duplicateClient.contactNumber}</span> is already recorded as{' '}
                          <span className="font-semibold text-white">"{duplicateClient.partyName}"</span> (Status:{' '}
                          <span className="uppercase font-bold text-amber-300">{duplicateClient.status}</span>).
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Machine Count */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Machine Count <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        required
                        value={machineCount}
                        onChange={(e) => setMachineCount(e.target.value)}
                        placeholder="e.g. 24"
                        className="w-full pl-10 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-600 transition"
                      />
                    </div>
                  </div>

                  {/* Monthly Capacity */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Monthly Capacity <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Gauge className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={monthlyCapacity}
                        onChange={(e) => setMonthlyCapacity(e.target.value)}
                        placeholder="e.g. 50,000 meters / month"
                        className="w-full pl-10 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-600 transition"
                      />
                    </div>
                  </div>

                  {/* Address with GPS Autofill Button */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Factory / Office Address <span className="text-rose-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        disabled={isLocating}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-300 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/30 px-2.5 py-1 rounded-lg transition border border-indigo-500/30 disabled:opacity-50 active:scale-95"
                      >
                        <Compass className={`w-3.5 h-3.5 text-indigo-400 ${isLocating ? 'animate-spin' : ''}`} />
                        <span>{isLocating ? 'Detecting GPS...' : 'Use Current GPS'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute top-3.5 left-3.5 flex items-start pointer-events-none text-slate-500">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <textarea
                        rows={3}
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g. Plot No. 45, GIDC Industrial Estate, Sector 2"
                        className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-600 transition resize-none"
                      ></textarea>
                    </div>
                  </div>

                  {/* Photos Section */}
                  <div className="sm:col-span-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Attached Photos <span className="text-slate-500 font-normal normal-case">(Max {MAX_PHOTOS})</span>
                        </label>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Take photo directly with camera or pick from device gallery.
                        </p>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                        {photos.length} / {MAX_PHOTOS} Photos
                      </span>
                    </div>

                    {/* Hidden Inputs */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => e.target.files && handlePhotoFiles(e.target.files)}
                      className="hidden"
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => e.target.files && handlePhotoFiles(e.target.files)}
                      className="hidden"
                    />

                    {photoError && (
                      <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-700/60 text-xs text-rose-300 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                          <span>{photoError}</span>
                        </div>
                        <button type="button" onClick={() => setPhotoError(null)}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {isCompressing && (
                      <div className="p-3 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-xs text-indigo-300 flex items-center gap-2.5">
                        <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />
                        <span>Compressing photo on device (1280px)...</span>
                      </div>
                    )}

                    {/* Photo Thumbnails */}
                    {photos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {photos.map((photoBase64, index) => (
                          <div
                            key={index}
                            className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shadow-sm aspect-video sm:aspect-square flex items-center justify-center"
                          >
                            <img
                              src={photoBase64}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-full object-cover group-hover:opacity-90 transition cursor-zoom-in"
                              onClick={() => openLightbox(photos, index, `Intake Photo #${index + 1}`)}
                            />
                            <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/80 text-white rounded text-[10px] font-bold">
                              Photo #{index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(index)}
                              className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white shadow-md transition z-10"
                              title="Remove photo"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Big Action Buttons (Take Photo vs Choose from Gallery) */}
                    {photos.length < MAX_PHOTOS && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <button
                          type="button"
                          onClick={handleTakePhoto}
                          className="py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-sm shadow-md shadow-indigo-600/30 transition flex items-center justify-center gap-2.5"
                        >
                          <Camera className="w-5 h-5" />
                          <span>Take Photo with Camera</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="py-3.5 px-4 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-sm transition flex items-center justify-center gap-2.5 active:scale-[0.98]"
                        >
                          <ImageIcon className="w-5 h-5 text-indigo-400" />
                          <span>Choose from Gallery</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit Action Bar */}
                <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Status will be marked as <strong className="text-slate-200">submitted</strong></span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || isCompressing}
                    className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Submit Client Record</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: MY SUBMISSIONS HISTORY & REAL-TIME STATUS */}
        {agentActiveTab === 'submissions' && (
          <div className="space-y-4">
            {/* Filter Pills */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
              <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800">
                {(['all', 'submitted', 'verified', 'rejected'] as const).map((filter) => {
                  const count = filter === 'all'
                    ? mySubmissions.length
                    : mySubmissions.filter((s) => s.status === filter).length;
                  return (
                    <button
                      key={filter}
                      onClick={() => setSubmissionFilter(filter)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition flex items-center gap-1.5 ${
                        submissionFilter === filter
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>{filter}</span>
                      <span className="text-[10px] opacity-75">({count})</span>
                    </button>
                  );
                })}
              </div>

              {submissionsLoading && (
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
              )}
            </div>

            {/* Submissions List */}
            {filteredSubmissions.length === 0 ? (
              <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                <p className="text-sm font-bold text-slate-300">No submissions found</p>
                <p className="text-xs text-slate-500 mt-1">
                  {submissionFilter === 'all'
                    ? 'You have not submitted any client records yet.'
                    : `No submissions with status "${submissionFilter}".`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSubmissions.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 sm:p-5 shadow-md hover:border-slate-700 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {item.photos && item.photos.length > 0 ? (
                          <div
                            onClick={() => openLightbox(item.photos!, 0, item.partyName)}
                            className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-slate-700 bg-slate-800 cursor-zoom-in relative group shadow-sm"
                          >
                            <img
                              src={item.photos[0]}
                              alt={item.partyName}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                            {item.photos.length > 1 && (
                              <span className="absolute bottom-1 right-1 px-1 py-0.2 bg-black/80 text-white text-[9px] font-black rounded">
                                +{item.photos.length - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center text-slate-500">
                            <Building2 className="w-6 h-6" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <h4 className="text-base font-bold text-white truncate">{item.partyName}</h4>
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{item.address}</p>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 mt-1.5">
                            <span className="font-mono text-slate-300">{item.contactNumber}</span>
                            <span>•</span>
                            <span>{item.machineCount} machines</span>
                            <span>•</span>
                            <span>{item.monthlyCapacity}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge & Actions */}
                      <div className="flex items-center gap-2.5 self-end sm:self-center flex-shrink-0 pt-2 sm:pt-0">
                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                            item.status === 'verified'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : item.status === 'rejected'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {item.status}
                        </span>

                        {/* Modifiable if unverified */}
                        {item.status !== 'verified' && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            className="p-2 rounded-xl border border-slate-700 hover:border-indigo-500 hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-300 transition flex items-center gap-1.5 text-xs font-bold active:scale-95"
                            title="Modify this entry"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Modify</span>
                          </button>
                        )}

                        {item.status !== 'verified' && (
                          <button
                            type="button"
                            onClick={() => setDeletingClient(item)}
                            className="p-2 rounded-xl border border-slate-700 hover:border-rose-500 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition flex items-center gap-1.5 text-xs font-bold active:scale-95"
                            title="Delete this entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Edit Entry Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col text-white">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Pencil className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-white text-base">Modify Client Entry</h3>
                  <p className="text-xs text-slate-400 truncate max-w-xs">{editingClient.partyName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {editError && (
                <div className="rounded-xl bg-rose-950/70 border border-rose-700/60 p-3 text-xs font-medium text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Party Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editPartyName}
                  onChange={(e) => setEditPartyName(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Contact Number <span className="text-rose-400">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  value={editContactNumber}
                  onChange={(e) => setEditContactNumber(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Machine Count <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    required
                    value={editMachineCount}
                    onChange={(e) => setEditMachineCount(e.target.value)}
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Monthly Capacity <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editMonthlyCapacity}
                    onChange={(e) => setEditMonthlyCapacity(e.target.value)}
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Factory / Office Address <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none"
                ></textarea>
              </div>

              {/* Edit Photos */}
              <div className="pt-2 border-t border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-400" />
                    Photos ({editPhotos.length}/{MAX_PHOTOS})
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => e.target.files && handleEditPhotoFiles(e.target.files)}
                      className="hidden"
                    />
                    <input
                      ref={editCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => e.target.files && handleEditPhotoFiles(e.target.files)}
                      className="hidden"
                    />
                    {editPhotos.length < MAX_PHOTOS && (
                      <>
                        <button
                          type="button"
                          onClick={() => editFileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold flex items-center gap-1 transition"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Gallery</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleTakeEditPhoto}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 transition"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Camera</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editPhotoError && (
                  <div className="p-2.5 rounded-lg bg-rose-950/70 text-rose-300 text-xs flex items-center justify-between">
                    <span>{editPhotoError}</span>
                    <button type="button" onClick={() => setEditPhotoError(null)}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {isEditCompressing && (
                  <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Compressing image (1280px)...</span>
                  </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {editPhotos.map((photo, pIdx) => (
                    <div
                      key={pIdx}
                      className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-950 aspect-square shadow-sm cursor-zoom-in"
                      onClick={() => openLightbox(editPhotos, pIdx, `Edit Photo #${pIdx + 1}`)}
                    >
                      <img src={photo} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRemoveEditPhoto(pIdx); }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/80 hover:bg-rose-600 text-white transition z-10"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Edit Modal Footer */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || isEditCompressing}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition flex items-center gap-2 disabled:opacity-60"
                >
                  {isSavingEdit ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 max-w-md w-full p-6 space-y-4 text-white animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Delete Client Entry?</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              Are you sure you want to delete the submission for{' '}
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
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/30 transition flex items-center gap-2 disabled:opacity-60 active:scale-95"
              >
                {isDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Yes, Delete Entry</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      <ImageLightboxModal
        isOpen={isLightboxOpen}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        title={lightboxTitle}
        onClose={() => setIsLightboxOpen(false)}
      />
    </div>
  );
}
