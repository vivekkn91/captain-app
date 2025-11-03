import { Drawer } from "expo-router/drawer";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

export default function DrawerLayout() {
  const colorScheme = useColorScheme();

  return (
    <Drawer
      initialRouteName="(tabs)"
      screenOptions={{
        headerShown: false,
        headerTintColor: Colors[colorScheme ?? "light"].tint,
        // sceneContainerStyle: { backgroundColor: '#000000' },
        drawerStyle: { backgroundColor: '#111111' },
        drawerActiveTintColor: '#ffffff',
        drawerInactiveTintColor: '#bbbbbb',
      }}
    >
      {/* Tabs are nested inside the Drawer */}
      <Drawer.Screen
        name="(tabs)"
        options={{
          title: "Home",
          headerShown: false,
        }}
      />
      <Drawer.Screen
        name="Logout"
        options={{
          title: "Logout",
          headerShown: false,
        }}
      />
    </Drawer>
  );
}


