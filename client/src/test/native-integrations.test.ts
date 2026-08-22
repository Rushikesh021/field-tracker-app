import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';
import { Badge } from '@capawesome/capacitor-badge';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AppLauncher } from '@capacitor/app-launcher';
import { setAppBadgeCount, incrementAppBadgeCount, clearAppBadgeCount } from '../services/badgeService';
import { sendDeviceNotification } from '../services/notificationService';
import { callPhoneNumber } from '../services/dialerService';
import { initializeNativePermissions } from '../services/permissionService';

// Mock Capacitor Core
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(true),
  },
}));

// Mock Camera
vi.mock('@capacitor/camera', () => ({
  Camera: {
    checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted', photos: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ camera: 'granted', photos: 'granted' }),
    getPhoto: vi.fn(),
  },
  CameraSource: {
    Camera: 'CAMERA',
    Photos: 'PHOTOS',
    Prompt: 'PROMPT',
  },
  CameraResultType: {
    DataUrl: 'dataUrl',
    Base64: 'base64',
    Uri: 'uri',
  },
}));

// Mock Badge
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

// Mock Local Notifications
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    schedule: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock AppLauncher
vi.mock('@capacitor/app-launcher', () => ({
  AppLauncher: {
    canOpenUrl: vi.fn().mockResolvedValue({ value: true }),
    openUrl: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('2. Native Device Integrations Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Camera Integration', () => {
    it('uses CameraSource.Camera and CameraResultType.DataUrl for direct native viewfinder capture', async () => {
      (Camera.getPhoto as any).mockResolvedValueOnce({
        dataUrl: 'data:image/jpeg;base64,mockCameraBase64Data',
        format: 'jpeg',
      });

      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      expect(Camera.getPhoto).toHaveBeenCalledWith({
        quality: 85,
        allowEditing: false,
        resultType: 'dataUrl',
        source: 'CAMERA',
      });
      expect(photo.dataUrl).toContain('mockCameraBase64Data');
    });
  });

  describe('Home Screen App Icon Badging (@capawesome/capacitor-badge)', () => {
    it('sets app badge counter when count is positive', async () => {
      await setAppBadgeCount(5);
      expect(Badge.set).toHaveBeenCalledWith({ count: 5 });
    });

    it('clears app badge counter when count is 0 or negative', async () => {
      await setAppBadgeCount(0);
      expect(Badge.clear).toHaveBeenCalled();
    });

    it('increments badge counter for new status update notifications', async () => {
      await incrementAppBadgeCount();
      expect(Badge.increase).toHaveBeenCalled();
    });

    it('clears badge counter via clearAppBadgeCount', async () => {
      await clearAppBadgeCount();
      expect(Badge.clear).toHaveBeenCalled();
    });
  });

  describe('Native Local Push Notifications (@capacitor/local-notifications)', () => {
    it('schedules system tray notification with proper title, body, and icon styling', async () => {
      await sendDeviceNotification(
        'New Client Intake: Apex Garments',
        'Submitted by Agent 01 • +91 98765 43210 • 12 machines',
        1001
      );

      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            title: 'New Client Intake: Apex Garments',
            body: 'Submitted by Agent 01 • +91 98765 43210 • 12 machines',
            id: 1001,
            smallIcon: 'ic_stat_icon',
            iconColor: '#4f46e5',
          }),
        ],
      });
    });
  });

  describe('Click-to-Call Dialer Integration (@capacitor/app-launcher)', () => {
    it('invokes native phone dialer intent with tel: scheme and cleaned phone number', async () => {
      await callPhoneNumber('+91 98765-43210');

      expect(AppLauncher.canOpenUrl).toHaveBeenCalledWith({
        url: 'tel:+919876543210',
      });
      expect(AppLauncher.openUrl).toHaveBeenCalledWith({
        url: 'tel:+919876543210',
      });
    });
  });

  describe('Startup Native Permissions Initialization', () => {
    it('gracefully checks and requests Camera, Notification, and Badge permissions', async () => {
      const status = await initializeNativePermissions();

      expect(Camera.checkPermissions).toHaveBeenCalled();
      expect(LocalNotifications.checkPermissions).toHaveBeenCalled();
      expect(Badge.checkPermissions).toHaveBeenCalled();

      expect(status).toEqual({
        camera: true,
        notifications: true,
        badge: true,
      });
    });
  });
});
