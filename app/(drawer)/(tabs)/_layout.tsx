import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { DrawerToggleButton } from '@react-navigation/drawer';
import { HeaderBackButton } from '@react-navigation/elements';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tables',
          headerLeft: () => null,
          headerRight: () => <DrawerToggleButton tintColor={Colors[colorScheme ?? 'light'].tint} />,
        }}
      />
      <Tabs.Screen
        name="order"
        options={{
          title: 'Order',
          headerLeft: () => (
            <HeaderBackButton onPress={() => router.back()} tintColor={Colors[colorScheme ?? 'light'].tint} />
          ),
          headerRight: () => <DrawerToggleButton tintColor={Colors[colorScheme ?? 'light'].tint} />,
          href: null,
        }}
      />
    </Tabs>
  );
}


