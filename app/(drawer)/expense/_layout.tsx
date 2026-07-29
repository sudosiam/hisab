import { Stack } from 'expo-router';
import {
  stackScreenListeners,
  useStackScreenOptions,
} from '../../../src/navigation/screenOptions';

export default function ExpenseLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions} screenListeners={stackScreenListeners}>
      <Stack.Screen name="index" options={{ title: 'Expenses' }} />
      <Stack.Screen name="new" options={{ title: 'New Expense' }} />
      <Stack.Screen name="[id]" options={{ title: 'Expense Details' }} />
    </Stack>
  );
}
