// Must run before any screen/navigation code (Reanimated 4 + New Architecture).
import 'react-native-gesture-handler';
import 'react-native-reanimated';
// Define OS backup task in global scope before the app boots.
import './src/services/backupBackgroundTask';
import 'expo-router/entry';
