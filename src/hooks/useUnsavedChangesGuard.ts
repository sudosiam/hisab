import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';

/** Block back navigation while a form has unsaved edits. */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  options?: { title?: string; message?: string }
) {
  const navigation = useNavigation();

  useEffect(() => {
    if (!isDirty) return;

    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      Alert.alert(
        options?.title ?? 'Discard changes?',
        options?.message ?? 'You have unsaved edits that will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(event.data.action),
          },
        ]
      );
    });

    return unsubscribe;
  }, [navigation, isDirty, options?.title, options?.message]);
}
