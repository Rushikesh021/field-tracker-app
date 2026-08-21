import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  auth,
  db
} from './config/firebase';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential
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
  Lock,
  Compass,
  Smartphone,
  ShieldCheck,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2
} from 'lucide-react';
import { AdminPortalView } from './components/AdminPortalView';
import { PasskeyModal } from './components/PasskeyModal';
import { InstallModal } from './components/InstallModal';

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

/**
 * Mobile-Optimized HTML5 Canvas Image Compression.
 * - Handles camera photos from iOS Safari (HEIC/JPEG) & Android Chrome.
 * - Uses URL.createObjectURL for memory efficiency on low-RAM mobile devices.
 * - Max dimension: 800px (preserves aspect ratio)
 * - Format: JPEG, Quality: 0.6
 * - Returns: Base64 data URL string
 */
export function compressImageFile(file: File, maxDimension = 800, quality = 0.6): Promise<string> {
  return new Promise((resolve, reject) => {
    const isImage = (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);
    if (!isImage) {
      return reject(new Error(`"${file.name}" is not a recognized image format.`));
    }

    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      objectUrl = '';
    }

    const processImageElement = (img: HTMLImageElement) => {
      try {
        let { width, height } = img;
        if (width <= 0 || height <= 0) {
          width = 800;
          height = 600;
        }

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      } catch (err: unknown) {
        const error = err as { message?: string };
        reject(new Error(error.message || 'Image processing failed on this device.'));
      }
    };

    if (objectUrl) {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        processImageElement(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        // Fallback to FileReader if objectURL fails
        const reader = new FileReader();
        reader.onload = (e) => {
          const fallbackImg = new Image();
          fallbackImg.onload = () => processImageElement(fallbackImg);
          fallbackImg.onerror = () => reject(new Error(`Failed to decode image from camera/gallery.`));
          fallbackImg.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error(`Could not read selected photo.`));
        reader.readAsDataURL(file);
      };
      img.src = objectUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fallbackImg = new Image();
        fallbackImg.onload = () => processImageElement(fallbackImg);
        fallbackImg.onerror = () => reject(new Error(`Failed to decode image.`));
        fallbackImg.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error(`Could not read selected photo.`));
      reader.readAsDataURL(file);
    }
  });
}

/**
 * Compresses a base64 / dataUrl image (e.g. from native Capacitor Camera).
 */
export function compressBase64OrDataUrl(dataUrl: string, maxDimension = 800, quality = 0.6): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width <= 0 || height <= 0) {
          width = 800;
          height = 600;
        }
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err: unknown) {
        const error = err as { message?: string };
        reject(new Error(error.message || 'Image processing failed.'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image from camera'));
    img.src = dataUrl;
  });
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Intake Form State
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
  const [previewModalPhoto, setPreviewModalPhoto] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [previewDragging, setPreviewDragging] = useState(false);
  const [previewDragStart, setPreviewDragStart] = useState({ x: 0, y: 0 });

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

  // Unified Portal & Mobile Install States
  const [activePortal, setActivePortal] = useState<'agent' | 'admin'>('agent');
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const ADMIN_PASSKEY = 'admin123';

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // User's recent submissions
  const [mySubmissions, setMySubmissions] = useState<ClientRecord[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // GPS Location Autofill for Mobile Devices
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported on this browser/device.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`, {
            headers: { 'Accept-Language': 'en' }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.display_name) {
              setAddress(data.display_name);
              setIsLocating(false);
              return;
            }
          }
        } catch {
          // Fallback to coordinates
        }
        setAddress(`GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        alert('Could not retrieve GPS location. Please check device location permissions.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // Take Photo using Native Capacitor Camera for New Intake
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
        source: CameraSource.Camera,
      });

      if (photo.dataUrl) {
        setIsCompressing(true);
        try {
          const base64 = await compressBase64OrDataUrl(photo.dataUrl, 800, 0.6);
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
      // Ignore user cancellation
      if (error?.message && (error.message.includes('User cancelled') || error.message.includes('cancelled') || error.message.includes('No image picked'))) {
        return;
      }
      // Fallback to HTML camera file input if plugin is not available
      cameraInputRef.current?.click();
    }
  };

  // Handle Photo File Selection & Client-side Canvas Compression for New Intake
  const handlePhotoFiles = async (files: FileList | File[]) => {
    setPhotoError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const availableSlots = MAX_PHOTOS - photos.length;
    if (availableSlots <= 0) {
      setPhotoError(`Maximum ${MAX_PHOTOS} photos allowed. Please remove a photo to upload a new one.`);
      return;
    }

    const filesToProcess = fileArray.slice(0, availableSlots);
    if (fileArray.length > availableSlots) {
      setPhotoError(`Only ${availableSlots} more photo(s) could be added (limit is ${MAX_PHOTOS} photos).`);
    }

    setIsCompressing(true);
    try {
      const compressedList: string[] = [];
      for (const file of filesToProcess) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`"${file.name}" is not a valid image format.`);
        }
        // HTML5 Canvas max 800px width/height, 0.6 JPEG quality
        const base64 = await compressImageFile(file, 800, 0.6);
        compressedList.push(base64);
      }
      setPhotos((prev) => [...prev, ...compressedList].slice(0, MAX_PHOTOS));
    } catch (err: unknown) {
      const error = err as { message?: string };
      setPhotoError(error.message || 'Failed to process and compress image. Please try again.');
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

  const openPhotoPreview = (photo: string) => {
    setPreviewZoom(1);
    setPreviewRotation(0);
    setPreviewPosition({ x: 0, y: 0 });
    setPreviewModalPhoto(photo);
  };

  // Start Editing a client record (Only unverified entries are modifiable)
  const handleStartEdit = (client: ClientRecord) => {
    if (client.status === 'verified') {
      alert('Security Policy: This entry has already been verified by an Administrator and is permanently locked from modification.');
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

  // Take Photo using Native Capacitor Camera for Edit Modal
  const handleTakeEditPhoto = async () => {
    setEditPhotoError(null);
    const availableSlots = MAX_PHOTOS - editPhotos.length;
    if (availableSlots <= 0) {
      setEditPhotoError(`Maximum ${MAX_PHOTOS} photos allowed. Remove a photo to take a new one.`);
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
          const base64 = await compressBase64OrDataUrl(photo.dataUrl, 800, 0.6);
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

  // Handle Photo upload inside Edit Modal
  const handleEditPhotoFiles = async (files: FileList | File[]) => {
    setEditPhotoError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const availableSlots = MAX_PHOTOS - editPhotos.length;
    if (availableSlots <= 0) {
      setEditPhotoError(`Maximum ${MAX_PHOTOS} photos allowed. Remove a photo to upload a new one.`);
      return;
    }

    const filesToProcess = fileArray.slice(0, availableSlots);
    if (fileArray.length > availableSlots) {
      setEditPhotoError(`Only ${availableSlots} more photo(s) added (limit is ${MAX_PHOTOS}).`);
    }

    setIsEditCompressing(true);
    try {
      const compressedList: string[] = [];
      for (const file of filesToProcess) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`"${file.name}" is not a valid image format.`);
        }
        const base64 = await compressImageFile(file, 800, 0.6);
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

  // Save changes to edited client record in Firestore
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !editingClient.id) return;

    if (editingClient.status === 'verified') {
      setEditError('Security Enforcement: This entry has already been verified by an Administrator and cannot be modified.');
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
      setEditError(error.message || 'Failed to update record. Please check connection.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete a client record from Firestore
  const handleConfirmDelete = async () => {
    if (!deletingClient || !deletingClient.id) return;

    if (deletingClient.status === 'verified') {
      alert('Security Policy: Verified entries are permanently locked and cannot be deleted.');
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
      alert(error.message || 'Failed to delete record. Please check your connection.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Initialize Capacitor Native Google Auth
  useEffect(() => {
    GoogleAuth.initialize();
  }, []);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to recent submissions by current user (Filtered for unverified/pending entries only)
  useEffect(() => {
    if (!currentUser) {
      setMySubmissions([]);
      return;
    }

    setSubmissionsLoading(true);
    const q = query(
      collection(db, 'clients'),
      where('submittedByUid', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records: ClientRecord[] = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<ClientRecord, 'id'>)
          }))
          // Security Policy: Agents can ONLY see and access unverified / pending records.
          // Once verified by Admin, records are locked and hidden from field agents.
          .filter((record) => record.status !== 'verified');

        // If currently editing a record that just got verified by Admin, auto-close modal
        if (editingClient && !records.some((r) => r.id === editingClient.id)) {
          setEditingClient(null);
          setActionSuccess('Notice: A submission was verified by Admin and archived to secure storage.');
          setTimeout(() => setActionSuccess(null), 5000);
        }

        setMySubmissions(records);
        setSubmissionsLoading(false);
      },
      (error) => {
        console.warn('Fallback querying without order due to missing index:', error);
        // Fallback query if composite index is pending
        const fallbackQ = query(
          collection(db, 'clients'),
          where('submittedByUid', '==', currentUser.uid)
        );
        onSnapshot(fallbackQ, (snapshot) => {
          const records: ClientRecord[] = snapshot.docs
            .map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<ClientRecord, 'id'>)
            }))
            .filter((record) => record.status !== 'verified');

          // Sort client-side
          records.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
          });

          if (editingClient && !records.some((r) => r.id === editingClient.id)) {
            setEditingClient(null);
            setActionSuccess('Notice: A submission was verified by Admin and archived to secure storage.');
            setTimeout(() => setActionSuccess(null), 5000);
          }

          setMySubmissions(records);
          setSubmissionsLoading(false);
        });
      }
    );

    return () => unsubscribe();
  }, [currentUser, editingClient]);

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

  // Native Google OAuth Sign In / Registration Handler
  const handleGoogleSignIn = async () => {
    try {
      const userResponse = await GoogleAuth.signIn();
      const credential = GoogleAuthProvider.credential(userResponse.authentication.idToken);
      await signInWithCredential(auth, credential);
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      alert("Google sign-in failed: " + (err.message || err));
    }
  };

  // Email/Password Auth Handler
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const emailTrimmed = authEmail.trim();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailTrimmed)) {
      setAuthError('Please enter a valid real Google / email address (e.g. name@gmail.com).');
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
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      let msg = error.message || 'Authentication failed. Please try again.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        msg = 'Invalid email or password.';
      } else if (error.code === 'auth/email-already-in-use') {
        msg = 'An account with this email already exists. Please log in or use Continue with Google.';
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

      // Reset form
      setPartyName('');
      setContactNumber('');
      setMachineCount('');
      setMonthlyCapacity('');
      setAddress('');
      setPhotos([]);
      setPhotoError(null);
      setDuplicateClient(null);
      setSubmitSuccess(true);

      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setSubmitError(error.message || 'Failed to submit client record. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium tracking-wide">Initializing Field Agent App...</p>
        </div>
      </div>
    );
  }

  // Switch to Admin Portal Mode if selected (Passkey Authorized)
  if (activePortal === 'admin') {
    return <AdminPortalView onSwitchToAgent={() => setActivePortal('agent')} />;
  }

  // Not Logged In View
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center py-8 sm:py-12 sm:px-6 lg:px-8 px-4">
        {/* Top Floating App Install & Portal Mode Switch */}
        <div className="sm:mx-auto sm:w-full sm:max-w-md flex items-center justify-between gap-2 mb-4">
          <button
            onClick={() => setShowInstallModal(true)}
            className="px-3.5 py-1.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 text-xs font-bold border border-indigo-400/30 transition flex items-center gap-1.5 active:scale-95 shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>📲 Install App</span>
          </button>

          <button
            onClick={() => setShowPasskeyModal(true)}
            className="px-3.5 py-1.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition flex items-center gap-1.5 active:scale-95 shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Admin Console 🔒</span>
          </button>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-500/25 mb-4 text-white">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Field Client Intake
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Enterprise Client Onboarding & Registration Portal
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
                Sign In
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
                Register
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
                  placeholder="yourname@gmail.com"
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">Please use your active Google / Gmail account</p>
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
                    className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition pr-10"
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

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-500/30 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {authSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                {isRegistering ? 'Register with Google Email' : 'Sign In with Email'}
              </button>
            </form>
          </div>
        </div>

        {/* Passkey Authorization Modal */}
        <PasskeyModal
          isOpen={showPasskeyModal}
          onClose={() => setShowPasskeyModal(false)}
          onSuccess={() => {
            setShowPasskeyModal(false);
            setActivePortal('admin');
          }}
          correctPasskey={ADMIN_PASSKEY}
        />

        {/* Install Mobile App Modal */}
        <InstallModal
          isOpen={showInstallModal}
          onClose={() => setShowInstallModal(false)}
        />
      </div>
    );
  }

  // Logged In Client View
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Field Client Intake</h1>
              <p className="text-xs text-slate-500">Fast Mobile Intake & Deduplication</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Install App Button */}
            <button
              onClick={() => setShowInstallModal(true)}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center gap-1.5 border border-indigo-200"
              title="Install Mobile App on Android or iOS"
            >
              <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Install App</span>
            </button>

            {/* Admin Console Switch Button (Passkey Protected) */}
            <button
              onClick={() => setShowPasskeyModal(true)}
              className="px-2.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1.5"
              title="Switch to Admin Verification Console (Requires Passkey)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Admin Console</span>
            </button>

            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Google Avatar"
                className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-xs"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200">
                {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : currentUser.email?.charAt(0).toUpperCase() || 'A'}
              </div>
            )}
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-bold text-slate-800">
                {currentUser.displayName || currentUser.email}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium flex items-center justify-end gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Google Verified Agent
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

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Action Success Alert */}
        {actionSuccess && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 shadow-sm flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-2.5 text-emerald-900 text-sm font-semibold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Success Alert */}
        {submitSuccess && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 shadow-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-emerald-900">Record Submitted Successfully!</h3>
              <p className="text-xs text-emerald-700 mt-0.5">
                The client data has been stored in Firestore with status <span className="font-semibold uppercase tracking-wider">submitted</span> and is now available in the Admin Portal.
              </p>
            </div>
          </div>
        )}

        {/* Intake Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">New Client Onboarding</h2>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
              Enterprise Sync
            </span>
          </div>

          <form onSubmit={handleSubmitForm} className="p-6 sm:p-8 space-y-6">
            {submitError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-medium text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
              {/* Party Name */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Party Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    placeholder="e.g. Apex Industrial Garments Pvt Ltd"
                    autoCapitalize="words"
                    className="w-full pl-10 pr-4 py-3.5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition shadow-xs"
                  />
                </div>
              </div>

              {/* Contact Number + Deduplication */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Contact Number <span className="text-rose-500">*</span>
                  </label>
                  {isCheckingPhone && (
                    <span className="text-xs text-indigo-600 flex items-center gap-1 font-medium">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Checking duplicate...
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className={`w-full pl-10 pr-4 py-3.5 bg-slate-50/70 border rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:bg-white transition shadow-xs ${
                      duplicateClient
                        ? 'border-amber-400 focus:ring-amber-500'
                        : 'border-slate-200 focus:ring-indigo-500'
                    }`}
                  />
                </div>

                {/* Deduplication Warning Banner */}
                {duplicateClient && (
                  <div className="mt-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Duplicate Detected:</span> A client with phone{' '}
                      <span className="font-semibold">{duplicateClient.contactNumber}</span> is already registered as{' '}
                      <span className="font-semibold">"{duplicateClient.partyName}"</span> (Status:{' '}
                      <span className="uppercase font-bold text-amber-800">{duplicateClient.status}</span>).
                    </div>
                  </div>
                )}
              </div>

              {/* Machine Count */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Machine Count <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
                    className="w-full pl-10 pr-4 py-3.5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition shadow-xs"
                  />
                </div>
              </div>

              {/* Monthly Capacity */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Monthly Capacity <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Gauge className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={monthlyCapacity}
                    onChange={(e) => setMonthlyCapacity(e.target.value)}
                    placeholder="e.g. 50,000 meters / month"
                    className="w-full pl-10 pr-4 py-3.5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition shadow-xs"
                  />
                </div>
              </div>

              {/* Address with GPS Autofill Button */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Factory / Office Address <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGetCurrentLocation}
                    disabled={isLocating}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition border border-indigo-200 disabled:opacity-50"
                    title="Autofill current GPS coordinates & location address"
                  >
                    <Compass className={`w-3.5 h-3.5 text-indigo-600 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>{isLocating ? 'Detecting GPS...' : 'Use Current GPS Location'}</span>
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute top-3.5 left-3.5 flex items-start pointer-events-none text-slate-400">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <textarea
                    rows={3}
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Plot No. 45, GIDC Industrial Estate, Sector 2"
                    className="w-full pl-10 pr-4 py-3.5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-none shadow-xs"
                  ></textarea>
                </div>
              </div>

              {/* Factory / Office Photos Attachment */}
              <div className="sm:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Factory / Office Photos <span className="text-slate-400 font-normal normal-case">(Max {MAX_PHOTOS})</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Capture directly with your phone camera or select up to {MAX_PHOTOS} from gallery.
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    photos.length === MAX_PHOTOS
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {photos.length} / {MAX_PHOTOS} Photos
                  </span>
                </div>

                {/* Hidden File & Camera Inputs for iOS/Android */}
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

                {/* Photo Error Banner */}
                {photoError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                      <span>{photoError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhotoError(null)}
                      className="text-rose-500 hover:text-rose-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Compressing State Indicator */}
                {isCompressing && (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-700 flex items-center gap-2.5">
                    <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin flex-shrink-0" />
                    <span>Processing photo on device (HTML5 Canvas compression)...</span>
                  </div>
                )}

                {/* Photo Previews & Mobile Buttons Area */}
                <div className="space-y-3">
                  {/* Render Existing Photo Previews */}
                  {photos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {photos.map((photoBase64, index) => (
                        <div
                          key={index}
                          className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shadow-sm aspect-video sm:aspect-square flex items-center justify-center"
                        >
                          <img
                            src={photoBase64}
                            alt={`Factory/Office preview ${index + 1}`}
                            className="w-full h-full object-cover group-hover:opacity-90 transition cursor-pointer"
                            onClick={() => openPhotoPreview(photoBase64)}
                          />

                          {/* Photo Badge */}
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-slate-900/80 text-white rounded text-[10px] font-bold backdrop-blur-sm">
                            Photo #{index + 1}
                          </span>

                          {/* Desktop Hover & Mobile Touch Controls */}
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2 pointer-events-none">
                            <button
                              type="button"
                              onClick={() => openPhotoPreview(photoBase64)}
                              className="p-2 rounded-lg bg-white/90 text-slate-800 hover:bg-white hover:text-slate-900 shadow-sm transition pointer-events-auto"
                              title="Preview & zoom"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(index)}
                              className="p-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 shadow-sm transition pointer-events-auto"
                              title="Remove photo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Quick Remove Button on Mobile */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemovePhoto(index); }}
                            className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white shadow-md transition z-10"
                            title="Remove photo"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Big Mobile Action Buttons for Camera & Gallery (if < MAX_PHOTOS) */}
                  {photos.length < MAX_PHOTOS && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Take Photo with Camera */}
                      <button
                        type="button"
                        onClick={handleTakePhoto}
                        className="py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-sm shadow-md shadow-indigo-500/20 transition flex items-center justify-center gap-2.5"
                      >
                        <Camera className="w-5 h-5" />
                        <span>Take Photo with Camera</span>
                      </button>

                      {/* Choose from Gallery / Files */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="py-3 px-4 rounded-xl bg-white border-2 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50 active:scale-[0.98] text-indigo-700 font-bold text-sm transition flex items-center justify-center gap-2.5"
                      >
                        <ImageIcon className="w-5 h-5 text-indigo-600" />
                        <span>Choose from Gallery</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Data & {photos.length} photo(s) will be recorded with status <span className="font-semibold text-slate-700">submitted</span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isCompressing}
                className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-500/25 transition flex items-center justify-center gap-2 disabled:opacity-60"
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

        {/* My Submissions History (Pending / Unverified only) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                My Pending Submissions ({mySubmissions.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Entries are editable while pending verification. Once verified by an Admin, records are locked and moved to executive storage.
              </p>
            </div>
            {submissionsLoading && (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
            )}
          </div>

          {/* Security & Access Notice */}
          <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-600">
            <Lock className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800">Security Rule:</span> Field agents hold modification authority exclusively over pending/unverified entries. When an Administrator verifies an entry, it is safely transferred to the Admin Portal and archived from field devices.
            </div>
          </div>

          {mySubmissions.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No pending submissions. All verified client records have been securely locked and transferred to the executive database.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {mySubmissions.map((item) => (
                <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0 flex items-start sm:items-center gap-3">
                    {/* Submission photo thumbnail if available */}
                    {item.photos && item.photos.length > 0 ? (
                      <div
                        onClick={() => setPreviewModalPhoto(item.photos![0])}
                        className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200 bg-slate-100 cursor-pointer group relative shadow-xs"
                        title="Click to view photo"
                      >
                        <img
                          src={item.photos[0]}
                          alt={item.partyName}
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                        {item.photos.length > 1 && (
                          <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-black/75 text-white text-[9px] font-bold rounded">
                            +{item.photos.length - 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex-shrink-0 flex items-center justify-center text-slate-400">
                        <Building2 className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{item.partyName}</p>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{item.address}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-1">
                        <span className="font-mono text-slate-700">{item.contactNumber}</span>
                        <span>•</span>
                        <span>{item.machineCount} machines</span>
                        <span>•</span>
                        <span>{item.monthlyCapacity}</span>
                        {item.photos && item.photos.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-indigo-600 font-medium">
                              <Camera className="w-3 h-3" />
                              {item.photos.length} photo{item.photos.length > 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status & Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        item.status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.status}
                    </span>

                    {/* Modify / Edit Button */}
                    <button
                      type="button"
                      onClick={() => handleStartEdit(item)}
                      className="p-2 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition flex items-center gap-1.5 text-xs font-semibold"
                      title="Edit / Modify this entry"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Modify</span>
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => setDeletingClient(item)}
                      className="p-2 rounded-xl border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition flex items-center gap-1.5 text-xs font-semibold"
                      title="Delete this entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Edit Entry Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            {/* Edit Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Modify Client Entry</h3>
                  <p className="text-xs text-slate-500 truncate max-w-xs">{editingClient.partyName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Edit Modal Form Body */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {editError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-medium text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Party Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Party Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={editPartyName}
                    onChange={(e) => setEditPartyName(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </div>
              </div>

              {/* Contact Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Contact Number <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    value={editContactNumber}
                    onChange={(e) => setEditContactNumber(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Machine Count */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Machine Count <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      required
                      value={editMachineCount}
                      onChange={(e) => setEditMachineCount(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                    />
                  </div>
                </div>

                {/* Monthly Capacity */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Monthly Capacity <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Gauge className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={editMonthlyCapacity}
                      onChange={(e) => setEditMonthlyCapacity(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Factory / Office Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute top-3 left-3 flex items-start pointer-events-none text-slate-400">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <textarea
                    rows={2}
                    required
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-none"
                  ></textarea>
                </div>
              </div>

              {/* Edit Photos Section */}
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-600" />
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
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Add Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleTakeEditPhoto}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1 transition"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Camera</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editPhotoError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-center justify-between">
                    <span>{editPhotoError}</span>
                    <button type="button" onClick={() => setEditPhotoError(null)}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {isEditCompressing && (
                  <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Compressing image with Canvas...</span>
                  </div>
                )}

                {/* Edit Photo Thumbnails Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {editPhotos.map((photo, pIdx) => (
                    <div
                      key={pIdx}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-square shadow-xs cursor-pointer"
                      onClick={() => openPhotoPreview(photo)}
                    >
                      <img src={photo} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRemoveEditPhoto(pIdx); }}
                        className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white transition shadow-sm z-10"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 text-white rounded text-[9px] font-bold">
                        #{pIdx + 1}
                      </span>
                    </div>
                  ))}
                  {editPhotos.length === 0 && (
                    <div className="col-span-3 sm:col-span-6 p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                      No photos attached. Click "Add Photo" above to attach factory/office pictures.
                    </div>
                  )}
                </div>
              </div>

              {/* Edit Modal Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || isEditCompressing}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-500/25 transition flex items-center gap-2 disabled:opacity-60"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Client Entry?</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              Are you sure you want to permanently delete the submission for{' '}
              <span className="font-bold text-slate-900">"{deletingClient.partyName}"</span> ({deletingClient.contactNumber})?
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
                <span>Yes, Delete Entry</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal with Zoom & Pan */}
      {previewModalPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200"
          onClick={() => setPreviewModalPhoto(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview Header & Controls */}
            <div className="p-3 sm:p-4 flex items-center justify-between border-b border-slate-800 text-white bg-slate-950/60">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider">Photo Inspection</span>
              </div>

              {/* Zoom & Rotation Toolbar */}
              <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-800/90 px-2 py-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => {
                    const next = Math.max(prev - 0.5, 1);
                    if (next === 1) setPreviewPosition({ x: 0, y: 0 });
                    return next;
                  })}
                  disabled={previewZoom <= 1}
                  className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-30 text-slate-300 hover:text-white transition"
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => { setPreviewZoom(1); setPreviewPosition({ x: 0, y: 0 }); setPreviewRotation(0); }}
                  className="px-1.5 py-0.5 text-xs font-mono font-bold text-indigo-300 hover:bg-white/10 rounded transition"
                  title="Click to reset zoom"
                >
                  {Math.round(previewZoom * 100)}%
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => Math.min(prev + 0.5, 4))}
                  disabled={previewZoom >= 4}
                  className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-30 text-slate-300 hover:text-white transition"
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <div className="w-px h-3.5 bg-slate-700 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setPreviewRotation((prev) => (prev + 90) % 360)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => { setPreviewZoom(1); setPreviewPosition({ x: 0, y: 0 }); setPreviewRotation(0); }}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
                  title="Reset Fit"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => setPreviewModalPhoto(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Interactive Image Viewport */}
            <div
              className="p-4 flex items-center justify-center bg-black/60 min-h-[350px] max-h-[70vh] h-[55vh] overflow-hidden relative cursor-grab active:cursor-grabbing"
              onWheel={(e) => {
                e.stopPropagation();
                if (e.deltaY < 0) {
                  setPreviewZoom((prev) => Math.min(prev + 0.25, 4));
                } else {
                  setPreviewZoom((prev) => {
                    const next = Math.max(prev - 0.25, 1);
                    if (next === 1) setPreviewPosition({ x: 0, y: 0 });
                    return next;
                  });
                }
              }}
              onMouseDown={(e) => {
                if (previewZoom > 1) {
                  setPreviewDragging(true);
                  setPreviewDragStart({ x: e.clientX - previewPosition.x, y: e.clientY - previewPosition.y });
                }
              }}
              onMouseMove={(e) => {
                if (previewDragging && previewZoom > 1) {
                  setPreviewPosition({ x: e.clientX - previewDragStart.x, y: e.clientY - previewDragStart.y });
                }
              }}
              onMouseUp={() => setPreviewDragging(false)}
              onMouseLeave={() => setPreviewDragging(false)}
              onDoubleClick={() => {
                if (previewZoom > 1) {
                  setPreviewZoom(1);
                  setPreviewPosition({ x: 0, y: 0 });
                } else {
                  setPreviewZoom(2.5);
                }
              }}
            >
              <img
                src={previewModalPhoto}
                alt="Full Preview"
                draggable={false}
                style={{
                  transform: `translate(${previewPosition.x}px, ${previewPosition.y}px) scale(${previewZoom}) rotate(${previewRotation}deg)`,
                  transition: previewDragging ? 'none' : 'transform 0.15s ease-out',
                  touchAction: 'none'
                }}
                className="max-h-[50vh] w-auto max-w-full object-contain rounded-lg shadow-2xl select-none pointer-events-auto"
              />
            </div>

            {/* Hint Footer */}
            <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800/80 text-[11px] text-slate-400 text-center">
              💡 Scroll mouse or click Zoom In/Out • Drag to pan • Double click to zoom in/reset
            </div>
          </div>
        </div>
      )}

      {/* Passkey Authorization Modal */}
      <PasskeyModal
        isOpen={showPasskeyModal}
        onClose={() => setShowPasskeyModal(false)}
        onSuccess={() => {
          setShowPasskeyModal(false);
          setActivePortal('admin');
        }}
        correctPasskey={ADMIN_PASSKEY}
      />

      {/* Install Mobile App Modal */}
      <InstallModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />
    </div>
  );
}
