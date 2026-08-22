import { db } from '../config/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'agent';
  phoneNumber?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

/**
 * Fetch a user's role and profile from the Firestore 'users' collection.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userDocRef = doc(db, 'users', uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
  } catch (err) {
    console.warn('Error fetching user profile from Firestore:', err);
  }
  return null;
}

/**
 * Ensures a user document exists in Firestore and returns the resolved profile & role.
 */
export async function syncUserProfile(
  user: User,
  selectedRole?: 'admin' | 'agent'
): Promise<UserProfile> {
  try {
    const existing = await getUserProfile(user.uid);
    if (existing) {
      // Update any changed auth metadata while keeping existing role
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        displayName: user.displayName || existing.displayName || '',
        photoURL: user.photoURL || existing.photoURL || '',
        email: user.email || existing.email || '',
        updatedAt: serverTimestamp()
      }).catch(() => {});
      return existing;
    }

    // Determine initial role: If user explicitly selected on registration or email has admin flag
    const emailLower = (user.email || '').toLowerCase();
    const assignedRole: 'admin' | 'agent' =
      selectedRole || (emailLower.includes('admin') ? 'admin' : 'agent');

    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      photoURL: user.photoURL || '',
      role: assignedRole,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any
    };

    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(userDocRef, newProfile);
    return newProfile;
  } catch (err) {
    console.warn('Error syncing user profile:', err);
    // Fallback if network or firestore fails
    const emailLower = (user.email || '').toLowerCase();
    return {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'User',
      role: selectedRole || (emailLower.includes('admin') ? 'admin' : 'agent')
    };
  }
}
