import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';
import { ThemedPressable } from './ThemedPressable';
import { APP_VERSION } from '../constants/appVersion';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface NavItem {
  label: string;
  route: string;
  icon: IconName;
  activeIcon: IconName;
  match: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Home',
    items: [
      { label: 'Dashboard', route: '/', icon: 'home-outline', activeIcon: 'home', match: ['/', '/index'] },
    ],
  },
  {
    title: 'Trading',
    items: [
      { label: 'Sales', route: '/sales', icon: 'cart-outline', activeIcon: 'cart', match: ['/sales'] },
      { label: 'Purchases', route: '/purchases', icon: 'bag-handle-outline', activeIcon: 'bag-handle', match: ['/purchases'] },
      { label: 'Inventory', route: '/inventory', icon: 'cube-outline', activeIcon: 'cube', match: ['/inventory'] },
      {
        label: 'Adjustments',
        route: '/notes',
        icon: 'document-text-outline',
        activeIcon: 'document-text',
        match: ['/notes'],
      },
    ],
  },
  {
    title: 'Cash & parties',
    items: [
      { label: 'Banking', route: '/banking', icon: 'wallet-outline', activeIcon: 'wallet', match: ['/banking'] },
      {
        label: 'Payments',
        route: '/payments',
        icon: 'swap-horizontal-outline',
        activeIcon: 'swap-horizontal',
        match: ['/payments'],
      },
      { label: 'Parties', route: '/parties', icon: 'people-outline', activeIcon: 'people', match: ['/parties'] },
      { label: 'Expenses', route: '/expense', icon: 'receipt-outline', activeIcon: 'receipt', match: ['/expense'] },
      {
        label: 'Other Income',
        route: '/other-income',
        icon: 'cash-outline',
        activeIcon: 'cash',
        match: ['/other-income'],
      },
    ],
  },
  {
    title: 'Books',
    items: [
      { label: 'Balance Sheet', route: '/balance-sheet', icon: 'scale-outline', activeIcon: 'scale', match: ['/balance-sheet'] },
      { label: 'Reports', route: '/reports', icon: 'bar-chart-outline', activeIcon: 'bar-chart', match: ['/reports'] },
      { label: 'Growth', route: '/growth', icon: 'analytics-outline', activeIcon: 'analytics', match: ['/growth'] },
    ],
  },
  {
    title: 'Capital',
    items: [
      {
        label: 'Investments',
        route: '/investments',
        icon: 'trending-up-outline',
        activeIcon: 'trending-up',
        match: ['/investments'],
      },
      {
        label: 'Fixed Assets',
        route: '/others',
        icon: 'layers-outline',
        activeIcon: 'layers',
        match: ['/others'],
      },
      {
        label: 'Loans',
        route: '/loans',
        icon: 'card-outline',
        activeIcon: 'card',
        match: ['/loans'],
      },
    ],
  },
  {
    title: 'App',
    items: [
      { label: 'Settings', route: '/settings', icon: 'settings-outline', activeIcon: 'settings', match: ['/settings'] },
    ],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  return item.match.some((m) => {
    if (m === '/' || m === '/index') {
      return pathname === '/' || pathname === '/index' || pathname === '';
    }
    return pathname === m || pathname.startsWith(`${m}/`);
  });
}

export function CustomDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const navigate = (route: string) => {
    router.navigate(route as never);
    props.navigation.closeDrawer();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.brand}>
        <Image source={require('../../assets/logo.png')} style={styles.logoImage} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.appName} numberOfLines={1}>
            Hisab
          </Text>
        </View>
      </View>

      <DrawerContentScrollView
        {...props}
        // Force theme fill — RN drawer defaults can flash white behind nav rows.
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {NAV_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <ThemedPressable
                  key={item.route}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => navigate(item.route)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.label}
                  hitSlop={4}
                >
                  <Ionicons
                    name={active ? item.activeIcon : item.icon}
                    size={18}
                    color={active ? colors.navActiveText : colors.textSecondary}
                    style={styles.navIcon}
                  />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </ThemedPressable>
              );
            })}
          </View>
        ))}
      </DrawerContentScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Text style={styles.footerText}>v{APP_VERSION}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.drawer,
    },
    scrollView: {
      flex: 1,
      backgroundColor: colors.drawer,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
      gap: spacing.sm,
      backgroundColor: colors.drawer,
    },
    logoImage: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: '#000000',
    },
    appName: {
      ...typography.title,
      fontWeight: '700',
      color: colors.text,
    },
    scroll: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      backgroundColor: colors.drawer,
      flexGrow: 1,
    },
    section: {
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      ...typography.section,
      color: colors.textMuted,
      textTransform: 'uppercase',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: spacing.sm,
      marginVertical: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      minHeight: 44,
      borderRadius: radius.md,
      gap: spacing.sm,
    },
    navItemActive: {
      backgroundColor: colors.navActive,
    },
    navIcon: {
      width: 22,
    },
    navLabel: {
      ...typography.body,
      color: colors.text,
      flex: 1,
      minWidth: 0,
    },
    navLabelActive: {
      color: colors.navActiveText,
      fontWeight: '600',
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderLight,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.drawer,
    },
    footerText: {
      ...typography.caption,
      color: colors.textMuted,
    },
  });
}
