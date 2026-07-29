import { Stack } from 'expo-router';
import {
  stackScreenListeners,
  useStackScreenOptions,
} from '../../../src/navigation/screenOptions';

export default function InventoryLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions} screenListeners={stackScreenListeners}>
      <Stack.Screen name="index" options={{ title: 'Inventory' }} />
      <Stack.Screen name="new" options={{ title: 'Add Product' }} />
      <Stack.Screen name="[id]" options={{ title: 'Product Details' }} />
    </Stack>
  );
}
