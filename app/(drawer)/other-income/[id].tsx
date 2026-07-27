import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import {
  EmptyState,
  ErrorState,
  FormInput,
  FormScreen,
  PrimaryButton,
  DatePickerField,
  useScreenStyles,
} from '../../../src/components/ui';
import { StatCard } from '../../../src/components/StatCard';
import { DetailSkeleton } from '../../../src/components/Skeleton';
import { AccountPicker } from '../../../src/components/AccountPicker';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { otherIncomeCategorySource } from '../../../src/components/categorySources';
import {
  deleteOtherIncome,
  getAccountsForPicker,
  getOtherIncomeById,
  updateOtherIncome,
} from '../../../src/services/otherIncome';
import { useUnsavedChangesGuard } from '../../../src/hooks/useUnsavedChangesGuard';
import { parseRouteId } from '../../../src/utils/route';
import { useDatabaseActions } from '../../../src/context/DatabaseContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { formatAmountInput, formatCurrency, parsePositiveAmount } from '../../../src/utils/format';
import { isValidISODate, formatDisplayDate } from '../../../src/utils/date';
import { formatSqliteError } from '../../../src/db/database';
import { spacing } from '../../../src/constants/theme';
import type { Account, OtherIncome } from '../../../src/types';

export default function OtherIncomeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useDatabaseActions();
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: spacing.sm,
          width: '100%',
        },
        headerText: { flex: 1, minWidth: 0 },
        editTap: {
          flexShrink: 0,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.xs,
          minHeight: 44,
          justifyContent: 'center',
        },
        title: { fontSize: 18, fontWeight: '700', color: colors.text },
        meta: { color: colors.textSecondary, marginTop: 4, fontSize: 13, lineHeight: 18 },
        kpiFull: { width: '100%', maxWidth: '100%', flexBasis: '100%', flexGrow: 1 },
        deleteWrap: {
          width: '100%',
          maxWidth: '100%',
          marginTop: spacing.sm,
          alignSelf: 'stretch',
        },
      }),
    [colors]
  );

  const [item, setItem] = useState<OtherIncome | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemId = useMemo(() => parseRouteId(id), [id]);

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [accountId, setAccountId] = useState(0);

  const fillForm = (entry: OtherIncome) => {
    setCategory(entry.category);
    setDescription(entry.description);
    setAmount(formatAmountInput(entry.amount));
    setDate(entry.date);
    setAccountId(entry.account_id);
  };

  const load = useCallback(async () => {
    if (!itemId) {
      setError('Invalid entry');
      setLoading(false);
      return;
    }
    try {
      const entry = await getOtherIncomeById(itemId);
      const a = await getAccountsForPicker(entry?.account_id);
      setItem(entry);
      setAccounts(a);
      if (entry) fillForm(entry);
      setError(entry ? null : 'Entry not found');
    } catch (e) {
      setError(formatSqliteError(e));
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  const editingRef = React.useRef(false);
  editingRef.current = editing;

  const hasLoadedRef = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (editingRef.current) return;
      if (!hasLoadedRef.current) setLoading(true);
      load().finally(() => {
        hasLoadedRef.current = true;
      });
    }, [load])
  );

  const isEditDirty = useMemo(() => {
    if (!editing || !item) return false;
    const amt = parsePositiveAmount(amount);
    return (
      category.trim() !== item.category ||
      description.trim() !== item.description ||
      (amt ?? -1) !== item.amount ||
      date !== item.date ||
      accountId !== item.account_id
    );
  }, [editing, item, category, description, amount, date, accountId]);
  useUnsavedChangesGuard(isEditDirty);

  const handleSave = async () => {
    if (!item || saving) return;
    const amt = parsePositiveAmount(amount);
    if (!category.trim() || !description.trim()) {
      Alert.alert('Missing details', 'Category, description, amount, and account are required');
      return;
    }
    if (amt === null) {
      Alert.alert('Error', 'Enter an amount greater than zero');
      return;
    }
    if (!accountId) {
      Alert.alert('Error', 'Select a bank/cash account');
      return;
    }
    if (!isValidISODate(date)) {
      Alert.alert('Invalid date', 'Select a valid income date');
      return;
    }
    setSaving(true);
    try {
      await updateOtherIncome(item.id, {
        category: category.trim(),
        description: description.trim(),
        amount: amt,
        account_id: accountId,
        date,
      });
      refresh();
      setEditing(false);
      await load();
    } catch (e) {
      Alert.alert('Error', formatSqliteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!item) return;
    Alert.alert(
      'Delete Other Income',
      `Delete ${item.category} — ${formatCurrency(item.amount)}? Account balance will be reversed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOtherIncome(item.id);
              refresh();
              router.back();
            } catch (e) {
              Alert.alert('Error', formatSqliteError(e));
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => { void load(); }} />;
  }

  if (!item) {
    return (
      <EmptyState
        title="Not found"
        message="This record is missing or was deleted."
        actionLabel="Go Back"
        onAction={() => router.back()}
      />
    );
  }

  if (editing) {
    return (
      <FormScreen>
        <CategoryPicker value={category} onChange={setCategory} source={otherIncomeCategorySource} />
        <FormInput label="Description" value={description} onChangeText={setDescription} />
        <FormInput label="Amount (₹)" value={amount} onChangeText={setAmount} money />
        <DatePickerField label="Date" value={date} onChange={setDate} />
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
        <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
        <PrimaryButton
          title="Cancel"
          onPress={() => {
            fillForm(item);
            setEditing(false);
          }}
          variant="secondary"
        />
      </FormScreen>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { width: '100%' }]}
    >
      <View style={localStyles.header}>
        <View style={localStyles.headerText}>
          <Text style={localStyles.title} numberOfLines={2}>
            {item.category}
          </Text>
          <Text style={localStyles.meta} numberOfLines={3}>
            {item.description}
          </Text>
          <Text style={localStyles.meta} numberOfLines={1}>
            {formatDisplayDate(item.date)} · {item.account_name}
          </Text>
        </View>
        <TouchableOpacity
          style={localStyles.editTap}
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          accessibilityLabel="Edit other income"
        >
          <Text style={styles.link}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.detailKpiRow}>
        <StatCard
          label="Amount"
          value={item.amount}
          color={colors.success}
          style={localStyles.kpiFull}
        />
      </View>

      <View style={localStyles.deleteWrap}>
        <PrimaryButton title="Delete Income" onPress={handleDelete} variant="danger" />
      </View>
    </ScrollView>
  );
}
