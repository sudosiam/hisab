import React from 'react';
import { Text, TouchableOpacity, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenTitle, useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';

const REPORTS = [
  { title: 'Sales Report', route: '/(drawer)/reports/sales', desc: 'Monthly sales summary', icon: 'cart-outline' },
  { title: 'Purchase Report', route: '/(drawer)/reports/purchases', desc: 'Monthly purchase summary', icon: 'bag-handle-outline' },
  { title: 'Inventory Report', route: '/(drawer)/reports/inventory', desc: 'Stock valuation', icon: 'cube-outline' },
  { title: 'Profit & Loss', route: '/(drawer)/reports/profit-loss', desc: 'Revenue, COGS, expenses', icon: 'trending-up-outline' },
  { title: 'Receivables', route: '/(drawer)/reports/receivables', desc: 'Outstanding customer dues', icon: 'people-outline' },
  { title: 'Payables', route: '/(drawer)/reports/payables', desc: 'Outstanding supplier dues', icon: 'receipt-outline' },
];

export default function ReportsIndexScreen() {
  const router = useRouter();
  const styles = useScreenStyles();
  const { colors } = useTheme();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenTitle
        title="Reports"
        subtitle="Review sales, stock, dues, and profitability from one place."
      />
      {REPORTS.map((r) => (
        <TouchableOpacity
          key={r.route}
          style={styles.card}
          onPress={() => router.push(r.route as never)}
          accessibilityRole="button"
          accessibilityLabel={r.title}
        >
          <View style={styles.row}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons name={r.icon as never} size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{r.title}</Text>
                <Text style={styles.cardSub}>{r.desc}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
