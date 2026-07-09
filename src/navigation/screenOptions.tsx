import React, { useCallback } from 'react';
import { Platform, Pressable } from 'react-native';
import {
  CommonActions,
  DrawerActions,
  type NavigationProp,
  type ParamListBase,
  type RouteProp,
  useNavigation,
} from '@react-navigation/native';
import { HeaderBackButton } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';

const LIST_ROUTE = 'index';
const FORM_ROUTES = new Set(['new', 'edit', 'add-account', 'transfer', 'cash']);

type StackNavigation = NativeStackNavigationProp<ParamListBase>;

function readNavState(navigation: NavigationProp<ParamListBase>) {
  try {
    return navigation.getState();
  } catch {
    return undefined;
  }
}

function activeRouteName(
  navigation: StackNavigation,
  route?: RouteProp<ParamListBase>
): string {
  if (route?.name) return route.name;
  const state = readNavState(navigation);
  if (!state?.routes?.length) return '';
  const index = state.index ?? 0;
  return state.routes[index]?.name ?? '';
}

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
      fontWeight: '600' as const,
      fontSize: 16,
      color: colors.headerText,
      letterSpacing: -0.1,
    },
    headerTitleAlign: 'left' as const,
    headerLeftContainerStyle: { paddingLeft: 4 },
    headerBackTitleVisible: false,
    headerShadowVisible: false,
  } as const;
}

function openDrawerFromNavigation(navigation: NavigationProp<ParamListBase>): void {
  let current: NavigationProp<ParamListBase> | undefined = navigation;
  while (current) {
    const state = readNavState(current);
    if (state?.type === 'drawer') {
      current.dispatch(DrawerActions.openDrawer());
      return;
    }
    current = current.getParent() ?? undefined;
  }
  navigation.dispatch(DrawerActions.openDrawer());
}

function shouldShowDrawerMenu(
  navigation: StackNavigation,
  route?: RouteProp<ParamListBase>
): boolean {
  const name = activeRouteName(navigation, route);
  if (name === LIST_ROUTE) return true;

  const state = readNavState(navigation);
  if (!state?.routes?.length) return name === LIST_ROUTE || name === '';
  return false;
}

function resetStackToList(navigation: StackNavigation): void {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: LIST_ROUTE }],
    })
  );
}

function handleStackBack(navigation: StackNavigation, route?: RouteProp<ParamListBase>): void {
  const name = activeRouteName(navigation, route);
  if (name === LIST_ROUTE) return;

  const state = readNavState(navigation);
  const stackIndex = state?.index ?? 0;
  const previousRouteName = stackIndex > 0 ? state?.routes?.[stackIndex - 1]?.name : undefined;

  if (previousRouteName && FORM_ROUTES.has(previousRouteName)) {
    resetStackToList(navigation);
    return;
  }

  if (stackIndex > 0 && state?.routes) {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
  }

  resetStackToList(navigation);
}

function DrawerMenuButton({ tintColor }: { tintColor: string }) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const openDrawer = useCallback(() => {
    openDrawerFromNavigation(navigation);
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

  return (props: {
    navigation: StackNavigation;
    route?: RouteProp<ParamListBase>;
  }) => ({
    ...base,
    headerLeft: (backProps: React.ComponentProps<typeof HeaderBackButton>) => {
      const { navigation, route } = props;
      if (shouldShowDrawerMenu(navigation, route)) {
        return <DrawerMenuButton tintColor={colors.headerText} />;
      }
      return (
        <HeaderBackButton
          {...backProps}
          tintColor={colors.headerText}
          onPress={() => handleStackBack(navigation, route)}
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
