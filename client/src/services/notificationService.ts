import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

let audioCtx: AudioContext | null = null;

/**
 * Request notification permissions on both Native Capacitor and Web.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const current = await LocalNotifications.checkPermissions();
      if (current.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        return req.display === 'granted';
      }
      return true;
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      }
      return Notification.permission === 'granted';
    }
  } catch (err) {
    console.warn('Error requesting notification permissions:', err);
  }
  return false;
}

/**
 * Play a synthesized high-fidelity two-tone notification chime via Web Audio API.
 */
export function playNotificationSound(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return;

    if (!audioCtx) {
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // Tone 1
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.25, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.12); // A5
    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0.3, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (err) {
    console.warn('Audio chime playback error:', err);
  }
}

/**
 * Send a device notification (tray popup on Android, desktop notification on Web).
 */
export async function sendDeviceNotification(
  title: string,
  body: string,
  id?: number
): Promise<void> {
  const notifId = id || Math.floor(Math.random() * 900000) + 100000;

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: notifId,
            schedule: { at: new Date(Date.now() + 100) },
            smallIcon: 'ic_stat_icon',
            iconColor: '#4f46e5',
            extra: null
          }
        ]
      });
    } catch (err) {
      console.warn('Native LocalNotifications schedule error:', err);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.svg'
      });
    } catch (err) {
      console.warn('Web notification error:', err);
    }
  }
}
