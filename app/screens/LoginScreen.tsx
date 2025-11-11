import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { useThemeColor } from "../../hooks/use-theme-color";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [ipModalVisible, setIpModalVisible] = useState(false);
  const [tempIp, setTempIp] = useState("");
  const [loadingIp, setLoadingIp] = useState(false);

  const router = useRouter();
  const inputBackground = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");

  // ✅ Load saved IP on app start
  useEffect(() => {
    const loadIp = async () => {
      try {
        const savedIp = await AsyncStorage.getItem("server_ip");
        if (savedIp) {
          setIpAddress(savedIp);
        } else {
          setIpModalVisible(true); // show input modal
        }
      } catch (err) {
        console.error("Failed to load saved IP:", err);
        setIpModalVisible(true);
      }
    };
    loadIp();
  }, []);

  // ✅ Check connection with backend /api/health
  const handleSaveIp = async () => {
    if (!tempIp.trim()) {
      Alert.alert("Invalid Input", "Please enter a valid IP address");
      return;
    }

    const formatted = tempIp.trim().replace(/\/+$/, "");
    setLoadingIp(true);

    try {
      const res = await fetch(`${formatted}/api/health` );
      const data = await res.json();

      if (
        res.ok &&
        data.status === "UP" &&
        data.database?.status === "Connected"
      ) {
        await AsyncStorage.setItem("server_ip", formatted);
        setIpAddress(formatted);
        setIpModalVisible(false);
        Alert.alert("Connected", `Connected to backend: ${formatted}`);
      } else {
        Alert.alert(
          "Connection Failed",
          "The server responded but is not ready. Check MongoDB or API."
        );
      }
    } catch (error) {
      console.error("Health check error:", error);
      Alert.alert(
        "Connection Error",
        "Unable to reach the backend server. Check your IP or network."
      );
    } finally {
      setLoadingIp(false);
    }
  };

  const validateForm = () => {
    const newErrors = { email: "", password: "" };
    let isValid = true;

    if (!email) {
      newErrors.email = "Email is required";
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Invalid email format";
      isValid = false;
    }

    if (!password) {
      newErrors.password = "Password is required";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    if (!ipAddress) {
      Alert.alert("Server IP Missing", "Please enter the backend IP first.");
      setIpModalVisible(true);
      return;
    }

    try {
      const response = await fetch(`${ipAddress}/api/user/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      console.log("Response:", data);

     

      if (!response.ok) {
        Alert.alert("Login Failed", data.msg || "Invalid credentials");
        return;
      }
       if (data.user.employeeType !== "staff") {
        Alert.alert("Login Failed", "Only staff account can login");
        return;
      }

      // Save token to AsyncStorage
      if (data.token) {
        await AsyncStorage.setItem("token", data.token);
      }

      Alert.alert("Login Successful", "Welcome back!");
      router.replace("/");
    } catch (err) {
      console.error("Login Error:", err);
      Alert.alert(
        "Connection Error",
        "Unable to connect to the backend. Please check the IP and try again.",
        [{ text: "Change IP", onPress: () => setIpModalVisible(true) }]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ThemedView style={styles.container}>
        {/* ✅ IP Input Modal */}
        <Modal visible={ipModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <ThemedText style={styles.modalTitle}>
                Enter Server IP Address
              </ThemedText>
              <TextInput
                style={styles.modalInput}
                placeholder="http://192.168.1.10:5000"
                placeholderTextColor="#999"
                value={tempIp}
                onChangeText={setTempIp}
                autoCapitalize="none"
              />
              {loadingIp ? (
                <ActivityIndicator size="large" color="#007AFF" />
              ) : (
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={handleSaveIp}
                >
                  <ThemedText style={styles.modalButtonText}>Save</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>

        <View style={styles.headerContainer}>
          <Image
            source={require("../../assets/images/Billingko.jpg")}
            style={styles.logo}
          />
          <ThemedText style={styles.title}>Welcome Back</ThemedText>
          <ThemedText style={styles.subtitle}>
            {ipAddress ? `Connected to ${ipAddress}` : "Enter backend IP to connect"}
          </ThemedText>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: inputBackground, color: textColor },
              ]}
              placeholder="Email"
              placeholderTextColor="#666"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setErrors((prev) => ({ ...prev, email: "" }));
              }}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {errors.email ? (
              <ThemedText style={styles.errorText}>{errors.email}</ThemedText>
            ) : null}
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: inputBackground, color: textColor },
              ]}
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setErrors((prev) => ({ ...prev, password: "" }));
              }}
              secureTextEntry
            />
            {errors.password ? (
              <ThemedText style={styles.errorText}>{errors.password}</ThemedText>
            ) : null}
          </View>

          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <ThemedText style={styles.buttonText}>Sign In</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: "#444", marginTop: 10 }]}
            onPress={() => setIpModalVisible(true)}
          >
            <ThemedText style={styles.buttonText}>Change Backend IP</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#000000ff",
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
    resizeMode: "contain",
    borderRadius: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#aaa",
    marginBottom: 20,
    textAlign: "center",
  },
  formContainer: {
    width: "100%",
    alignItems: "center",
  },
  inputContainer: {
    width: "100%",
    marginBottom: 15,
  },
  input: {
    width: "100%",
    height: 50,
    paddingHorizontal: 15,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 12,
    marginTop: 5,
    marginLeft: 5,
  },
  button: {
    width: "100%",
    height: 50,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  // ✅ Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalContainer: {
    backgroundColor: "#fff",
    width: "85%",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    color: "#000",
  },
  modalInput: {
    width: "100%",
    height: 45,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 15,
    color: "#000",
  },
  modalButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
