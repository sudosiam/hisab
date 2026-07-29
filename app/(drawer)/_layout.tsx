import { StyleSheet } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { CustomDrawerContent } from '../../src/components/CustomDrawerContent';
import { useTheme } from '../../src/context/ThemeContext';
import { useDrawerScreenOptions } from '../../src/navigation/screenOptions';

const hidden = { drawerItemStyle: { display: 'none' as const } };
const stackGroup = { ...hidden, headerShown: false as const };

export default function DrawerLayout() {
  const { colors } = useTheme();
  const drawerScreenOptions = useDrawerScreenOptions();

  return (
    <Drawer
      backBehavior="history"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={(props) => ({
        ...drawerScreenOptions(props),
        headerShown: true,
        lazy: true,
        freezeOnBlur: true,
        drawerType: 'front',
        swipeEnabled: true,
        // Always a dark translucent scrim — white overlays look washed/broken in dark mode.
        overlayColor: colors.scrim,
        drawerStyle: {
          width: 280,
          backgroundColor: colors.drawer,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: colors.border,
        },
        sceneStyle: { backgroundColor: colors.background },
        swipeEdgeWidth: 48,
      })}
    >
      <Drawer.Screen name="index" options={{ title: 'Dashboard', ...hidden }} />
      <Drawer.Screen name="growth" options={{ title: 'Growth', ...hidden }} />
      <Drawer.Screen name="sales" options={{ title: 'Sales', ...stackGroup }} />
      <Drawer.Screen name="purchases" options={{ title: 'Purchases', ...stackGroup }} />
      <Drawer.Screen name="inventory" options={{ title: 'Inventory', ...stackGroup }} />
      <Drawer.Screen name="parties" options={{ title: 'Parties', ...stackGroup }} />
      <Drawer.Screen name="banking" options={{ title: 'Banking', ...stackGroup }} />
      <Drawer.Screen name="payments" options={{ title: 'Payments', ...stackGroup }} />
      <Drawer.Screen name="notes" options={{ title: 'Adjustments', ...stackGroup }} />
      <Drawer.Screen name="expense" options={{ title: 'Expenses', ...stackGroup }} />
      <Drawer.Screen name="others" options={{ title: 'Fixed Assets', ...hidden }} />
      <Drawer.Screen name="balance-sheet" options={{ title: 'Balance Sheet', ...hidden }} />
      <Drawer.Screen name="reports" options={{ title: 'Reports', ...stackGroup }} />
      <Drawer.Screen name="more" options={{ title: 'Capital', ...hidden }} />
      <Drawer.Screen name="other-income" options={{ title: 'Other Income', ...stackGroup }} />
      <Drawer.Screen name="investments" options={{ title: 'Investments', ...hidden }} />
      <Drawer.Screen name="loans" options={{ title: 'Loans', ...hidden }} />
      <Drawer.Screen name="settings" options={{ title: 'Settings', ...stackGroup }} />
    </Drawer>
  );
}
