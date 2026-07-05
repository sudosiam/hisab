import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MonthPicker } from '../../../src/components/MonthPicker';
import { getPurchaseReport } from '../../../src/services/reports';
import { getCurrentMonthKey } from '../../../src/utils/date';
import { formatCurrency } from '../../../src/utils/format';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { radius, spacing } from '../../../src/constants/theme';

export default function PurchaseReportScreen() {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        header: { padding: spacing.sm },
        total: { fontWeight: '700', textAlign: 'center', color: colors.text },
        row: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          backgroundColor: colors.surface,
          padding: spacing.md,
          borderRadius: radius.sm,
          marginBottom: spacing.xs,
          borderWidth: 1,
          borderColor: colors.border,
        },
        invoice: { fontWeight: '600', color: colors.text },
        party: { fontSize: 13, color: colors.textSecondary },
        amount: { fontWeight: '700', marginTop: 4, color: colors.text },
      }),
    [colors]
  );
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey());
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPurchaseReport>>>([]);

  useFocusEffect(useCallback(() => { getPurchaseReport(monthKey).then(setRows); }, [monthKey]));

  const total = rows.reduce((s, r) => s + r.total_amount, 0);

  return (
    <View style={styles.container}>
      <View style={localStyles.header}>
        <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        <Text style={localStyles.total}>Total Purchases: {formatCurrency(total)}</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.invoice_no}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={localStyles.row}>
            <View>
              <Text style={localStyles.invoice}>{item.invoice_no}</Text>
              <Text style={localStyles.party}>{item.supplier_name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <StatusBadge status={item.status} />
              <Text style={localStyles.amount}>{formatCurrency(item.total_amount)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
