import Constants from 'expo-constants';

/** Matches `expo.version` in app.json — used for Settings → About. */
export const APP_VERSION = Constants.expoConfig?.version ?? '2.1.0';
