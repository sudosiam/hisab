// Must run before any screen/navigation code (Reanimated 4 + New Architecture).
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { enableFreeze, enableScreens } from 'react-native-screens';

// Native screen containers + freeze inactive screens (GPU/CPU win during transitions).
enableScreens(true);
enableFreeze(true);

// Define OS backup task in global scope before the app boots.
import './src/services/backupBackgroundTask';

// Android home-screen widgets — must register before expo-router/entry.
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets/widgetTaskHandler';
registerWidgetTaskHandler(widgetTaskHandler);

import 'expo-router/entry';
