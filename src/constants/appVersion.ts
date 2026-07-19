import Constants from 'expo-constants';

/** Matches `expo.version` in app.json — used for Settings → About. */
export const APP_VERSION = Constants.expoConfig?.version ?? '10.0.0';
