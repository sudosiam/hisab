import React, { useMemo, useState } from 'react';
import { ScrollView, Alert, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { FormInput, PrimaryButton, useScreenStyles } from '../../../src/components/ui';
import { createAccount } from '../../../src/services/banking';
import { formatSqliteError } from '../../../src/db/database';
import { useDatabase } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { radius, spacing } from '../../../src/constants/theme';

export default function AddAccountScreen() {
  const router = useRouter();
  const { refresh } = useDatabase();
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
        },
        chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        chipText: { color: colors.text, fontSize: 14 },
        chipTextActive: { color: colors.onPrimary, fontWeight: '600' },
      }),
    [colors]
  );
  const [name, setName] = useState('');
  const [type, setType] = useState<'cash' | 'bank'>('cash');
  const [opening, setOpening] = useState('0');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Account name is required');
      return;
    }
    setLoading(true);
    try {
      await createAccount({
        name: name.trim(),
        type,
        opening_balance: parseFloat(opening) || 0,
      });
      refresh();
      router.back();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
      <FormInput
        label="Opening Balance"
        value={opening}
        onChangeText={setOpening}
        keyboardType="decimal-pad"
      />
      <PrimaryButton title="Save Account" onPress={handleSave} loading={loading} />
    </ScrollView>
  );
}
