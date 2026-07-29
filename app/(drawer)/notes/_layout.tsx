import { Stack } from 'expo-router';
import {
  stackScreenListeners,
  useStackScreenOptions,
} from '../../../src/navigation/screenOptions';

export default function NotesLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions} screenListeners={stackScreenListeners}>
      <Stack.Screen name="index" options={{ title: 'Adjustments' }} />
      <Stack.Screen name="new" options={{ title: 'New Adjustment' }} />
      <Stack.Screen name="[id]" options={{ title: 'Adjustment' }} />
    </Stack>
  );
}
