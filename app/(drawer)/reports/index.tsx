import React from 'react';
import { Text, TouchableOpacity, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenTitle, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { useTheme } from '../../../src/context/ThemeContext';
import { spacing } from '../../../src/constants/theme';

type ReportItem = {
  title: string;
  route: string;
  desc: string;
};

const FINANCIAL_STATEMENTS: ReportItem[] = [
  {
    title: 'Cash Flow',
    route: '/(drawer)/reports/cash-flow',
    desc: 'Operating, investing, and financing cash movement',
  },
  {
    title: 'Profit & Loss',
    route: '/(drawer)/reports/profit-loss',
    desc: 'Revenue, COGS, expenses, net profit',
  },
  {
    title: 'Balance Sheet',
    route: '/(drawer)/balance-sheet',
    desc: 'Assets, liabilities, and equity',
  },
  {
    title: 'Trial Balance',
    route: '/(drawer)/reports/trial-balance',
    desc: 'Debit and credit summary',
  },
  {
    title: 'Growth',
    route: '/(drawer)/growth',
    desc: 'Net worth, ROI, monthly trends',
  },
];

const LEDGERS: ReportItem[] = [
  {
    title: 'General Ledger',
    route: '/(drawer)/reports/general-ledger',
    desc: 'Journal lines by account',
  },
  {
    title: 'Day Book',
    route: '/(drawer)/reports/day-book',
    desc: 'All vouchers by date',
  },
  {
    title: 'Customer Statement',
    route: '/(drawer)/reports/customer-statement',
    desc: 'Customer ledger for a date range',
  },
  {
    title: 'Vendor Statement',
    route: '/(drawer)/reports/vendor-statement',
    desc: 'Supplier ledger and PDF export',
  },
];

const DUES: ReportItem[] = [
  {
    title: 'Receivables',
    route: '/(drawer)/reports/receivables',
    desc: 'Outstanding customer dues',
  },
  {
    title: 'Payables',
    route: '/(drawer)/reports/payables',
    desc: 'Outstanding supplier dues',
  },
];

const OPERATIONAL: ReportItem[] = [
  {
    title: 'Sales Report',
    route: '/(drawer)/reports/sales',
    desc: 'Monthly sales summary',
  },
  {
    title: 'Purchase Report',
    route: '/(drawer)/reports/purchases',
    desc: 'Monthly purchase summary',
  },
  {
    title: 'Inventory Report',
    route: '/(drawer)/reports/inventory',
    desc: 'Stock valuation',
  },
  {
    title: 'Expenses by Category',
    route: '/(drawer)/reports/expense-categories',
    desc: 'Operating expenses by category',
  },
];

function ReportSection({
  items,
  onPress,
}: {
  items: ReportItem[];
  onPress: (route: string) => void;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' }]}>
      {items.map((r, index) => (
        <TouchableOpacity
          key={r.route}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: spacing.sm + 4,
            paddingHorizontal: spacing.md,
            borderBottomWidth: index < items.length - 1 ? 1 : 0,
            borderBottomColor: colors.borderLight,
          }}
          onPress={() => onPress(r.route)}
          accessibilityRole="button"
          accessibilityLabel={r.title}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{r.title}</Text>
            <Text style={styles.cardSub}>{r.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ReportsIndexScreen() {
  const router = useRouter();
  const styles = useScreenStyles();

  const navigate = (route: string) => router.push(route as never);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}>
      <ScreenTitle title="Reports" subtitle="Statements, ledgers, and summaries." />
      <SectionHeader title="Financial Statements" />
      <ReportSection items={FINANCIAL_STATEMENTS} onPress={navigate} />
      <SectionHeader title="Ledgers" />
      <ReportSection items={LEDGERS} onPress={navigate} />
      <SectionHeader title="Receivables & Payables" />
      <ReportSection items={DUES} onPress={navigate} />
      <SectionHeader title="Operational" />
      <ReportSection items={OPERATIONAL} onPress={navigate} />
    </ScrollView>
  );
}
