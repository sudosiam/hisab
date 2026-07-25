// Must run before any screen/navigation code (Reanimated 4 + New Architecture).
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { enableFreeze, enableScreens } from 'react-native-screens';

// Native screen containers + freeze inactive screens (GPU/CPU win during transitions).
enableScreens(true);
enableFreeze(true);

// Define OS backup task in global scope before the app boots.
import './src/services/backupBackgroundTask';
import 'expo-router/entry';
