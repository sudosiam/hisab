import React, { useCallback } from 'react';
import { Platform, Pressable } from 'react-native';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { HeaderBackButton } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';

export function useHeaderScreenOptions() {
  const { colors } = useTheme();
  return {
    headerStyle: {
      backgroundColor: colors.header,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTintColor: colors.headerText,
    headerTitleStyle: {
      fontWeight: '700' as const,
      fontSize: 17,
      color: colors.headerText,
      letterSpacing: -0.2,
    },
    headerTitleAlign: 'left' as const,
    headerLeftContainerStyle: { paddingLeft: 4 },
    headerBackTitleVisible: false,
    headerShadowVisible: false,
  } as const;
}

function isStackListRoute(navigation: NativeStackNavigationProp<ParamListBase>): boolean {
  const state = navigation.getState();
  const route = state.routes[state.index ?? 0];
  return route?.name === 'index';
}

function DrawerMenuButton({ tintColor }: { tintColor: string }) {
  const navigation = useNavigation();
  const openDrawer = useCallback(() => {
    navigation.dispatch(DrawerActions.toggleDrawer());
  }, [navigation]);

  return (
    <Pressable
      onPress={openDrawer}
      style={{ marginLeft: Platform.OS === 'ios' ? 0 : 4, padding: 8 }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open menu"
    >
      <Ionicons name="menu" size={24} color={tintColor} />
    </Pressable>
  );
}

/** Stack screens inside the drawer: menu on list, back arrow on pushed screens. */
export function useStackScreenOptions() {
  const { colors } = useTheme();
  const base = useHeaderScreenOptions();

  return ({
    navigation,
  }: {
    navigation: NativeStackNavigationProp<ParamListBase>;
  }) => ({
    ...base,
    headerLeft: (props: React.ComponentProps<typeof HeaderBackButton>) => {
      if (isStackListRoute(navigation)) {
        return <DrawerMenuButton tintColor={colors.headerText} />;
      }
      return (
        <HeaderBackButton
          {...props}
          tintColor={colors.headerText}
          onPress={() => navigation.goBack()}
        />
      );
    },
  });
}

/** Top-level drawer screens (Dashboard, Settings, etc.). */
export function useDrawerScreenOptions() {
  const { colors } = useTheme();
  const base = useHeaderScreenOptions();

  return {
    ...base,
    headerLeft: () => <DrawerMenuButton tintColor={colors.headerText} />,
  };
}
