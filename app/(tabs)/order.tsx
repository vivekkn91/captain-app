import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  View,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation, DrawerActions, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface Category {
  _id: string;
  name: string;
  status: string;
}

interface Product {
  _id: string;
  name: string;
  category: {
    _id: string;
    name: string;
  };
  status: string;
  Basequantity?: number | string;
  price?: number;
}

interface OrderItem {
  product: Product;
  quantity: number;
}

export default function OrderScreen() {
  const router = useRouter();
  const navigation = useNavigation() as any;
  const params = useLocalSearchParams();
  const tableNumber = params.tableNumber ? parseInt(params.tableNumber as string) : null;
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryDropdownVisible, setCategoryDropdownVisible] = useState(false);
  const [billNumber, setBillNumber] = useState<string | null>(null);
  const [billNumberLoading, setBillNumberLoading] = useState<boolean>(false);
  const [sequenceNumber, setSequenceNumber] = useState<number>(0);
  const [existingBillId, setExistingBillId] = useState<string | null>(null);
  const [loadingLastOrder, setLoadingLastOrder] = useState<boolean>(false);
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

  useEffect(() => {
    if (apiUrl) {
      fetchCategories();
      fetchProducts();
    }
  }, [apiUrl]);

  // Removed automatic bill number fetching - will fetch only when Submit to KOT is clicked

  useEffect(() => {
    if (selectedCategory && products.length > 0) {
      const filtered = products.filter(
        (product) => product.category._id === selectedCategory._id
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts([]);
    }
  }, [selectedCategory, products]);

  // Fetch last order for the table when tableNumber and apiUrl are available
  const fetchLastOrder = useCallback(async () => {
    if (!apiUrl || !tableNumber || isLoadingIp) return;
    
    setLoadingLastOrder(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.post(
        `${apiUrl}/api/bill/getTableStatus`,
        { tableNumber },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Check if table has an active order
      if (response.data.status === 'success' && response.data.data) {
        const billData = response.data.data;
        
        // Only show orders with active statuses (pending, preparing, ready)
        // Don't show cancelled or completed orders
        const activeStatuses = ['pending', 'preparing', 'ready'];
        if (!activeStatuses.includes(billData.status)) {
          // Order is completed, cancelled, or bill-printed - treat as table-free
          setExistingBillId(null);
          setOrderItems([]);
          return;
        }
        
        // Set the existing bill ID and bill number
        setExistingBillId(billData._id);
        setBillNumber(billData.billNumber);
        
        // Map items from API response to OrderItem format
        if (billData.items && Array.isArray(billData.items)) {
          const mappedItems: OrderItem[] = billData.items
            .filter((item: any) => item.status === 'active' && item.productId) // Only active items
            .map((item: any) => {
              const productId = item.productId;
              
              // Try to find the product in the products list to get full category info
              const existingProduct = products.find(p => p._id === productId._id);
              
              // If product exists in state, use it; otherwise create from API data
              const product: Product = existingProduct || {
                _id: productId._id,
                name: productId.name,
                category: {
                  _id: productId.category,
                  // Try to find category name from categories list
                  name: categories.find(c => c._id === productId.category)?.name || '',
                },
                status: productId.status || 'active',
                Basequantity: productId.Basequantity,
                price: productId.price,
              };
              
              // Ensure price is set from API if not in product
              if (!product.price && productId.price) {
                product.price = productId.price;
              }
              
              return {
                product,
                quantity: item.quantity,
              };
            });
          
          setOrderItems(mappedItems);
        }
      } else if (response.data.status === 'table-free') {
        // Table is free, reset to empty state
        setExistingBillId(null);
        setOrderItems([]);
        // Don't reset billNumber here, keep the new bill number for new orders
      }
    } catch (err: any) {
      console.error('Error fetching last order:', err);
      // Don't show alert, just log error - table might be free
      setExistingBillId(null);
      setOrderItems([]);
    } finally {
      setLoadingLastOrder(false);
    }
  }, [apiUrl, tableNumber, products, categories, isLoadingIp]);

  useEffect(() => {
    // Fetch when tableNumber and apiUrl are available
    // Also depend on products and categories for proper mapping
    if (apiUrl && tableNumber && !isLoadingIp) {
      fetchLastOrder();
    }
  }, [apiUrl, tableNumber, products, categories, isLoadingIp, fetchLastOrder]);

  // Refresh order when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (apiUrl && tableNumber && !isLoadingIp) {
        fetchLastOrder();
      }
    }, [apiUrl, tableNumber, isLoadingIp, fetchLastOrder])
  );

  const fetchCategories = async () => {
    if (!apiUrl) return;

    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.post(
        `${apiUrl}/api/category/status`,
        { statuses: ['active', 'inactive'] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setCategories(response.data);
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      Alert.alert(
        'Error',
        err.response?.data?.message || err.message || 'Failed to fetch categories'
      );
    }
  };

  const fetchProducts = async () => {
    if (!apiUrl) return;

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.post(
        `${apiUrl}/api/product/all`,
        { status: ['active', 'inactive'], categoryStatus: ['active'] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setProducts(response.data.data.products);
    } catch (err: any) {
      console.error('Error fetching products:', err);
      Alert.alert(
        'Error',
        err.response?.data?.message || err.message || 'Failed to fetch products'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setCategoryDropdownVisible(false);
  };

  const handleAddToOrder = (product: Product) => {
    const existingItem = orderItems.find((item) => item.product._id === product._id);
    if (existingItem) {
      setOrderItems(
        orderItems.map((item) =>
          item.product._id === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setOrderItems([...orderItems, { product, quantity: 1 }]);
    }
  };

  const handleIncrementQuantity = (productId: string) => {
    setOrderItems(
      orderItems.map((item) =>
        item.product._id === productId ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  };

  const handleDecrementQuantity = (productId: string) => {
    setOrderItems(
      orderItems
        .map((item) =>
          item.product._id === productId
            ? { ...item, quantity: Math.max(0, item.quantity - 1) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const getTotalItems = () => {
    return orderItems.reduce((total, item) => total + item.quantity, 0);
  };

  const getItemTotal = (item: OrderItem) => {
    const price = (item.product as any)?.price ? Number((item.product as any).price) : 0;
    return price * item.quantity;
  };

  const getTotalOrderCost = () => {
    return orderItems.reduce((total, item) => {
      const price = (item.product as any)?.price ? Number((item.product as any).price) : 0;
      return total + price * item.quantity;
    }, 0);
  };

  const updateBillNumber = async (currentSequenceNumber?: number) => {
    if (!apiUrl) return false;
    try {
      const token = await AsyncStorage.getItem('token');
      // Use provided sequence number or fall back to state
      const seqToUse = currentSequenceNumber !== undefined ? currentSequenceNumber : sequenceNumber;
      console.log('Updating bill number sequence from:', seqToUse, 'to:', seqToUse + 1);
      const response = await axios.put(
        `${apiUrl}/api/billnumber/updateBillNumber`,
        { number: seqToUse + 1 },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.status === 200 || response.status === 201) {
        console.log('Bill number sequence updated successfully');
        // Immediately refetch to get the new bill number string and sequence from server
        try {
          const refreshed = await axios.get(`${apiUrl}/api/billnumber/getBillNumber`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setBillNumber(refreshed.data.currentBillNumber);
          setSequenceNumber(refreshed.data.number);
          console.log('Refreshed bill number after update:', refreshed.data.currentBillNumber);
        } catch (err) {
          // Fallback: bump local sequence if refetch fails
          setSequenceNumber(seqToUse + 1);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error updating bill number:', err);
      if ((err as any).response) {
        console.error('Error response data:', (err as any).response.data);
      }
      return false;
    }
  };

  const fetchBillNumber = async () => {
    if (!apiUrl) return null;
    try {
      setBillNumberLoading(true);
      const token = await AsyncStorage.getItem('token');
      console.log('Fetching bill number from:', `${apiUrl}/api/billnumber/getBillNumber`);
      const response = await axios.get(`${apiUrl}/api/billnumber/getBillNumber`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      console.log('Bill number API response:', JSON.stringify(response.data, null, 2));
      const billNumber = response.data.currentBillNumber;
      const seqNumber = response.data.number;
      console.log('Fetched bill number:', billNumber, 'Sequence:', seqNumber);
      setBillNumber(billNumber);
      setSequenceNumber(seqNumber);
      // Return both bill number and sequence number
      return { billNumber, sequenceNumber: seqNumber };
    } catch (err) {
      console.error('Error fetching bill number:', err);
      if ((err as any).response) {
        console.error('Error response data:', (err as any).response.data);
      }
      return null;
    } finally {
      setBillNumberLoading(false);
    }
  };

  const handleClearOrder = () => {
    Alert.alert(
      'Clear Order',
      'Are you sure you want to clear all items from the order?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setOrderItems([]);
            // Reset bill number if it was fetched
            if (!existingBillId) {
              setBillNumber(null);
              setSequenceNumber(0);
            }
          },
        },
      ]
    );
  };

  const handleCancelOrder = async () => {
    if (isLoadingIp) {
      return;
    }
    if (!apiUrl) {
      Alert.alert('Error', 'Server IP not configured. Please login first.');
      return;
    }
    if (!existingBillId) {
      // If no existing bill, just clear the order
      handleClearOrder();
      return;
    }

    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order? The order status will be changed to cancelled.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const token = await AsyncStorage.getItem('token');
              
              // Update bill status to cancelled using updateStatus endpoint
              const response = await axios.put(
                `${apiUrl}/api/bill/updateStatus`,
                {
                  _id: existingBillId,
                  status: 'cancelled'
                },
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );

              if (response.status === 200 || response.status === 201) {
                Alert.alert('Success', 'Order cancelled successfully!');
                // Clear order list
                setOrderItems([]);
                setBillNumber(null);
                setSequenceNumber(0);
                setExistingBillId(null);
              }
            } catch (err: any) {
              console.error('Error cancelling order:', err);
              Alert.alert('Failed to cancel order', err.response?.data?.message || err.message || 'Unknown error');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCompleteOrder = async () => {
    // Wait for IP to finish loading before checking
    if (isLoadingIp) {
      return;
    }
    if (!apiUrl) {
      Alert.alert('Error', 'Server IP not configured. Please login first.');
      return;
    }
    if (!tableNumber) {
      Alert.alert('Select Table', 'Please select a table before completing order.');
      return;
    }
    if (orderItems.length === 0) {
      Alert.alert('Empty Order', 'Add items to the order before completing.');
      return;
    }

    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      let response;

      // If there's an existing bill, update its status instead of creating a new one
      if (existingBillId) {
        console.log('Complete Order: Updating existing bill status to completed');
        response = await axios.put(
          `${apiUrl}/api/bill/updateStatus`,
          {
            _id: existingBillId,
            status: 'completed'
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      } else {
        // New order - fetch bill number and create it
        console.log('Complete Order: Fetching bill number for new order...');
        const fetchedBillData = await fetchBillNumber();
        if (!fetchedBillData || !fetchedBillData.billNumber) {
          Alert.alert('Error', 'Failed to fetch bill number. Please try again.');
          setLoading(false);
          return;
        }
        const fetchedBillNumber = fetchedBillData.billNumber;
        const fetchedSequenceNumber = fetchedBillData.sequenceNumber;
        console.log('Complete Order: Fetched bill number:', fetchedBillNumber);
        console.log('Complete Order: Fetched sequence number:', fetchedSequenceNumber);

        const sanitizedItems = orderItems.map((item) => {
          const price = (item.product as any)?.price ? Number((item.product as any).price) : 0;
          return {
            productId: item.product._id,
            name: item.product.name,
            quantity: item.quantity,
            price: price,
            subtotal: price * item.quantity,
            Basequantity: 1,
          };
        });

        const totalAmount = getTotalOrderCost();
        const billData = {
          billNumber: fetchedBillNumber,
          paymentMethod: 'cash',
          status: 'completed', // Directly set as completed
          orderType: 'dine-in',
          tableNumber: tableNumber,
          table: tableNumber,
          items: sanitizedItems,
          totalAmount: totalAmount,
          cgst: 0,
          sgst: 0,
          payableAmount: totalAmount,
          date: new Date().toISOString(),
        };

        console.log('Complete Order: Creating new bill with status completed:', JSON.stringify(billData, null, 2));
        console.log('Complete Order: Bill number being submitted:', fetchedBillNumber);

        response = await axios.post(`${apiUrl}/api/bill/create`, billData, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        // Only update bill number sequence for new orders
        if (response.status === 200 || response.status === 201) {
          console.log('Complete Order: Updating bill number sequence...');
          await updateBillNumber(fetchedSequenceNumber);
        }
      }

      if (response.status === 200 || response.status === 201) {
        Alert.alert('Success', 'Order completed successfully!');
        
        // Clear order list so new order can be made
        setOrderItems([]);
        setBillNumber(null);
        setSequenceNumber(0);
        setExistingBillId(null);
      }
    } catch (err: any) {
      console.error('Error completing order:', err);
      Alert.alert('Failed to complete order', err.response?.data?.message || err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const submitKOT = async () => {
    // Wait for IP to finish loading before checking
    if (isLoadingIp) {
      return;
    }
    if (!apiUrl) {
      Alert.alert('Error', 'Server IP not configured. Please login first.');
      return;
    }
    if (!tableNumber) {
      Alert.alert('Select Table', 'Please select a table before submitting KOT.');
      return;
    }
    if (orderItems.length === 0) {
      Alert.alert('Empty Order', 'Add items to the order before submitting.');
      return;
    }
    try {
      setLoading(true);
      // Fetch bill number only when submitting to KOT
      console.log('Submit KOT: Fetching bill number...');
      const fetchedBillData = await fetchBillNumber();
      if (!fetchedBillData || !fetchedBillData.billNumber) {
        Alert.alert('Error', 'Failed to fetch bill number. Please try again.');
        setLoading(false);
        return;
      }
      const fetchedBillNumber = fetchedBillData.billNumber;
      const fetchedSequenceNumber = fetchedBillData.sequenceNumber;
      console.log('Submit KOT: Fetched bill number:', fetchedBillNumber);
      console.log('Submit KOT: Fetched sequence number:', fetchedSequenceNumber);
      const sanitizedItems = orderItems.map((item) => {
        const price = (item.product as any)?.price ? Number((item.product as any).price) : 0;
        return {
          productId: item.product._id,
          name: item.product.name,
          quantity: item.quantity,
          price: price,
          subtotal: price * item.quantity,
          Basequantity: 1,
        };
      });

      const totalAmount = getTotalOrderCost();
      const billData = {
        billNumber: fetchedBillNumber,
        paymentMethod: 'cash',
        status: 'pending',
        orderType: 'dine-in',
        tableNumber: tableNumber,
        table: tableNumber,
        items: sanitizedItems,
        totalAmount: totalAmount,
        cgst: 0,
        sgst: 0,
        payableAmount: totalAmount,
        date: new Date().toISOString(),
      };

      const token = await AsyncStorage.getItem('token');

      // If there's an existing bill, we should not create a new one
      // The Update KOT button should handle updating existing bills
      if (existingBillId) {
        Alert.alert('Error', 'An order already exists for this table. Please use "Update KOT" to modify it.');
        setLoading(false);
        return;
      }
      
      // New order - create it
      const response = await axios.post(`${apiUrl}/api/bill/create`, billData, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 200 || response.status === 201) {
        Alert.alert('Success', 'KOT submitted successfully!');
        
        // Update bill number sequence using the sequence number we just fetched
        console.log('Submit KOT: Updating bill number sequence...');
        await updateBillNumber(fetchedSequenceNumber);
        
        // Refetch the order to show the submitted order
        await fetchLastOrder();
      }
    } catch (err: any) {
      console.error('Error creating bill:', err);
      Alert.alert('Failed to create bill', err.response?.data?.message || err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      {/* <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            name="chevron.left"
            size={24}
            color={Colors[colorScheme ?? 'light'].tint}
          />
          <ThemedText style={[styles.backButtonText, { marginLeft: 4 }]}>Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title" style={styles.headerTitle}>
          Table {tableNumber}
        </ThemedText>
        <TouchableOpacity onPress={() => navigation?.dispatch?.(DrawerActions.openDrawer())} style={styles.menuButton}>
          <ThemedText style={styles.menuIcon}>≡</ThemedText>
        </TouchableOpacity>
      </View> */}

      {(loadingLastOrder && orderItems.length === 0) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <ThemedText style={styles.loadingText}>Loading order for Table {tableNumber}...</ThemedText>
        </View>
      ) : (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Table Info */}
        {tableNumber && (
          <View style={styles.tableInfoContainer}>
            <ThemedText style={styles.tableInfoText}>
              Table {tableNumber} {existingBillId ? `(Order: ${billNumber})` : ''}
            </ThemedText>
          </View>
        )}
        {/* Category Dropdown */}
        <View style={styles.categorySection}>
          <ThemedText style={styles.sectionTitle}>Select Category</ThemedText>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setCategoryDropdownVisible(true)}
          >
            <ThemedText style={styles.dropdownButtonText}>
              {selectedCategory ? selectedCategory.name : 'Select a category'}
            </ThemedText>
            <ThemedText style={styles.dropdownArrow}>▼</ThemedText>
          </TouchableOpacity>

          {/* Category Dropdown Modal */}
          <Modal
            visible={categoryDropdownVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setCategoryDropdownVisible(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setCategoryDropdownVisible(false)}
            >
              <View style={styles.modalContent}>
                <ThemedText type="defaultSemiBold" style={styles.modalTitle}>
                  Select Category
                </ThemedText>
                <FlatList
                  data={categories}
                  keyExtractor={(item) => item._id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.categoryOption}
                      onPress={() => handleCategorySelect(item)}
                    >
                      <ThemedText style={styles.categoryOptionText}>{item.name}</ThemedText>
                      {selectedCategory?._id === item._id && (
                        <ThemedText style={styles.checkmark}>✓</ThemedText>
                      )}
                    </TouchableOpacity>
                  )}
                />
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setCategoryDropdownVisible(false)}
                >
                  <ThemedText style={styles.modalCloseButtonText}>Close</ThemedText>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        </View>

        {/* Products List */}
        {selectedCategory && (
          <View style={styles.productsSection}>
            <ThemedText style={styles.sectionTitle}>Products</ThemedText>
            {loading ? (
              <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
            ) : filteredProducts.length === 0 ? (
              <ThemedText style={styles.emptyText}>No products found in this category</ThemedText>
            ) : (
              <View style={styles.productsGrid}>
                {filteredProducts.map((product) => (
                  <TouchableOpacity
                    key={product._id}
                    style={styles.productCard}
                    onPress={() => handleAddToOrder(product)}
                  >
                    <ThemedText style={styles.productName}>{product.name}</ThemedText>
                    <ThemedText style={styles.basequantity}>{product.Basequantity}</ThemedText>
                    <ThemedText style={styles.productCategory}>
                      ₹{(product as any)?.price ? Number((product as any).price).toFixed(2) : "N/A"}
                    </ThemedText>
                    <View style={styles.addButton}>
                      <ThemedText style={styles.addButtonText}>+ Add</ThemedText>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Order List */}
        {orderItems.length > 0 && (
          <View style={styles.orderSection}>
            <View style={styles.orderHeader}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                Order List ({getTotalItems()} items)
              </ThemedText>
            </View>
            {orderItems.map((item) => (
              <View key={item.product._id} style={styles.orderItem}>
                <View style={styles.orderItemInfo}>
                  <ThemedText style={styles.orderItemName}>{item.product.name}</ThemedText>
                  <ThemedText style={styles.orderItemCategory}>
                    {item.product.Basequantity}
                  </ThemedText>
                  <ThemedText style={styles.orderItemPrice}>
                    ₹{((item.product as any)?.price ? Number((item.product as any).price) : 0).toFixed(2)} each
                  </ThemedText>
                </View>
                <View style={styles.orderItemRight}>
                  <View style={styles.quantityControls}>
                    <TouchableOpacity
                      style={styles.quantityButton}
                      onPress={() => handleDecrementQuantity(item.product._id)}
                    >
                      <ThemedText style={styles.quantityButtonText}>-</ThemedText>
                    </TouchableOpacity>
                    <ThemedText style={styles.quantityText}>{item.quantity}</ThemedText>
                    <TouchableOpacity
                      style={[styles.quantityButton, { marginLeft: 16 }]}
                      onPress={() => handleIncrementQuantity(item.product._id)}
                    >
                      <ThemedText style={styles.quantityButtonText}>+</ThemedText>
                    </TouchableOpacity>
                  </View>
                  <ThemedText style={styles.itemTotalText}>
                    ₹{getItemTotal(item).toFixed(2)}
                  </ThemedText>
                </View>
              </View>
            ))}
            {/* Total Order Cost */}
            <View style={styles.totalCostContainer}>
              <ThemedText type="defaultSemiBold" style={styles.totalCostLabel}>
                Total: ₹{getTotalOrderCost().toFixed(2)}
              </ThemedText>
            </View>
            
            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              {/* Clear Order / Cancel Order Button */}
              {existingBillId ? (
                <TouchableOpacity
                  disabled={loading || orderItems.length === 0}
                  onPress={handleCancelOrder}
                  style={[
                    styles.clearButton,
                    (loading || orderItems.length === 0) ? { opacity: 0.6 } : null,
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText style={styles.clearButtonText}>Cancel Order</ThemedText>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  disabled={loading || orderItems.length === 0}
                  onPress={handleClearOrder}
                  style={[
                    styles.clearButton,
                    (loading || orderItems.length === 0) ? { opacity: 0.6 } : null,
                  ]}
                >
                  <ThemedText style={styles.clearButtonText}>Clear Order</ThemedText>
                </TouchableOpacity>
              )}

              {/* Complete Order Button */}
              <TouchableOpacity
                disabled={loading || billNumberLoading || orderItems.length === 0}
                onPress={handleCompleteOrder}
                style={[
                  styles.completeButton,
                  (loading || billNumberLoading || orderItems.length === 0) ? { opacity: 0.6 } : null,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.completeButtonText}>Complete Order</ThemedText>
                )}
              </TouchableOpacity>
            </View>

            {/* Submit to KOT Button */}
            {existingBillId ? (
              <TouchableOpacity
                disabled={loading}
                onPress={() => {
                  Alert.alert('Update KOT', 'Update KOT action will be implemented.');
                }}
                style={[
                  styles.submitButton,
                  loading ? { opacity: 0.6 } : null,
                  { backgroundColor: '#FF9500' },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.submitButtonText}>
                    {`Update KOT ${billNumber ? `(Bill ${billNumber})` : ''}`}
                  </ThemedText>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                disabled={loading || billNumberLoading || orderItems.length === 0}
                onPress={submitKOT}
                style={[
                  styles.submitButton,
                  (loading || billNumberLoading || orderItems.length === 0) ? { opacity: 0.6 } : null,
                ]}
              >
                {loading || billNumberLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.submitButtonText}>
                    Submit to KOT
                  </ThemedText>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
      )}
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
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 60,
  },
  menuButton: {
    padding: 8,
    width: 60,
    alignItems: 'flex-end',
  },
  menuIcon: {
    fontSize: 22,
    color: '#007AFF',
    fontWeight: '900',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
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
  tableInfoContainer: {
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  tableInfoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  categorySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E5EA',
    marginBottom: 12,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E5E5EA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  dropdownButtonText: {
    color: '#000',
    fontSize: 16,
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    marginBottom: 16,
    textAlign: 'center',
    color: '#000',
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  categoryOptionText: {
    fontSize: 16,
    color: '#000',
  },
  basequantity: {
    fontSize: 12,
    opacity: 0.7,
    color: 'green',
    marginBottom: 8,
  },
  checkmark: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  modalCloseButton: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  productsSection: {
    marginBottom: 24,
  },
  loader: {
    marginVertical: 20,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 20,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCard: {
    width: '48%',
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  productCategory: {
    fontSize: 12,
    opacity: 0.7,
    color: 'red',
    marginBottom: 8,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  orderSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  orderHeader: {
    marginBottom: 12,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  orderItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  orderItemRight: {
    alignItems: 'flex-end',
  },
  orderItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  orderItemCategory: {
    color: 'red',
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  orderItemPrice: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
    color: '#000',
  },
  itemTotalText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    color: '#000',
  },
  totalCostContainer: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  totalCostLabel: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  completeButton: {
    flex: 1,
    backgroundColor: '#5856D6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 12,
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  quantityText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    minWidth: 30,
    textAlign: 'center',
    marginLeft: 16,
  },
});

