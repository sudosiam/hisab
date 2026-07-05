import { Stack } from 'expo-router';
import { useStackScreenOptions } from '../../../src/navigation/screenOptions';

export default function BankingLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Banking' }} />
      <Stack.Screen name="[id]" options={{ title: 'Account' }} />
      <Stack.Screen name="add-account" options={{ title: 'Add Account' }} />
      <Stack.Screen name="transfer" options={{ title: 'Transfer' }} />
      <Stack.Screen name="cash" options={{ title: 'Cash Movement' }} />
    </Stack>
  );
}
