import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import * as firebaseAuth from 'firebase/auth';
import * as firebaseFirestore from 'firebase/firestore';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { syncUserProfile } from '../services/userService';

// Mock Firebase Auth
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn().mockReturnValue({}),
  setPersistence: vi.fn().mockResolvedValue(undefined),
  browserLocalPersistence: 'LOCAL',
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    // Default to unauthenticated
    callback(null);
    return vi.fn();
  }),
  GoogleAuthProvider: {
    credential: vi.fn().mockReturnValue({ providerId: 'google.com', signInMethod: 'oauth' }),
  },
  signInWithCredential: vi.fn(),
  signInWithPopup: vi.fn(),
}));

// Mock Firebase Firestore
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  onSnapshot: vi.fn((_query, callback) => {
    callback({ docs: [], docChanges: () => [] });
    return vi.fn();
  }),
  serverTimestamp: vi.fn().mockReturnValue({ seconds: 123456789, nanoseconds: 0 }),
  orderBy: vi.fn(),
}));

// Mock GoogleAuth
vi.mock('@codetrix-studio/capacitor-google-auth', () => ({
  GoogleAuth: {
    initialize: vi.fn(),
    signIn: vi.fn().mockResolvedValue({
      authentication: { idToken: 'mock-google-id-token' },
      email: 'agent@gmail.com',
      name: 'Agent Test',
    }),
  },
}));

// Mock Capacitor Core
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(true),
  },
}));

// Mock Capacitor plugins
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn().mockReturnValue(Promise.resolve({ remove: vi.fn() })),
    exitApp: vi.fn(),
  },
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: vi.fn().mockResolvedValue(undefined),
    setBackgroundColor: vi.fn().mockResolvedValue(undefined),
  },
  Style: { Dark: 'DARK' },
}));

vi.mock('@capacitor/camera', () => ({
  Camera: {
    checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted', photos: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ camera: 'granted', photos: 'granted' }),
    getPhoto: vi.fn(),
  },
  CameraSource: { Camera: 'CAMERA', Photos: 'PHOTOS' },
  CameraResultType: { DataUrl: 'dataUrl', Base64: 'base64' },
}));

vi.mock('@capawesome/capacitor-badge', () => ({
  Badge: {
    isSupported: vi.fn().mockResolvedValue({ isSupported: true }),
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    set: vi.fn().mockResolvedValue(undefined),
    increase: vi.fn().mockResolvedValue(undefined),
    decrease: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    schedule: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('1. Authentication & Role Routing Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders single unified login screen with TEXHUB branding and without admin passkeys', async () => {
    render(<App />);

    // Check TEXHUB branding and textile tagline
    expect(screen.getByText('TEX')).toBeInTheDocument();
    expect(screen.getByText('HUB')).toBeInTheDocument();
    expect(screen.getByText(/Fabric Designing \| Developing \| Weaving/i)).toBeInTheDocument();
    expect(screen.getByText(/Expert in make to order "Cotton woven Dobby Fabrics"/i)).toBeInTheDocument();

    // Verify Google sign-in button is present
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();

    // Verify Sign In and Register tabs exist
    const signInButtons = screen.getAllByRole('button', { name: /Sign In/i });
    expect(signInButtons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /^Register$/i })).toBeInTheDocument();

    // Ensure NO legacy passkey input or admin console switch buttons exist
    expect(screen.queryByText(/Admin Console/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Enter passkey/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Install App/i)).not.toBeInTheDocument();
  });

  it('allows toggling to Register mode with role selection between Field Agent and Administrator', async () => {
    render(<App />);

    const registerTab = screen.getByRole('button', { name: /^Register$/i });
    fireEvent.click(registerTab);

    // Should display Account Role selector
    expect(screen.getByText('Account Role')).toBeInTheDocument();
    expect(screen.getByText('Field Agent')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Register as Agent/i })).toBeInTheDocument();

    // Select Administrator role
    fireEvent.click(screen.getByText('Administrator'));
    expect(screen.getByRole('button', { name: /Register as Admin/i })).toBeInTheDocument();
  });

  it('handles email/password login submission properly', async () => {
    (firebaseAuth.signInWithEmailAndPassword as any).mockResolvedValue({
      user: {
        uid: 'test-agent-uid',
        email: 'agent@texhub.in',
        displayName: 'Test Agent',
      },
    });

    const { container } = render(<App />);

    const emailInput = screen.getByPlaceholderText('agent@texhub.in');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    fireEvent.change(emailInput, { target: { value: 'agent@texhub.in' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'agent@texhub.in',
        'password123'
      );
    });
  });

  it('executes native Google Sign-In with @codetrix-studio/capacitor-google-auth on native platform', async () => {
    (firebaseAuth.signInWithCredential as any).mockResolvedValue({
      user: {
        uid: 'google-agent-uid',
        email: 'agent@gmail.com',
        displayName: 'Google Agent',
      },
    });

    render(<App />);

    const googleBtn = screen.getByText('Continue with Google');
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(GoogleAuth.signIn).toHaveBeenCalled();
      expect(firebaseAuth.signInWithCredential).toHaveBeenCalled();
    });
  });

  it('syncs user profile and determines role correctly for admin and agent', async () => {
    // Test role resolution logic
    const mockAgentUser = {
      uid: 'agent-123',
      email: 'fieldagent@company.com',
      displayName: 'Field Agent',
    } as any;

    const mockAdminUser = {
      uid: 'admin-456',
      email: 'executive.admin@company.com',
      displayName: 'Executive Admin',
    } as any;

    // Agent profile sync
    (firebaseFirestore.getDoc as any).mockResolvedValueOnce({
      exists: () => false,
    });
    const agentProfile = await syncUserProfile(mockAgentUser, 'agent');
    expect(agentProfile.role).toBe('agent');

    // Admin profile sync
    (firebaseFirestore.getDoc as any).mockResolvedValueOnce({
      exists: () => false,
    });
    const adminProfile = await syncUserProfile(mockAdminUser, 'admin');
    expect(adminProfile.role).toBe('admin');
  });
});
