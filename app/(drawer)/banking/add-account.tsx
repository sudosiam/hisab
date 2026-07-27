import React, { useMemo, useRef, useState } from 'react';
import { Alert, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  FormInput,
  FormScreen,
  PrimaryButton,
  useScreenStyles,
} from '../../../src/components/ui';
import { DraftBanner } from '../../../src/components/DraftBanner';
import { createAccount } from '../../../src/services/banking';
import { DRAFT_KEYS, loadDraft, type AddAccountFormDraft } from '../../../src/services/formDrafts';
import { useFormDraft } from '../../../src/hooks/useFormDraft';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { formatSqliteError } from '../../../src/db/database';
import { parseAmountInput } from '../../../src/utils/format';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { radius, spacing } from '../../../src/constants/theme';

function isAddAccountDraftEmpty(d: AddAccountFormDraft): boolean {
  return !d.name.trim() && d.type === 'cash' && (!d.opening.trim() || d.opening === '0');
}

export default function AddAccountScreen() {
  const router = useRouter();
  const { refresh } = useDatabaseActions();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          padding: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
          marginBottom: spacing.xs,
          borderWidth: 1,
          borderColor: colors.border,
          minHeight: 44,
          justifyContent: 'center',
        },
        chipActive: {
          backgroundColor: colors.primaryContainer,
          borderColor: colors.primaryContainer,
        },
        chipText: { color: colors.text, fontSize: 14, textAlign: 'center' },
        chipTextActive: { color: colors.onPrimaryContainer, fontWeight: '600', textAlign: 'center' },
      }),
    [colors]
  );
  const [name, setName] = useState('');
  const [type, setType] = useState<'cash' | 'bank'>('cash');
  const [opening, setOpening] = useState('0');
  const [loading, setLoading] = useState(false);
  const leaveBypassRef = useRef(false);

  const draftPayload = useMemo<AddAccountFormDraft>(
    () => ({ name, type, opening }),
    [name, type, opening]
  );

  const { markReady, discardDraft, clearDraftOnSave, hasDraft, noteDraftLoaded } = useFormDraft(
    DRAFT_KEYS.addAccount,
    draftPayload,
    { isEmpty: isAddAccountDraftEmpty }
  );

  useUnsavedChangesGuard(!isAddAccountDraftEmpty(draftPayload) || hasDraft, {
    bypassRef: leaveBypassRef,
    message: 'You have an unsaved account draft that will be lost.',
  });

  const resetForm = () => {
    setName('');
    setType('cash');
    setOpening('0');
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'Your unsaved account will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardDraft();
          resetForm();
        },
      },
    ]);
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadDraft<AddAccountFormDraft>(DRAFT_KEYS.addAccount);
        if (cancelled) return;
        if (draft && !isAddAccountDraftEmpty(draft)) {
          setName(draft.name || '');
          setType(draft.type === 'bank' ? 'bank' : 'cash');
          setOpening(draft.opening ?? '0');
          noteDraftLoaded();
        }
      } catch (e) {
        if (!cancelled) Alert.alert('Error', formatSqliteError(e));
      } finally {
        if (!cancelled) markReady();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markReady, noteDraftLoaded]);

  const handleSave = async () => {
    if (loading) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Account name is required');
      return;
    }
    const openingValue = opening.trim() ? parseAmountInput(opening) : 0;
    if (!Number.isFinite(openingValue)) {
      Alert.alert('Error', 'Enter a valid opening balance');
      return;
    }
    setLoading(true);
    try {
      await createAccount({
        name: name.trim(),
        type,
        opening_balance: openingValue,
      });
      leaveBypassRef.current = true;
      await clearDraftOnSave();
      refresh();
      router.back();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen>
      <DraftBanner visible={hasDraft} onDiscard={handleDiscardDraft} />
      <FormInput label="Account Name" value={name} onChangeText={setName} placeholder="Petty Cash, HDFC..." />
      <Text style={styles.label}>Account Type</Text>
      {(['cash', 'bank'] as const).map((t) => (
        <TouchableOpacity
          key={t}
          style={[localStyles.chip, type === t && localStyles.chipActive]}
          onPress={() => setType(t)}
        >
          <Text style={type === t ? localStyles.chipTextActive : localStyles.chipText}>
            {t === 'cash' ? 'Cash' : 'Bank'}
          </Text>
        </TouchableOpacity>
      ))}
      <FormInput label="Opening Balance" value={opening} onChangeText={setOpening} money />
      <PrimaryButton title="Save Account" onPress={handleSave} loading={loading} />
    </FormScreen>
  );
}
