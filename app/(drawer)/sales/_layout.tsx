import { Stack } from 'expo-router';
import { useStackScreenOptions } from '../../../src/navigation/screenOptions';

export default function SalesLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Sales' }} />
      <Stack.Screen name="new" options={{ title: 'New Sale' }} />
      <Stack.Screen name="[id]" options={{ title: 'Sale Details' }} />
      <Stack.Screen name="edit" options={{ title: 'Edit Sale' }} />
    </Stack>
  );
}
