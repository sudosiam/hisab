import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenTitle, SectionHeader, useScreenStyles } from '../../../src/components/ui';
import { NavListRow } from '../../../src/components/ListItem';
import { useGstEnabled } from '../../../src/context/GstContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { spacing } from '../../../src/constants/theme';
import { cardSurface } from '../../../src/constants/shadows';

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

const GST_REPORTS: ReportItem[] = [
  {
    title: 'GST Summary',
    route: '/(drawer)/reports/gst-summary',
    desc: 'Books GST summary with GSTR-1/3B helper JSON export',
  },
  {
    title: 'Outward Supplies',
    route: '/(drawer)/reports/gst-outward',
    desc: 'Outward supplies register',
  },
  {
    title: 'Inward Supplies',
    route: '/(drawer)/reports/gst-inward',
    desc: 'Inward supplies register',
  },
  {
    title: 'Customers by State',
    route: '/(drawer)/reports/gst-state-wise',
    desc: 'GST sales grouped by customer state',
  },
  {
    title: 'HSN Summary',
    route: '/(drawer)/reports/gst-hsn',
    desc: 'HSN summary by rate',
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
    title: 'Vendor × Account',
    route: '/(drawer)/reports/vendor-account-purchases',
    desc: 'Purchases by vendor with payment accounts',
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
          description={r.desc}
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
  const gstEnabled = useGstEnabled();

  const navigate = (route: string) => router.push(route as never);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenTitle title="Reports" subtitle="Statements, ledgers, and summaries." />
      <SectionHeader title="Financial Statements" />
      <ReportSection items={FINANCIAL_STATEMENTS} onPress={navigate} />
      <SectionHeader title="Ledgers" />
      <ReportSection items={LEDGERS} onPress={navigate} />
      <SectionHeader title="Receivables & Payables" />
      <ReportSection items={DUES} onPress={navigate} />
      <SectionHeader title="Operational" />
      <ReportSection items={OPERATIONAL} onPress={navigate} />
      {gstEnabled ? (
        <>
          <SectionHeader title="GST" />
          <ReportSection items={GST_REPORTS} onPress={navigate} />
        </>
      ) : null}
    </ScrollView>
  );
}
