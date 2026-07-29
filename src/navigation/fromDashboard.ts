import { CommonActions, type NavigationProp, type ParamListBase } from '@react-navigation/native';

/** Param so stack/drawer headers pop back to Dashboard instead of section lists. */
export const POP_TO_DRAWER_PARAM = { popToDrawer: '1' as const };

export type DashboardNavTarget =
  | { drawer: string; screen: string; params?: Record<string, string> }
  | { drawer: string; params?: Record<string, string> };

/**
 * Open a screen from Dashboard so Back returns Home.
 * Resets nested stacks to a single screen with `popToDrawer` (expo-router href params
 * often land on the wrong route and Back falls through to Reports/Sales lists).
 */
export function navigateFromDashboard(
  navigation: NavigationProp<ParamListBase>,
  target: DashboardNavTarget
): void {
  const screenParams = { ...POP_TO_DRAWER_PARAM, ...target.params };

  if ('screen' in target && target.screen) {
    navigation.dispatch(
      CommonActions.navigate({
        name: target.drawer,
        params: {
          state: {
            routes: [{ name: target.screen, params: screenParams }],
            index: 0,
          },
        },
      })
    );
    return;
  }

  navigation.dispatch(
    CommonActions.navigate({
      name: target.drawer,
      params: screenParams,
    })
  );
}

/** @deprecated Prefer navigateFromDashboard — href params are unreliable for popToDrawer. */
export function hrefFromDashboard(target: string | { pathname: string; params?: Record<string, string | undefined> }): {
  pathname: string;
  params: Record<string, string>;
} {
  if (typeof target === 'string') {
    return { pathname: target, params: { ...POP_TO_DRAWER_PARAM } };
  }
  const params: Record<string, string> = { ...POP_TO_DRAWER_PARAM };
  if (target.params) {
    for (const [key, value] of Object.entries(target.params)) {
      if (value != null) params[key] = value;
    }
  }
  return { pathname: target.pathname, params };
}
