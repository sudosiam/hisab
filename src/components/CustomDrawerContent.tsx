import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface NavItem {
  label: string;
  route: string;
  icon: IconName;
  match: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', route: '/', icon: 'grid-outline', match: ['/', '/index'] }],
  },
  {
    title: 'Business',
    items: [
      { label: 'Sales', route: '/sales', icon: 'cart-outline', match: ['/sales'] },
      { label: 'Purchases', route: '/purchases', icon: 'bag-handle-outline', match: ['/purchases'] },
      { label: 'Inventory', route: '/inventory', icon: 'cube-outline', match: ['/inventory'] },
      { label: 'Parties', route: '/parties', icon: 'people-outline', match: ['/parties'] },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Banking', route: '/banking', icon: 'wallet-outline', match: ['/banking'] },
      { label: 'Expenses', route: '/expense', icon: 'receipt-outline', match: ['/expense'] },
      { label: 'Others', route: '/others', icon: 'layers-outline', match: ['/others'] },
      { label: 'Balance Sheet', route: '/balance-sheet', icon: 'scale-outline', match: ['/balance-sheet'] },
    ],
  },
  {
    title: 'Reports',
    items: [{ label: 'All Reports', route: '/reports', icon: 'bar-chart-outline', match: ['/reports'] }],
  },
  {
    title: 'Settings',
    items: [{ label: 'Settings', route: '/settings', icon: 'settings-outline', match: ['/settings'] }],
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
        <View style={{ flex: 1 }}>
          <Text style={styles.appName}>Hisab</Text>
          <Text style={styles.appTagline}>Business Books</Text>
        </View>
      </View>

      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {NAV_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => navigate(item.route)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                    <Ionicons
                      name={item.icon}
                      size={17}
                      color={active ? colors.navActiveText : colors.textSecondary}
                    />
                  </View>
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </DrawerContentScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Text style={styles.footerText}>Hisab · Business Management</Text>
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
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      gap: spacing.sm,
    },
    logoImage: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
    },
    appName: {
      ...typography.title,
      color: colors.text,
    },
    appTagline: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    scroll: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    section: {
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      ...typography.section,
      color: colors.textMuted,
      textTransform: 'uppercase',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: spacing.sm,
      marginVertical: 2,
      paddingVertical: 8,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
    },
    navItemActive: {
      backgroundColor: colors.navActive,
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    iconWrapActive: {
      backgroundColor: colors.surface,
    },
    navLabel: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
    },
    navLabelActive: {
      color: colors.navActiveText,
      fontWeight: '700',
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      paddingTop: spacing.md,
      paddingHorizontal: spacing.md,
    },
    footerText: {
      fontSize: 11,
      color: colors.textMuted,
      letterSpacing: 0.2,
    },
  });
}
