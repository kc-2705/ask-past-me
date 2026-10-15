import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/state/AppState';

export default function TabLayout() {
  const t = useTheme();
  // Room for the phone's own navigation bar (gesture bar or the 3 buttons), so it never covers the tabs.
  const insets = useSafeAreaInsets();
  const icon = (name: keyof typeof Ionicons.glyphMap, active: keyof typeof Ionicons.glyphMap) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Ionicons name={focused ? active : name} size={23} color={color as string} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.muted,
        tabBarStyle: {
          backgroundColor: t.dark ? t.colors.surface : t.colors.surface,
          borderTopColor: t.colors.line,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
          ...(t.tilt ? { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 0 } : null),
        },
        tabBarLabelStyle: { fontFamily: t.fonts.bold, fontSize: 11 },
        sceneStyle: { backgroundColor: t.colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Talk', tabBarIcon: icon('mic-outline', 'mic') }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask', tabBarIcon: icon('chatbubble-ellipses-outline', 'chatbubble-ellipses') }} />
      <Tabs.Screen name="timeline" options={{ title: 'Timeline', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
