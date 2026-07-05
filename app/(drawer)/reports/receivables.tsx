import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getReceivablesReport } from '../../../src/services/reports';
import { formatCurrency } from '../../../src/utils/format';
import { useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { radius, spacing } from '../../../src/constants/theme';

export default function ReceivablesReportScreen() {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        total: { fontWeight: '700', textAlign: 'center', padding: spacing.md, color: colors.danger },
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
        date: { fontSize: 11, color: colors.textSecondary },
        due: { fontWeight: '700', color: colors.danger },
      }),
    [colors]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getReceivablesReport>>>([]);

  useFocusEffect(useCallback(() => { getReceivablesReport().then(setRows); }, []));

  const total = rows.reduce((s, r) => s + r.due, 0);

  return (
    <View style={styles.container}>
      <Text style={localStyles.total}>Total Receivable: {formatCurrency(total)}</Text>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.invoice_no}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={localStyles.row}>
            <View>
              <Text style={localStyles.invoice}>{item.invoice_no}</Text>
              <Text style={localStyles.party}>{item.party_name}</Text>
              <Text style={localStyles.date}>{item.date}</Text>
            </View>
            <Text style={localStyles.due}>{formatCurrency(item.due)}</Text>
          </View>
        )}
      />
    </View>
  );
}
