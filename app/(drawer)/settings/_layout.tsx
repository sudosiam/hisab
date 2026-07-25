import { Stack } from 'expo-router';
import { useStackScreenOptions } from '../../../src/navigation/screenOptions';

export default function SettingsLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="business" options={{ title: 'Business Profile' }} />
      <Stack.Screen name="financial-year" options={{ title: 'Financial Year' }} />
      <Stack.Screen name="invoicing" options={{ title: 'Invoicing' }} />
      <Stack.Screen name="backup" options={{ title: 'Backup' }} />
      <Stack.Screen name="data" options={{ title: 'Data' }} />
    </Stack>
  );
}
