import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { DrawerToggleButton } from '@react-navigation/drawer';
import { HeaderBackButton } from '@react-navigation/elements';
import { DrawerActions, useNavigation } from '@react-navigation/native'; // ✅ add this
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
    const navigation = useNavigation(); 

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: true,
        tabBarButton: HapticTab,
      }}>
        
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tables',
          headerLeft: () => null,
          headerRight: () => (
           <DrawerToggleButton tintColor={Colors[colorScheme ?? 'light'].tint} />
          ),
          tabBarIcon: () => null, // Hide icon
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
     
      <Tabs.Screen
        name="order"
        options={{
          href: null, // Hide from tab bar
          title: 'Order',
          headerLeft: () => (
            <HeaderBackButton onPress={() => router.back()} tintColor={Colors[colorScheme ?? 'light'].tint} />
          ),
          headerRight: () => <DrawerToggleButton tintColor={Colors[colorScheme ?? 'light'].tint} />,
          tabBarStyle: { display: 'none' }, // Hide tab bar on this screen
        }}
      />
    </Tabs>
  );
}
