import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
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
import { CalculatorHeaderButton } from '../components/QuickCalculator';

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

/** Set by dashboard Recent activity so back returns to the drawer history (Dashboard). */
export function wantsPopToDrawer(params: unknown): boolean {
  if (!params || typeof params !== 'object') return false;
  const value = (params as Record<string, unknown>).popToDrawer;
  return value === true || value === 1 || value === '1';
}

function leaveDetailToDrawer(navigation: StackNavigation): void {
  const parent = navigation.getParent();
  // Prefer drawer history (Dashboard). Fall back to jumping Home if history is empty.
  if (parent?.canGoBack()) {
    parent.goBack();
  } else {
    parent?.navigate('index' as never);
  }
  // Reset after leaving so the next drawer open lands on the section list.
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: LIST_ROUTE }],
    })
  );
}

export function useHeaderScreenOptions() {
  const { colors } = useTheme();
  return {
    headerStyle: {
      backgroundColor: colors.header,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTintColor: colors.headerText,
    headerTitleStyle: {
      fontWeight: '600' as const,
      fontSize: 16,
      color: colors.headerText,
      letterSpacing: -0.2,
    },
    headerTitleAlign: 'left' as const,
    headerLeftContainerStyle: { paddingLeft: 4 },
    headerBackTitleVisible: false,
    headerShadowVisible: false,
    // iOS: system default is the smoothest. Android: directional slide.
    animation: (Platform.OS === 'ios' ? 'default' : 'slide_from_right') as
      | 'default'
      | 'slide_from_right',
    animationDuration: 350,
    animationMatchesGesture: true,
    gestureEnabled: true,
    fullScreenGestureEnabled: true,
    freezeOnBlur: true,
    contentStyle: { backgroundColor: colors.background },
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
  const state = readNavState(navigation);
  const stackIndex = state?.index ?? 0;
  const currentParams = route?.params ?? state?.routes?.[stackIndex]?.params;
  // Opened from Dashboard — show back so we return to Home, not the section hamburger.
  if (wantsPopToDrawer(currentParams)) return false;

  const name = activeRouteName(navigation, route);
  if (name === LIST_ROUTE) return true;

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
  const state = readNavState(navigation);
  const stackIndex = state?.index ?? 0;
  const currentParams = route?.params ?? state?.routes?.[stackIndex]?.params;
  if (wantsPopToDrawer(currentParams)) {
    leaveDetailToDrawer(navigation);
    return;
  }

  const name = activeRouteName(navigation, route);
  if (name === LIST_ROUTE) return;

  const previousRouteName = stackIndex > 0 ? state?.routes?.[stackIndex - 1]?.name : undefined;

  // Leaving a form (new/edit) should land on the section list, not the blank form.
  // Also skip form screens when popping detail (gesture or header) — avoids
  // Dashboard → Sale details → back landing on New Sale.
  if (previousRouteName && FORM_ROUTES.has(previousRouteName)) {
    resetStackToList(navigation);
    return;
  }

  // Prefer real history: pop this stack, or the parent drawer (with backBehavior="history").
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }

  const parent = navigation.getParent();
  if (parent?.canGoBack()) {
    parent.goBack();
    return;
  }

  // Fallback when nothing is left in history (cold open of a detail URL).
  resetStackToList(navigation);
}

/**
 * Attach to detail screens so swipe-back also skips stale new/edit routes
 * (native gestures bypass headerLeft onPress).
 */
export function stackDetailBeforeRemove(
  navigation: StackNavigation,
  e: { preventDefault: () => void; data: { action: { type: string } } }
): void {
  if (e.data.action.type !== 'GO_BACK' && e.data.action.type !== 'POP') return;
  const state = readNavState(navigation);
  const stackIndex = state?.index ?? 0;
  const currentParams = state?.routes?.[stackIndex]?.params;
  if (wantsPopToDrawer(currentParams)) {
    e.preventDefault();
    leaveDetailToDrawer(navigation);
    return;
  }
  const previousRouteName = stackIndex > 0 ? state?.routes?.[stackIndex - 1]?.name : undefined;
  if (previousRouteName && FORM_ROUTES.has(previousRouteName)) {
    e.preventDefault();
    resetStackToList(navigation);
  }
}

/** Wire on every drawer stack so Dashboard → screen → back returns Home (gestures / hardware). */
export function stackScreenListeners({ navigation }: { navigation: StackNavigation }) {
  return {
    beforeRemove: (e: { preventDefault: () => void; data: { action: { type: string } } }) => {
      stackDetailBeforeRemove(navigation, e);
    },
  };
}

function DrawerMenuButton({ tintColor }: { tintColor: string }) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const openDrawer = useCallback(() => {
    void import('../utils/haptics').then((m) => m.hapticLight());
    openDrawerFromNavigation(navigation);
  }, [navigation]);

  return (
    <Pressable
      onPress={openDrawer}
      style={({ pressed }) => [
        { marginLeft: Platform.OS === 'ios' ? 0 : 4, padding: 8 },
        pressed ? { opacity: 0.75 } : null,
      ]}
      hitSlop={8}
      android_ripple={{ borderless: true, radius: 20 }}
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
  }) => {
    const routeName = props.route?.name ?? activeRouteName(props.navigation, props.route);
    const isForm = FORM_ROUTES.has(routeName);

    return {
      ...base,
      // Forms rise from the bottom; detail/list keep the platform slide.
      animation: (isForm
        ? 'slide_from_bottom'
        : Platform.OS === 'ios'
          ? 'default'
          : 'slide_from_right') as 'slide_from_bottom' | 'default' | 'slide_from_right',
      animationDuration: isForm ? 320 : 350,
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
      headerRight: () => <CalculatorHeaderButton tintColor={colors.headerText} />,
    };
  };
}

/** Top-level drawer screens (Dashboard, Settings, Balance Sheet, etc.). */
export function useDrawerScreenOptions() {
  const { colors } = useTheme();
  const base = useHeaderScreenOptions();

  return (props: {
    navigation: NavigationProp<ParamListBase>;
    route?: RouteProp<ParamListBase>;
  }) => {
    const showBack = wantsPopToDrawer(props.route?.params) && props.navigation.canGoBack();
    return {
      ...base,
      headerLeft: showBack
        ? (backProps: React.ComponentProps<typeof HeaderBackButton>) => (
            <HeaderBackButton
              {...backProps}
              tintColor={colors.headerText}
              onPress={() => props.navigation.goBack()}
            />
          )
        : () => <DrawerMenuButton tintColor={colors.headerText} />,
      headerRight: () => <CalculatorHeaderButton tintColor={colors.headerText} />,
    };
  };
}
