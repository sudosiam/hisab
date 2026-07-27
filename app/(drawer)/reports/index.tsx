import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenTitle, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { NavListRow } from '../../../src/components/ListItem';
import { useTheme } from '../../../src/context/ThemeContext';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';

type ReportItem = {
  title: string;
  route: string;
};

const FINANCIAL_STATEMENTS: ReportItem[] = [
  { title: 'Cash Flow', route: '/(drawer)/reports/cash-flow' },
  { title: 'Profit & Loss', route: '/(drawer)/reports/profit-loss' },
  { title: 'Balance Sheet', route: '/(drawer)/balance-sheet' },
  { title: 'Trial Balance', route: '/(drawer)/reports/trial-balance' },
  { title: 'Growth', route: '/(drawer)/growth' },
];

const LEDGERS: ReportItem[] = [
  { title: 'General Ledger', route: '/(drawer)/reports/general-ledger' },
  { title: 'Day Book', route: '/(drawer)/reports/day-book' },
  { title: 'Customer Statement', route: '/(drawer)/reports/customer-statement' },
  { title: 'Vendor Statement', route: '/(drawer)/reports/vendor-statement' },
];

const DUES: ReportItem[] = [
  { title: 'Receivables', route: '/(drawer)/reports/receivables' },
  { title: 'Payables', route: '/(drawer)/reports/payables' },
];

const OPERATIONAL: ReportItem[] = [
  { title: 'Sales Report', route: '/(drawer)/reports/sales' },
  { title: 'Purchase Report', route: '/(drawer)/reports/purchases' },
  { title: 'Vendor × Account', route: '/(drawer)/reports/vendor-account-purchases' },
  { title: 'Inventory Report', route: '/(drawer)/reports/inventory' },
  { title: 'Expenses by Category', route: '/(drawer)/reports/expense-categories' },
];

function ReportSection({
  items,
  onPress,
}: {
  items: ReportItem[];
  onPress: (route: string) => void;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        ...cardSurface(colors, isDark),
        paddingHorizontal: 0,
        paddingVertical: 0,
        overflow: 'hidden',
        marginBottom: spacing.sm,
      }}
    >
      {items.map((r, index) => (
        <NavListRow
          key={r.route}
          title={r.title}
          onPress={() => onPress(r.route)}
          isLast={index === items.length - 1}
        />
      ))}
    </View>
  );
}

export default function ReportsIndexScreen() {
  const router = useRouter();
  const styles = useScreenStyles();

  const navigate = (route: string) => router.push(route as never);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenTitle title="Reports" />
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
