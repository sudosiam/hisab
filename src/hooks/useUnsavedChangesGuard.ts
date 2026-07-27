import { useEffect, type MutableRefObject } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';

/** Block back navigation while a form has unsaved edits. */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  options?: {
    title?: string;
    message?: string;
    /** Set true immediately before a successful save navigate so the guard does not block. */
    bypassRef?: MutableRefObject<boolean>;
  }
) {
  const navigation = useNavigation();
  const title = options?.title ?? 'Discard changes?';
  const message = options?.message ?? 'You have unsaved edits that will be lost.';
  const bypassRef = options?.bypassRef;

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!isDirty || bypassRef?.current) return;
      event.preventDefault();
      Alert.alert(title, message, [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(event.data.action),
        },
      ]);
    });

    return unsubscribe;
  }, [navigation, isDirty, title, message, bypassRef]);
}
