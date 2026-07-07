import { Stack } from 'expo-router';
import { useStackScreenOptions } from '../../../src/navigation/screenOptions';

export default function PurchasesLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Purchases' }} />
      <Stack.Screen name="new" options={{ title: 'New Purchase' }} />
      <Stack.Screen name="[id]" options={{ title: 'Purchase Details' }} />
      <Stack.Screen name="edit" options={{ title: 'Edit Purchase' }} />
    </Stack>
  );
}
