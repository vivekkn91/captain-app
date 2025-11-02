import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: () => null, // Hide icon
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: () => null, // Hide icon
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="order"
        options={{
          href: null, // Hide from tab bar
          headerShown: false, // Hide header
          tabBarStyle: { display: 'none' }, // Hide tab bar on this screen
        }}
      />
    </Tabs>
  );
}
