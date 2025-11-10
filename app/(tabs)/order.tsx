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

type ItemStatus = 'original' | 'addon' | 'removed';

interface OrderItem {
  product: Product;
  quantity: number;
  itemStatus?: ItemStatus; // 'original' = submitted to kitchen, 'addon' = added later, 'removed' = removed from order
  originalQuantity?: number; // Track original quantity before removal
  localId?: string; // local client id to uniquely identify list entries
  serverItemIds?: string[]; // IDs of server-side bill items that this client item aggregates
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
  const [originalSubmittedItems, setOriginalSubmittedItems] = useState<OrderItem[]>([]); // Track items that were originally submitted to KOT

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
          // Process all items - don't filter by status yet
          const allItems = billData.items.filter((item: any) => item.productId);
          
          // Map to track items by product ID to handle potential duplicates from server
          // Only merge if we have multiple active items with same product ID (addon scenario)
          const itemsByProductId = new Map<string, OrderItem[]>();
          
          allItems.forEach((item: any) => {
            const productId = item.productId;
            // Handle different productId formats: string, object with _id, or nested object
            let productIdString: string = '';
            let productName: string = '';
            let productCategoryId: string = '';
            let productStatus: string = 'active';
            let productBasequantity: number | string | undefined;
            let productPrice: number | undefined;
            
            if (typeof productId === 'string') {
              productIdString = productId;
            } else if (productId && typeof productId === 'object') {
              productIdString = productId._id || String(productId);
              productName = productId.name || '';
              productCategoryId = productId.category || '';
              productStatus = productId.status || 'active';
              productBasequantity = productId.Basequantity;
              productPrice = productId.price;
            } else {
              console.warn('Skipping item with invalid productId:', item);
              return;
            }
            
            if (!productIdString) {
              console.warn('Skipping item with invalid productId:', item);
              return;
            }
            
            // Try to find the product in the products list to get full category info
            const existingProduct = products.find(p => p._id === productIdString);
            
            // Extract product info, preferring existing product data
            const finalProductName = productName || existingProduct?.name || 'Unknown Product';
            const finalProductCategoryId = productCategoryId || existingProduct?.category?._id || '';
            const finalProductStatus = productStatus || existingProduct?.status || 'active';
            const finalProductBasequantity = productBasequantity || existingProduct?.Basequantity;
            const finalProductPrice = item.price || productPrice || existingProduct?.price;
            
            // If product exists in state, use it; otherwise create from API data
            const product: Product = existingProduct || {
              _id: productIdString,
              name: finalProductName,
              category: {
                _id: finalProductCategoryId,
                // Try to find category name from categories list
                name: categories.find(c => c._id === finalProductCategoryId)?.name || '',
              },
              status: finalProductStatus,
              Basequantity: finalProductBasequantity,
              price: finalProductPrice,
            };
            
            // Ensure price is set from API if not in product
            if (!product.price && item.price) {
              product.price = item.price;
            }
            
            const isCanceled = item.status === 'canceled';
            const orderItem: OrderItem = {
              product,
              quantity: item.quantity || 0,
              itemStatus: isCanceled ? 'removed' as ItemStatus : 'original' as ItemStatus,
            };
            
            // For canceled items, try to get original quantity from item updates
            if (isCanceled) {
              if (item.updates && item.updates.length > 0) {
                // Find the canceled update - it should have the quantity that was canceled
                const canceledUpdate = item.updates.find((update: any) => update.changeType === 'canceled');
                if (canceledUpdate && canceledUpdate.quantity) {
                  // The quantity in the canceled update is the original quantity before cancellation
                  orderItem.originalQuantity = canceledUpdate.quantity;
                } else {
                  // If no canceled update found, try to sum all update quantities as fallback
                  // This is not ideal but better than 0
                  const totalFromUpdates = item.updates.reduce((sum: number, update: any) => {
                    return sum + (update.quantity || 0);
                  }, 0);
                  orderItem.originalQuantity = totalFromUpdates || 1; // Default to 1 if we can't determine
                }
              } else {
                // No updates available - this shouldn't happen for canceled items
                // But if it does, default to 1
                orderItem.originalQuantity = 1;
              }
            }
            
            // Group items by product ID
            if (!itemsByProductId.has(productIdString)) {
              itemsByProductId.set(productIdString, []);
            }
            itemsByProductId.get(productIdString)!.push(orderItem);
          });
          
          // Aggregate server-side items per product into a single original entry
          // This prevents duplicate lines for the same product while preserving
          // the list of server-side item ids so we can perform deterministic
          // updates later.
          const mappedItems: OrderItem[] = [];

          itemsByProductId.forEach((items, productId) => {
            // Separate canceled and active items
            const canceledItemsForProduct = items.filter(item => item.itemStatus === 'removed');
            const activeItemsForProduct = items.filter(item => item.itemStatus !== 'removed' && item.quantity > 0);

            // If there are canceled items, create a removed entry (keep originalQuantity)
            if (canceledItemsForProduct.length > 0) {
              const canceledTotal = canceledItemsForProduct.reduce((sum, it) => sum + (it.originalQuantity || it.quantity || 0), 0);
              const prototype = canceledItemsForProduct[0];
              mappedItems.push({
                product: prototype.product,
                quantity: 0,
                itemStatus: 'removed',
                originalQuantity: canceledTotal,
                localId: prototype.localId ?? `srv-removed-${productId}-${Date.now()}`,
                serverItemIds: canceledItemsForProduct.map((it: any) => (it as any)._id || (it as any).serverItemId).filter(Boolean),
              });
            }

            if (activeItemsForProduct.length > 0) {
              // Aggregate active quantities into one entry
              const totalQty = activeItemsForProduct.reduce((sum, it) => sum + (it.quantity || 0), 0);
              const prototype = activeItemsForProduct[0];
              mappedItems.push({
                product: prototype.product,
                quantity: totalQty,
                itemStatus: 'original',
                localId: prototype.localId ?? `srv-${productId}-${Date.now()}`,
                serverItemIds: activeItemsForProduct.map((it: any) => (it as any)._id || (it as any).serverItemId).filter(Boolean),
              });
            }
          });

          // Ensure every item has a stable localId for client-side operations
          const mappedWithIds = mappedItems.map((m, idx) => ({
            ...m,
            localId: m.localId ?? `srv-${m.product._id}-${Date.now()}-${idx}`,
          }));
          setOrderItems(mappedWithIds);
          setOriginalSubmittedItems(mappedWithIds.filter(item => item.itemStatus === 'original' || !item.itemStatus)); // Store original items for comparison
        }
      } else if (response.data.status === 'table-free') {
        // Table is free, reset to empty state
        setExistingBillId(null);
        setOrderItems([]);
        setOriginalSubmittedItems([]);
        // Don't reset billNumber here, keep the new bill number for new orders
      }
    } catch (err: any) {
      console.error('Error fetching last order:', err);
      // Don't show alert, just log error - table might be free
      setExistingBillId(null);
      setOrderItems([]);
      setOriginalSubmittedItems([]);
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
    // Prefer matching an existing non-removed entry with same product and same status
    const existingItem = orderItems.find((item) => item.product._id === product._id && item.itemStatus !== 'removed');
    
    if (existingItem) {
      // If item exists and is not removed
      if (existingItem.itemStatus === 'removed') {
        // Restore removed item as addon
        setOrderItems(
          orderItems.map((item) => {
            if (item.product._id === product._id) {
              return { 
                ...item, 
                quantity: 1, 
                itemStatus: 'addon' as ItemStatus,
                originalQuantity: undefined 
              };
            }
            return item;
          })
        );
      } else if (existingBillId && existingItem.itemStatus === 'original') {
        // If order is already submitted to KOT and this is an original item,
        // create a separate addon entry instead of incrementing the original
        const addonItem = orderItems.find(
          (item) => item.product._id === product._id && item.itemStatus === 'addon'
        );
        
        if (addonItem) {
          // If addon entry already exists, increment it
          setOrderItems(
            orderItems.map((item) =>
              item.product._id === product._id && item.itemStatus === 'addon'
                ? { ...item, quantity: item.quantity + 1 }
                : item
            )
          );
        } else {
          // Create new addon entry
          setOrderItems([...orderItems, { product, quantity: 1, itemStatus: 'addon' as ItemStatus }]);
        }
      } else {
        // For new orders (not submitted) or addon items, just increment quantity
        setOrderItems(
          orderItems.map((item) =>
            item.product._id === product._id ? { ...item, quantity: item.quantity + 1 } : item
          )
        );
      }
    } else {
      // New item - check if order already exists (submitted to KOT)
      const itemStatus: ItemStatus | undefined = existingBillId ? 'addon' : undefined;
      const newItem: OrderItem = { product, quantity: 1, itemStatus, localId: `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}` };
      setOrderItems([...orderItems, newItem]);
    }
  };

  // Operate on items by their localId to avoid ambiguous matches when product appears multiple times
  const handleIncrementQuantity = (localId: string) => {
    console.log('handleIncrementQuantity called for', localId);
    const idx = orderItems.findIndex(i => i.localId === localId);
    if (idx === -1) {
      console.warn('handleIncrementQuantity: localId not found', localId);
      return;
    }
    const target = orderItems[idx];

    // If order already submitted and this is an original item, increment/add an addon instead
    const isOriginal = !target.itemStatus || target.itemStatus === 'original';
    if (existingBillId && isOriginal) {
      // find existing addon for same product
      const addonIdx = orderItems.findIndex(i => i.product._id === target.product._id && i.itemStatus === 'addon');
      if (addonIdx !== -1) {
        const newItems = [...orderItems];
        newItems[addonIdx] = { ...newItems[addonIdx], quantity: newItems[addonIdx].quantity + 1 };
        setOrderItems(newItems);
      } else {
        const addonItem: OrderItem = {
          product: target.product,
          quantity: 1,
          itemStatus: 'addon',
          localId: `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
        };
        setOrderItems([...orderItems, addonItem]);
      }
      return;
    }

    // Otherwise increment the target item
    const newItems = [...orderItems];
    newItems[idx] = { ...target, quantity: target.quantity + 1 };
    setOrderItems(newItems);
  };

  const handleDecrementQuantity = (localId: string) => {
    console.log('handleDecrementQuantity called for', localId);
    const idx = orderItems.findIndex(i => i.localId === localId);
    if (idx === -1) {
      console.warn('handleDecrementQuantity: localId not found', localId);
      return;
    }
    const target = orderItems[idx];

    const newItems = [...orderItems];
    const newQuantity = target.quantity - 1;

    if (newQuantity <= 0) {
      const isOriginal = !target.itemStatus || target.itemStatus === 'original';
      if (isOriginal && existingBillId) {
        // mark as removed but keep in list
        newItems[idx] = { ...target, quantity: 0, itemStatus: 'removed', originalQuantity: target.quantity };
      } else {
        // remove the item entirely (addon or new order)
        newItems.splice(idx, 1);
      }
    } else {
      newItems[idx] = { ...target, quantity: newQuantity };
    }

    setOrderItems(newItems);
  };

  const getTotalItems = () => {
    // Exclude removed items from count
    return orderItems
      .filter(item => item.itemStatus !== 'removed')
      .reduce((total, item) => total + item.quantity, 0);
  };

  const getItemTotal = (item: OrderItem) => {
    const price = (item.product as any)?.price ? Number((item.product as any).price) : 0;
    return price * item.quantity;
  };

  const getTotalOrderCost = () => {
    // Exclude removed items from total
    return orderItems
      .filter(item => item.itemStatus !== 'removed')
      .reduce((total, item) => {
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
            setOriginalSubmittedItems([]);
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
                setOriginalSubmittedItems([]);
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
        setOriginalSubmittedItems([]);
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
        
        // Mark all items as original and store them
        const originalItems = orderItems.map(item => ({
          ...item,
          itemStatus: 'original' as ItemStatus
        }));
        setOrderItems(originalItems);
        setOriginalSubmittedItems(originalItems);
        
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

  const updateKOT = async () => {
    // Wait for IP to finish loading before checking
    if (isLoadingIp) {
      return;
    }
    if (!apiUrl) {
      Alert.alert('Error', 'Server IP not configured. Please login first.');
      return;
    }
    if (!tableNumber) {
      Alert.alert('Select Table', 'Please select a table before updating KOT.');
      return;
    }
    if (!existingBillId) {
      Alert.alert('Error', 'No existing order found. Please submit a new order first.');
      return;
    }

    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const userId = await AsyncStorage.getItem('userId'); // Get userId if stored

      // Fetch current bill to get existing items
      const billResponse = await axios.post(
        `${apiUrl}/api/bill/getTableStatus`,
        { tableNumber },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (billResponse.data.status !== 'success' || !billResponse.data.data) {
        throw new Error('Could not fetch current bill');
      }

      const currentBill = billResponse.data.data;

      // Identify added items (addons)
      const addedItems = orderItems
        .filter(item => item.itemStatus === 'addon' && item.quantity > 0)
        .map((item) => {
          const price = (item.product as any)?.price ? Number((item.product as any).price) : 0;
          return {
            productId: item.product._id,
            name: item.product.name,
            quantity: item.quantity,
            price: price,
          };
        });

      // Identify edited items (original items with quantity changes or removed)
      const editedItems: Array<{
        itemId: string;
        newQuantity: number;
        changeType: 'edit' | 'canceled';
      }> = [];

      // Only process active items from server (skip already canceled items)
      currentBill.items
        .filter((billItem: any) => billItem.status !== 'canceled')
        .forEach((billItem: any) => {
          const itemId = billItem._id;
          const productId = billItem.productId?._id || billItem.productId;
          
          // Check if item was removed in current session
          const removedItem = orderItems.find(
            item => item.product._id === productId && item.itemStatus === 'removed'
          );
          
          if (removedItem) {
            editedItems.push({
              itemId,
              newQuantity: 0,
              changeType: 'canceled',
            });
          } else {
            // Check if quantity changed - find the original item (not addon)
            const currentItem = orderItems.find(
              item => item.product._id === productId && item.itemStatus === 'original'
            );
            
            // Only update if quantity actually changed
            if (currentItem && currentItem.quantity !== billItem.quantity) {
              editedItems.push({
                itemId,
                newQuantity: currentItem.quantity,
                changeType: 'edit',
              });
            }
          }
        });

      // Check if there are any changes
      const isCompleteOrder = !addedItems.length && !editedItems.length;

      // Map existing items with their updates (following web app logic)
      const updatedExistingItems = currentBill.items.map((item: any) => {
        const editedItem = editedItems.find((edit) => edit.itemId === item._id);
        
        if (editedItem) {
          // Create new update record for the item
          const newUpdate = {
            changeType: editedItem.changeType,
            quantity: Math.abs(editedItem.newQuantity - item.quantity),
            timestamp: new Date().toISOString(),
            updatedBy: userId || null,
          };

          // Return item with updates, maintaining zero quantity for canceled items
          return {
            ...item,
            quantity: editedItem.newQuantity,
            subtotal: editedItem.newQuantity * item.price,
            updates: [...(item.updates || []), newUpdate],
            // Keep canceled items with quantity 0
            status: editedItem.changeType === 'canceled' ? 'canceled' : 'active',
          };
        }
        return item;
      });

      // Keep canceled items in the array but with quantity 0
      const processedItems = updatedExistingItems.map((item: any) =>
        item.status === 'canceled' ? { ...item, quantity: 0, subtotal: 0 } : item
      );

      // Format new items with initial update records
      const newItemsFormatted = addedItems.map((item) => {
        const price = item.price;
        return {
          productId: {
            _id: item.productId,
            name: item.name,
          },
          quantity: item.quantity,
          price: price,
          subtotal: price * item.quantity,
          status: 'active',
          updates: [
            {
              changeType: 'add',
              quantity: item.quantity,
              timestamp: new Date().toISOString(),
              updatedBy: userId || null,
            },
          ],
        };
      });

      // Calculate total excluding canceled items
      const newTotal = [...processedItems, ...newItemsFormatted].reduce(
        (sum, item) => sum + (item.status !== 'canceled' ? item.quantity * item.price : 0),
        0
      );

      // Prepare update data (following web app structure)
      const updateData = {
        _id: existingBillId,
        items: [...processedItems, ...newItemsFormatted],
        totalAmount: newTotal,
        paymentMethod: currentBill.paymentMethod || 'cash',
        orderType: currentBill.orderType || 'dine-in',
        status: isCompleteOrder ? 'bill-printed' : currentBill.status,
        sgst: currentBill.sgst || 0,
        cgst: currentBill.cgst || 0,
        customerName: currentBill.customerName || '',
        customerPhone: currentBill.customerPhone || '',
        updatedAt: new Date().toISOString(),
      };

      console.log('Update KOT: Sending update data:', JSON.stringify(updateData, null, 2));

      const response = await axios.put(`${apiUrl}/api/bill/update`, updateData, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 200 || response.status === 201) {
        Alert.alert('Success', 'KOT updated successfully!');
        
        // Update local state - mark addons as original, keep removed items for display
        const updatedItems = orderItems.map(item => {
          if (item.itemStatus === 'addon') {
            return { ...item, itemStatus: 'original' as ItemStatus };
          }
          return item;
        });

        setOrderItems(updatedItems);
        setOriginalSubmittedItems(updatedItems.filter(item => item.itemStatus === 'original' || !item.itemStatus));
        
        // Refetch the order to sync with server
        await fetchLastOrder();
      }
    } catch (err: any) {
      console.error('Error updating KOT:', err);
      Alert.alert('Failed to update KOT', err.response?.data?.message || err.message || 'Unknown error');
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
            {/* Original Items Section */}
            {orderItems.some(item => item.itemStatus === 'original' || !item.itemStatus) && (
              <View style={styles.orderSectionHeader}>
                <ThemedText style={styles.orderSectionHeaderText}>Original Order</ThemedText>
              </View>
            )}
            {orderItems
              .map((item, originalIndex) => ({ item, originalIndex }))
              .filter(({ item }) => item.itemStatus === 'original' || !item.itemStatus)
              .map(({ item, originalIndex }) => (
                <View key={`original-${item.product._id}-${originalIndex}`} style={styles.orderItem}>
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
                        onPress={() => {
                          const lid = item.localId ?? orderItems.find(i => i.product._id === item.product._id && (i.itemStatus || 'original') === (item.itemStatus || 'original'))?.localId;
                          if (lid) handleDecrementQuantity(lid);
                        }}
                      >
                        <ThemedText style={styles.quantityButtonText}>-</ThemedText>
                      </TouchableOpacity>
                      <ThemedText style={styles.quantityText}>{item.quantity}</ThemedText>
                      <TouchableOpacity
                        style={[styles.quantityButton, { marginLeft: 16 }]}
                        onPress={() => {
                          const lid = item.localId ?? orderItems.find(i => i.product._id === item.product._id && (i.itemStatus || 'original') === (item.itemStatus || 'original'))?.localId;
                          if (lid) handleIncrementQuantity(lid);
                        }}
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

            {/* Add-on Items Section */}
            {orderItems.some(item => item.itemStatus === 'addon' && item.quantity > 0) && (
              <View style={styles.orderSectionHeader}>
                <ThemedText style={[styles.orderSectionHeaderText, { color: '#FF9500' }]}>
                  Add-ons (New Items)
                </ThemedText>
              </View>
            )}
            {orderItems
              .map((item, originalIndex) => ({ item, originalIndex }))
              .filter(({ item }) => item.itemStatus === 'addon' && item.quantity > 0)
              .map(({ item, originalIndex }) => (
                <View key={`addon-${item.product._id}-${originalIndex}`} style={[styles.orderItem, styles.addonItem]}>
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
                        onPress={() => {
                          const lid = item.localId ?? orderItems.find(i => i.product._id === item.product._id && (i.itemStatus || '') === 'addon')?.localId;
                          if (lid) handleDecrementQuantity(lid);
                        }}
                      >
                        <ThemedText style={styles.quantityButtonText}>-</ThemedText>
                      </TouchableOpacity>
                      <ThemedText style={styles.quantityText}>{item.quantity}</ThemedText>
                      <TouchableOpacity
                        style={[styles.quantityButton, { marginLeft: 16 }]}
                        onPress={() => {
                          const lid = item.localId ?? orderItems.find(i => i.product._id === item.product._id && (i.itemStatus || '') === 'addon')?.localId;
                          if (lid) handleIncrementQuantity(lid);
                        }}
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

            {/* Removed Items Section */}
            {orderItems.some(item => item.itemStatus === 'removed') && (
              <View style={styles.orderSectionHeader}>
                <ThemedText style={[styles.orderSectionHeaderText, { color: '#FF3B30' }]}>
                  Removed Items
                </ThemedText>
              </View>
            )}
            {orderItems
              .map((item, originalIndex) => ({ item, originalIndex }))
              .filter(({ item }) => item.itemStatus === 'removed')
              .map(({ item, originalIndex }) => (
                <View key={`removed-${item.product._id}-${originalIndex}`} style={[styles.orderItem, styles.removedItem]}>
                  <View style={styles.orderItemInfo}>
                    <ThemedText style={[styles.orderItemName, styles.removedItemText]}>
                      {item.product.name}
                    </ThemedText>
                    <ThemedText style={[styles.orderItemCategory, styles.removedItemText]}>
                      {item.product.Basequantity}
                    </ThemedText>
                    <ThemedText style={[styles.orderItemPrice, styles.removedItemText]}>
                      ₹{((item.product as any)?.price ? Number((item.product as any).price) : 0).toFixed(2)} each
                    </ThemedText>
                    <ThemedText style={styles.removedLabel}>
                      Removed: {item.originalQuantity || 0} → 0
                    </ThemedText>
                  </View>
                  <View style={styles.orderItemRight}>
                    <View style={styles.quantityDisplay}>
                      <ThemedText style={[styles.quantityText, styles.removedItemText]}>
                        {item.quantity} / {item.originalQuantity || 0}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      style={[styles.quantityButton, { backgroundColor: '#34C759', marginTop: 8 }]}
                      onPress={() => {
                        // Restore removed item by localId
                        setOrderItems(
                          orderItems.map(i =>
                            i.localId === item.localId
                              ? { ...i, quantity: item.originalQuantity || 1, itemStatus: 'original' as ItemStatus, originalQuantity: undefined }
                              : i
                          )
                        );
                      }}
                    >
                      <ThemedText style={styles.quantityButtonText}>↻</ThemedText>
                    </TouchableOpacity>
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
                onPress={updateKOT}
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
  orderSectionHeader: {
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#D1D1D6',
  },
  orderSectionHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#007AFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addonItem: {
    backgroundColor: '#FFF4E6',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  removedItem: {
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
    opacity: 0.7,
  },
  removedItemText: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  removedLabel: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '600',
    marginTop: 4,
    fontStyle: 'italic',
  },
  quantityDisplay: {
    alignItems: 'center',
    marginBottom: 4,
  },
});

