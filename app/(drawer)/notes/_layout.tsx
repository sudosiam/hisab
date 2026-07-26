import { Stack } from 'expo-router';
import { useStackScreenOptions } from '../../../src/navigation/screenOptions';

export default function NotesLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Credit / Debit Notes' }} />
      <Stack.Screen name="new" options={{ title: 'New Note' }} />
      <Stack.Screen name="[id]" options={{ title: 'Note Details' }} />
    </Stack>
  );
}
