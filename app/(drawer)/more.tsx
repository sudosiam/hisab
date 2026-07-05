import React, { useMemo } from 'react';
import { Text, TouchableOpacity, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useScreenStyles } from '../../src/components/ui';
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
          padding: spacing.md,
          marginBottom: spacing.sm,
          gap: spacing.md,
        },
        iconWrap: {
          width: 40,
          height: 40,
          borderRadius: radius.md,
          backgroundColor: colors.navActive,
          alignItems: 'center',
          justifyContent: 'center',
        },
        cardBody: { flex: 1 },
        cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
        cardSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, isDark]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {MORE_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={localStyles.card}
          onPress={() => router.push(item.route as never)}
          activeOpacity={0.75}
        >
          <View style={localStyles.iconWrap}>
            <Ionicons name={item.icon} size={20} color={colors.primary} />
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
