import React from 'react';
import { DrawerToggleButton } from '@react-navigation/drawer';
import { HeaderBackButton } from '@react-navigation/elements';
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
    headerShadowVisible: false,
  } as const;
}

/** Stack screens inside the drawer: menu on root, back arrow on pushed screens. */
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
      const isStackRoot = navigation.getState().index === 0;
      if (isStackRoot) {
        return <DrawerToggleButton tintColor={colors.headerText} />;
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
    headerLeft: () => <DrawerToggleButton tintColor={colors.headerText} />,
  };
}
