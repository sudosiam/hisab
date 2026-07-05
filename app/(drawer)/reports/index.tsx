import React from 'react';
import { Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useScreenStyles } from '../../../src/components/ui';

const REPORTS = [
  { title: 'Sales Report', route: '/(drawer)/reports/sales', desc: 'Monthly sales summary' },
  { title: 'Purchase Report', route: '/(drawer)/reports/purchases', desc: 'Monthly purchase summary' },
  { title: 'Inventory Report', route: '/(drawer)/reports/inventory', desc: 'Stock valuation' },
  { title: 'Profit & Loss', route: '/(drawer)/reports/profit-loss', desc: 'Revenue, COGS, expenses' },
  { title: 'Receivables', route: '/(drawer)/reports/receivables', desc: 'Outstanding customer dues' },
  { title: 'Payables', route: '/(drawer)/reports/payables', desc: 'Outstanding supplier dues' },
];

export default function ReportsIndexScreen() {
  const router = useRouter();
  const styles = useScreenStyles();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {REPORTS.map((r) => (
        <TouchableOpacity
          key={r.route}
          style={styles.card}
          onPress={() => router.push(r.route as never)}
        >
          <Text style={styles.cardTitle}>{r.title}</Text>
          <Text style={styles.cardSub}>{r.desc}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
