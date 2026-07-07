import Constants from 'expo-constants';

/** Matches `expo.version` in app.json — used for Settings → About. */
export const APP_VERSION = Constants.expoConfig?.version ?? '4.0.1';
