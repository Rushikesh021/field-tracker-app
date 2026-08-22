import { Badge } from '@capawesome/capacitor-badge';
import { Capacitor } from '@capacitor/core';

/**
 * Request badge permissions gracefully on native platforms.
 */
export async function initBadgePermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const isSupported = await Badge.isSupported();
    if (!isSupported.isSupported) return false;

    const status = await Badge.checkPermissions();
    if (status.display !== 'granted') {
      const requested = await Badge.requestPermissions();
      return requested.display === 'granted';
    }
    return true;
  } catch (err) {
    console.warn('Badge permissions check error:', err);
    return false;
  }
}

/**
 * Set the native launcher app icon numeric badge count (red counter on app icon).
 */
export async function setAppBadgeCount(count: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const isSupported = await Badge.isSupported();
    if (!isSupported.isSupported) return;

    if (count <= 0) {
      await Badge.clear();
    } else {
      await Badge.set({ count: Math.max(0, count) });
    }
  } catch (err) {
    console.warn('Error setting app badge count:', err);
  }
}

/**
 * Increase the native launcher app icon badge count by 1.
 */
export async function incrementAppBadgeCount(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const isSupported = await Badge.isSupported();
    if (!isSupported.isSupported) return;

    await Badge.increase();
  } catch (err) {
    console.warn('Error increasing app badge count:', err);
  }
}

/**
 * Clear the native launcher app icon badge count.
 */
export async function clearAppBadgeCount(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const isSupported = await Badge.isSupported();
    if (!isSupported.isSupported) return;

    await Badge.clear();
  } catch (err) {
    console.warn('Error clearing app badge count:', err);
  }
}
