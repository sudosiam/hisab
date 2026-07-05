import { Stack } from 'expo-router';
import { useStackScreenOptions } from '../../../src/navigation/screenOptions';

export default function OtherIncomeLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Other Income' }} />
      <Stack.Screen name="new" options={{ title: 'New Other Income' }} />
      <Stack.Screen name="[id]" options={{ title: 'Other Income Details' }} />
    </Stack>
  );
}
