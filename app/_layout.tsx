import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";

// export const unstable_settings = {
//   anchor: "(tabs)",
// };

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  const [isLoggedIn, setIsLoggedIn] = useState(false); // You'll need to implement proper auth state management

  // useEffect(() => {
  //   if (!navigationState?.key) return;

  //   const isInAuthGroup = segments[0] === "screens";

  //   if (!isLoggedIn && !isInAuthGroup) {
  //     // Redirect to the login screen if not logged in
  //     router.replace("/screens/LoginScreen");
  //   } else if (isLoggedIn && isInAuthGroup) {
  //     // Redirect to the main app if logged in
  //     router.replace("/(tabs)");
  //   }
  // }, [isLoggedIn, segments, navigationState?.key]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="screens/LoginScreen"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
