import { Stack } from 'expo-router';
import {
  stackScreenListeners,
  useStackScreenOptions,
} from '../../../src/navigation/screenOptions';

export default function SettingsLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions} screenListeners={stackScreenListeners}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="business" options={{ title: 'Business Profile' }} />
      <Stack.Screen name="financial-year" options={{ title: 'Financial Year' }} />
      <Stack.Screen name="invoicing" options={{ title: 'Invoicing' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="backup" options={{ title: 'Backup' }} />
      <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
      <Stack.Screen name="tally" options={{ title: 'Tally XML' }} />
      <Stack.Screen name="data" options={{ title: 'Data' }} />
    </Stack>
  );
}
