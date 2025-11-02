import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, View } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  const router = useRouter();
  const [availableTables, setAvailableTables] = useState<number[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadApiUrl = async () => {
      try {
        const savedIp = await AsyncStorage.getItem('server_ip');
        if (savedIp) {
          setApiUrl(savedIp);
        }
      } catch (err) {
        console.error('Failed to load server IP:', err);
      }
    };
    loadApiUrl();
  }, []);

  useEffect(() => {
    if (apiUrl) {
      fetchAvailableTables();
    }
  }, [apiUrl]);

  const fetchAvailableTables = async () => {
    if (!apiUrl) {
      Alert.alert('Error', 'Server IP not configured. Please login first.');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${apiUrl}/api/tables/currentCount`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 200 && response.data.count >= 1) {
        // Generate an array from 1 to the count received
        const tables = Array.from({ length: response.data.count }, (_, i) => i + 1);
        setAvailableTables(tables);
      } else {
        setAvailableTables([]);
        Alert.alert('No Tables', 'No available tables found.');
      }
    } catch (err: any) {
      console.error('Error fetching available tables:', err);
      Alert.alert(
        'Failed to fetch available tables',
        err.response?.data?.message || err.message || 'Please check your connection and try again.'
      );
      setAvailableTables([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTableSelect = (tableNumber: number) => {
    setSelectedTable(tableNumber);
    router.push({
      pathname: '/(tabs)/order',
      params: { tableNumber: tableNumber.toString() },
    } as any);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.headerContainer}>
          <ThemedText type="title" style={styles.title}>
            Select a Table
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Choose a table to start taking orders
          </ThemedText>
        </ThemedView>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <ThemedText style={styles.loadingText}>Loading tables...</ThemedText>
          </View>
        ) : availableTables.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>No tables available</ThemedText>
            <TouchableOpacity style={styles.refreshButton} onPress={fetchAvailableTables}>
              <ThemedText style={styles.refreshButtonText}>Refresh</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ThemedView style={styles.tablesContainer}>
            <ThemedView style={styles.tableGrid}>
              {availableTables.map((tableNumber) => (
                <TouchableOpacity
                  key={tableNumber}
                  style={[
                    styles.tableButton,
                    selectedTable === tableNumber && styles.tableButtonSelected,
                  ]}
                  onPress={() => handleTableSelect(tableNumber)}
                  activeOpacity={0.7}
                >
                  <ThemedText
                    style={[
                      styles.tableButtonText,
                      selectedTable === tableNumber && styles.tableButtonTextSelected,
                    ]}
                  >
                    {tableNumber}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ThemedView>

            {selectedTable && (
              <ThemedView style={styles.selectedTableContainer}>
                <ThemedText style={styles.selectedTableText}>
                  Selected Table: {selectedTable}
                </ThemedText>
              </ThemedView>
            )}
          </ThemedView>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 20,
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  tablesContainer: {
    flex: 1,
  },
  tableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tableButton: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tableButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#0051D5',
    borderWidth: 3,
  },
  tableButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  tableButtonTextSelected: {
    color: '#FFFFFF',
  },
  selectedTableContainer: {
    marginTop: 30,
    padding: 16,
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    alignItems: 'center',
  },
  selectedTableText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
