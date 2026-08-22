import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fieldtracker.app',
  appName: 'TEXHUB',
  webDir: 'dist',
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '328644306481-357er1eokqfe7lkbtsiv1tkrp8r05l31.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    }
  }
};

export default config;
