import { Stack } from 'expo-router';
import { useStackScreenOptions } from '../../../src/navigation/screenOptions';

export default function PartiesLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Parties' }} />
      <Stack.Screen name="[id]" options={{ title: 'Party Details' }} />
    </Stack>
  );
}
