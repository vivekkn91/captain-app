import React, { useEffect, useState } from 'react';
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
import { useNavigation, DrawerActions } from '@react-navigation/native';
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
      fetchCategories();
      fetchProducts();
    }
  }, [apiUrl]);

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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
                    {item.product.category.name}
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
          </View>
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

