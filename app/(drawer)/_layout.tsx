import { Drawer } from 'expo-router/drawer';
import { CustomDrawerContent } from '../../src/components/CustomDrawerContent';
import { useTheme } from '../../src/context/ThemeContext';
import { useDrawerScreenOptions } from '../../src/navigation/screenOptions';

const hidden = { drawerItemStyle: { display: 'none' as const } };
const stackGroup = { ...hidden, headerShown: false as const };

export default function DrawerLayout() {
  const { colors, isDark } = useTheme();
  const drawerOptions = useDrawerScreenOptions();

  return (
    <Drawer
      backBehavior="history"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        ...drawerOptions,
        headerShown: true,
        lazy: true,
        freezeOnBlur: true,
        drawerType: 'front',
        swipeEnabled: true,
        overlayColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.35)',
        drawerStyle: {
          width: 254,
          backgroundColor: colors.drawer,
        },
        sceneStyle: { backgroundColor: colors.background },
        swipeEdgeWidth: 48,
      }}
    >
      <Drawer.Screen name="index" options={{ title: 'Dashboard', ...hidden }} />
      <Drawer.Screen name="growth" options={{ title: 'Growth', ...hidden }} />
      <Drawer.Screen name="sales" options={{ title: 'Sales', ...stackGroup }} />
      <Drawer.Screen name="purchases" options={{ title: 'Purchases', ...stackGroup }} />
      <Drawer.Screen name="inventory" options={{ title: 'Inventory', ...stackGroup }} />
      <Drawer.Screen name="parties" options={{ title: 'Parties', ...stackGroup }} />
      <Drawer.Screen name="banking" options={{ title: 'Banking', ...stackGroup }} />
      <Drawer.Screen name="payments" options={{ title: 'Payments', ...stackGroup }} />
      <Drawer.Screen name="expense" options={{ title: 'Expenses', ...stackGroup }} />
      <Drawer.Screen name="others" options={{ title: 'Fixed Assets', ...hidden }} />
      <Drawer.Screen name="balance-sheet" options={{ title: 'Balance Sheet', ...hidden }} />
      <Drawer.Screen name="reports" options={{ title: 'Reports', ...stackGroup }} />
      <Drawer.Screen name="more" options={{ title: 'More', ...hidden }} />
      <Drawer.Screen name="other-income" options={{ title: 'Other Income', ...stackGroup }} />
      <Drawer.Screen name="investments" options={{ title: 'Investments', ...hidden }} />
      <Drawer.Screen name="loans" options={{ title: 'Loans', ...hidden }} />
      <Drawer.Screen name="settings" options={{ title: 'Settings', ...stackGroup }} />
    </Drawer>
  );
}
