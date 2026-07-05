import { Stack } from 'expo-router';
import { useStackScreenOptions } from '../../../src/navigation/screenOptions';

export default function ReportsLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Reports' }} />
      <Stack.Screen name="sales" options={{ title: 'Sales Report' }} />
      <Stack.Screen name="purchases" options={{ title: 'Purchase Report' }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory Report' }} />
      <Stack.Screen name="profit-loss" options={{ title: 'Profit & Loss' }} />
      <Stack.Screen name="receivables" options={{ title: 'Receivables' }} />
      <Stack.Screen name="payables" options={{ title: 'Payables' }} />
    </Stack>
  );
}
