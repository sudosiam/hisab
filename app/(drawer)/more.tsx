import React, { useMemo } from 'react';
import { Text, TouchableOpacity, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenTitle, useScreenStyles } from '../../src/components/ui';
import { useTheme } from '../../src/context/ThemeContext';
import { spacing, radius } from '../../src/constants/theme';
import { cardSurface } from '../../src/constants/shadows';

const MORE_ITEMS = [
  {
    title: 'Investments',
    route: '/(drawer)/investments',
    desc: 'Money you invested in the business',
    icon: 'cash-outline' as const,
  },
  {
    title: 'Fixed Assets',
    route: '/(drawer)/others',
    desc: 'Track property, equipment, and other assets',
    icon: 'layers-outline' as const,
  },
  {
    title: 'Loans',
    route: '/(drawer)/loans',
    desc: 'Track borrowed money and outstanding balance',
    icon: 'card-outline' as const,
  },
];

export default function MoreScreen() {
  const router = useRouter();
  const styles = useScreenStyles();
  const { colors, isDark } = useTheme();
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          ...cardSurface(colors, isDark),
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          minHeight: 56,
          marginBottom: spacing.sm,
          gap: spacing.sm,
        },
        iconWrap: {
          width: 36,
          height: 36,
          borderRadius: radius.full,
          backgroundColor: colors.primaryContainer,
          alignItems: 'center',
          justifyContent: 'center',
        },
        cardBody: { flex: 1, minWidth: 0 },
        cardTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
        cardSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1, lineHeight: 16 },
      }),
    [colors, isDark]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenTitle
        title="More"
        subtitle="Manage long-term money, assets, and liabilities outside day-to-day sales."
      />
      {MORE_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={localStyles.card}
          onPress={() => router.push(item.route as never)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={item.title}
        >
          <View style={localStyles.iconWrap}>
            <Ionicons name={item.icon} size={18} color={colors.onPrimaryContainer} />
          </View>
          <View style={localStyles.cardBody}>
            <Text style={localStyles.cardTitle}>{item.title}</Text>
            <Text style={localStyles.cardSub}>{item.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
