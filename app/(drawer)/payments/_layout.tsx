import { Stack } from 'expo-router';
import {
  stackScreenListeners,
  useStackScreenOptions,
} from '../../../src/navigation/screenOptions';

export default function PaymentsLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions} screenListeners={stackScreenListeners}>
      <Stack.Screen name="index" options={{ title: 'Payments' }} />
      <Stack.Screen name="new" options={{ title: 'New Payment' }} />
      <Stack.Screen name="[id]" options={{ title: 'Payment Details' }} />
    </Stack>
  );
}
