import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';

/**
 * Launches the native phone dialer with the specified phone number.
 */
export async function callPhoneNumber(phoneNumber: string): Promise<void> {
  const cleanPhone = phoneNumber.trim().replace(/[^\d+]/g, '');
  if (!cleanPhone) {
    alert('Invalid phone number.');
    return;
  }

  const telUrl = `tel:${cleanPhone}`;

  if (Capacitor.isNativePlatform()) {
    try {
      const canOpen = await AppLauncher.canOpenUrl({ url: telUrl });
      if (canOpen.value) {
        await AppLauncher.openUrl({ url: telUrl });
        return;
      }
    } catch (err) {
      console.warn('AppLauncher failed, falling back to window.location:', err);
    }
  }

  window.location.href = telUrl;
}
