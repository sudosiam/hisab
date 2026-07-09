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
      <Stack.Screen name="cash-flow" options={{ title: 'Cash Flow' }} />
      <Stack.Screen name="trial-balance" options={{ title: 'Trial Balance' }} />
      <Stack.Screen name="day-book" options={{ title: 'Day Book' }} />
      <Stack.Screen name="general-ledger" options={{ title: 'General Ledger' }} />
      <Stack.Screen name="receivables" options={{ title: 'Receivables' }} />
      <Stack.Screen name="payables" options={{ title: 'Payables' }} />
      <Stack.Screen name="customer-statement" options={{ title: 'Customer Statement' }} />
      <Stack.Screen name="vendor-statement" options={{ title: 'Vendor Statement' }} />
      <Stack.Screen name="expense-categories" options={{ title: 'Expenses by Category' }} />
    </Stack>
  );
}
