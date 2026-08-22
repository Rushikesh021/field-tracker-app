import { Camera as CapCamera } from '@capacitor/camera';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Badge } from '@capawesome/capacitor-badge';
import { Capacitor } from '@capacitor/core';

export interface AppPermissionStatus {
  camera: boolean;
  notifications: boolean;
  badge: boolean;
}

/**
 * Initializes and requests necessary native permissions on app startup.
 */
export async function initializeNativePermissions(): Promise<AppPermissionStatus> {
  const status: AppPermissionStatus = {
    camera: false,
    notifications: false,
    badge: false
  };

  if (!Capacitor.isNativePlatform()) {
    // Web environment checks
    if ('Notification' in window && Notification.permission !== 'granted') {
      try {
        const perm = await Notification.requestPermission();
        status.notifications = perm === 'granted';
      } catch (e) {
        console.warn('Web notification request error:', e);
      }
    }
    return status;
  }

  // 1. Camera Permissions
  try {
    const camStatus = await CapCamera.checkPermissions();
    if (camStatus.camera !== 'granted' || camStatus.photos !== 'granted') {
      const camReq = await CapCamera.requestPermissions({ permissions: ['camera', 'photos'] });
      status.camera = camReq.camera === 'granted';
    } else {
      status.camera = true;
    }
  } catch (err) {
    console.warn('Camera permission initialization warning:', err);
  }

  // 2. Local Notification Permissions
  try {
    const notifStatus = await LocalNotifications.checkPermissions();
    if (notifStatus.display !== 'granted') {
      const notifReq = await LocalNotifications.requestPermissions();
      status.notifications = notifReq.display === 'granted';
    } else {
      status.notifications = true;
    }
  } catch (err) {
    console.warn('Notification permission initialization warning:', err);
  }

  // 3. Badge Permissions
  try {
    const isSupported = await Badge.isSupported();
    if (isSupported.isSupported) {
      const badgeStatus = await Badge.checkPermissions();
      if (badgeStatus.display !== 'granted') {
        const badgeReq = await Badge.requestPermissions();
        status.badge = badgeReq.display === 'granted';
      } else {
        status.badge = true;
      }
    }
  } catch (err) {
    console.warn('Badge permission initialization warning:', err);
  }

  return status;
}
