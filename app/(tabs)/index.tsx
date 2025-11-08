import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, View, RefreshControl } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation() as any;
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const [availableTables, setAvailableTables] = useState<number[]>([]);
  const [occupiedTables, setOccupiedTables] = useState<Set<number>>(new Set());
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [isLoadingIp, setIsLoadingIp] = useState(true);

  useEffect(() => {
    const loadApiUrl = async () => {
      try {
        const savedIp = await AsyncStorage.getItem('server_ip');
        if (savedIp) {
          setApiUrl(savedIp);
        }
      } catch (err) {
        console.error('Failed to load server IP:', err);
      } finally {
        setIsLoadingIp(false);
      }
    };
    loadApiUrl();
  }, []);

  const fetchAvailableTables = useCallback(async () => {
    // Wait for IP to finish loading before checking
    if (isLoadingIp) {
      return;
    }
    if (!apiUrl) {
      Alert.alert('Error', 'Server IP not configured. Please login first.');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      
      // Fetch total table count
      const tablesResponse = await axios.get(`${apiUrl}/api/tables/currentCount`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (tablesResponse.status === 200 && tablesResponse.data.count >= 1) {
        // Generate an array from 1 to the count received
        const allTables = Array.from({ length: tablesResponse.data.count }, (_, i) => i + 1);

        // Show ALL tables so waiters can manage existing orders
        // Check each table to mark which ones have active orders (for visual indication)
        setAvailableTables(allTables);
        // Stop showing the loader immediately after count is known
        setLoading(false);

        // Check each table individually to see which ones are occupied (for visual indication only)
        // Using getTableStatus endpoint which checks for active orders per table
        try {
          const occupiedStatuses = ['pending', 'preparing', 'ready'];
          const occupiedTableNumbers: number[] = [];

          // Check each table to see if it has an active order
          const tableChecks = allTables.map(async (tableNum) => {
            try {
              const tableResponse = await axios.post(
                `${apiUrl}/api/bill/getTableStatus`,
                { tableNumber: tableNum },
                {
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                }
              );

              // If status is 'success', table has an active order
              // Check if the order status is in occupied statuses
              if (tableResponse.data.status === 'success' && tableResponse.data.data) {
                const billStatus = tableResponse.data.data.status;
                if (occupiedStatuses.includes(billStatus)) {
                  occupiedTableNumbers.push(tableNum);
                }
              }
              // If status is 'table-free', table is available (don't add to occupiedTableNumbers)
              // If status is 'success' but bill status is 'completed', 'bill-printed', or 'cancelled', table is available
            } catch (tableErr: any) {
              // If there's an error checking a table, assume it's available
              // This ensures tables are shown even if API check fails
            }
          });

          // Kick off in background; do not block initial render
          Promise.all(tableChecks)
            .then(() => {
              const occupiedSet = new Set(occupiedTableNumbers);
              setOccupiedTables(occupiedSet);
            })
            .catch((billsErr: any) => {
              console.error('Error checking table statuses:', billsErr);
              setOccupiedTables(new Set());
            });
        } catch (billsErr: any) {
          // If there's a general error, just show all tables
          console.error('Error checking table statuses:', billsErr);
          setOccupiedTables(new Set());
        }
      } else {
        setAvailableTables([]);
        setOccupiedTables(new Set());
        Alert.alert('No Tables', 'No available tables found.');
      }
    } catch (err: any) {
      console.error('Error fetching available tables:', err);
      Alert.alert(
        'Failed to fetch available tables',
        err.response?.data?.message || err.message || 'Please check your connection and try again.'
      );
      setAvailableTables([]);
      setOccupiedTables(new Set());
      } finally {
        setLoading(false);
      }
    }, [apiUrl, isLoadingIp]);

  useEffect(() => {
    // Only fetch tables after IP loading is complete
    if (!isLoadingIp && apiUrl) {
      fetchAvailableTables();
    }
  }, [apiUrl, isLoadingIp, fetchAvailableTables]);

  // Refresh table availability when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!isLoadingIp && apiUrl) {
        fetchAvailableTables();
      }
    }, [apiUrl, isLoadingIp, fetchAvailableTables])
  );

  const handleTableSelect = (tableNumber: number) => {
    setSelectedTable(tableNumber);
    router.push({
      pathname: '/(tabs)/order',
      params: { tableNumber: tableNumber.toString() },
    } as any);
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      {/* <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.headerLeftSpacer} />
        <ThemedText type="title" style={styles.headerTitle}>Tables</ThemedText>
        <TouchableOpacity onPress={() => navigation?.dispatch?.(DrawerActions.openDrawer())} style={styles.menuButton}>
          <ThemedText style={[styles.menuIcon, { color: Colors[colorScheme ?? 'light'].tint }]}>≡</ThemedText>
        </TouchableOpacity>
      </View> */}
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchAvailableTables();
              setRefreshing(false);
            }}
            tintColor="#007AFF"
          />
        }
      >
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
            <ThemedText style={styles.emptySubtext}>
              All tables are currently occupied
            </ThemedText>
            <TouchableOpacity style={styles.refreshButton} onPress={fetchAvailableTables}>
              <ThemedText style={styles.refreshButtonText}>Refresh</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ThemedView style={styles.tablesContainer}>
            <ThemedView style={styles.tableGrid}>
              {availableTables.map((tableNumber) => {
                const isOccupied = occupiedTables.has(tableNumber);
                return (
                  <TouchableOpacity
                    key={tableNumber}
                    style={[
                      styles.tableButton,
                      isOccupied && styles.tableButtonOccupied,
                      selectedTable === tableNumber && styles.tableButtonSelected,
                    ]}
                    onPress={() => handleTableSelect(tableNumber)}
                    activeOpacity={0.7}
                  >
                    <ThemedText
                      style={[
                        styles.tableButtonText,
                        isOccupied && styles.tableButtonTextOccupied,
                        selectedTable === tableNumber && styles.tableButtonTextSelected,
                      ]}
                    >
                      {tableNumber}
                    </ThemedText>
                    {isOccupied && (
                      <ThemedText style={styles.occupiedIndicator}>●</ThemedText>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ThemedView>

            
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerLeftSpacer: {
    width: 60,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  menuButton: {
    padding: 8,
    width: 60,
    alignItems: 'flex-end',
  },
  menuIcon: {
    fontSize: 22,
    fontWeight: '900',
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
    fontSize: 18,
    opacity: 0.9,
    marginBottom: 8,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 20,
    textAlign: 'center',
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
    position: 'relative',
  },
  tableButtonOccupied: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFC107',
    borderWidth: 2,
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
  tableButtonTextOccupied: {
    color: '#856404',
  },
  tableButtonTextSelected: {
    color: '#FFFFFF',
  },
  occupiedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 12,
    color: '#FFC107',
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
