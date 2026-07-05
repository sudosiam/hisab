import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getInventoryReport } from '../../../src/services/reports';
import { formatCurrency } from '../../../src/utils/format';
import { useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { radius, spacing } from '../../../src/constants/theme';

export default function InventoryReportScreen() {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        total: { fontWeight: '700', textAlign: 'center', padding: spacing.md, color: colors.text },
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
        name: { fontWeight: '600', color: colors.text },
        meta: { fontSize: 12, color: colors.textSecondary },
        value: { fontWeight: '700', color: colors.text },
      }),
    [colors]
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getInventoryReport>>>([]);

  useFocusEffect(useCallback(() => { getInventoryReport().then(setRows); }, []));

  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <View style={styles.container}>
      <Text style={localStyles.total}>Total Inventory Value: {formatCurrency(totalValue)}</Text>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={localStyles.row}>
            <View>
              <Text style={localStyles.name}>{item.name}</Text>
              <Text style={localStyles.meta}>
                Qty: {item.current_qty} · Cost: {formatCurrency(item.avg_cost)} · Sell:{' '}
                {formatCurrency(item.sell_price > 0 ? item.sell_price : item.avg_cost * 1.2)}
              </Text>
            </View>
            <Text style={localStyles.value}>{formatCurrency(item.value)}</Text>
          </View>
        )}
      />
    </View>
  );
}
