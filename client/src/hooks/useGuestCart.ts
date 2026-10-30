import { useState, useCallback, useEffect } from "react";
import { getQuantityAfterAdd } from "@shared/cart-utils";

export interface GuestCartItem {
  productId: string;
  quantity: number;
  addedAt: number;
}

const GUEST_CART_KEY = "concordia_guest_cart";
const GUEST_CART_TS_KEY = "concordia_guest_cart_ts";
const CART_EXPIRY_MS = 30 * 60 * 1000;

function isCartExpired(): boolean {
  const ts = localStorage.getItem(GUEST_CART_TS_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts, 10) > CART_EXPIRY_MS;
}

function loadCart(): GuestCartItem[] {
  try {
    if (isCartExpired()) {
      localStorage.removeItem(GUEST_CART_KEY);
      localStorage.removeItem(GUEST_CART_TS_KEY);
      return [];
    }
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GuestCartItem[];
  } catch {
    return [];
  }
}

const GUEST_CART_UPDATED_EVENT = "concordia:guest-cart-updated";

function saveCart(items: GuestCartItem[]) {
  if (items.length === 0) {
    localStorage.removeItem(GUEST_CART_KEY);
    localStorage.removeItem(GUEST_CART_TS_KEY);
  } else {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    if (!localStorage.getItem(GUEST_CART_TS_KEY)) {
      localStorage.setItem(GUEST_CART_TS_KEY, Date.now().toString());
    }
  }
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent(GUEST_CART_UPDATED_EVENT));
  });
}

export function clearGuestCart() {
  localStorage.removeItem(GUEST_CART_KEY);
  localStorage.removeItem(GUEST_CART_TS_KEY);
}

export function getGuestCartItems(): GuestCartItem[] {
  return loadCart();
}

export function useGuestCart() {
  const [items, setItems] = useState<GuestCartItem[]>(loadCart);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === GUEST_CART_KEY || e.key === GUEST_CART_TS_KEY) {
        setItems(loadCart());
      }
    };
    const handleCustom = () => setItems(loadCart());
    window.addEventListener("storage", handleStorage);
    window.addEventListener(GUEST_CART_UPDATED_EVENT, handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(GUEST_CART_UPDATED_EVENT, handleCustom);
    };
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const ts = localStorage.getItem(GUEST_CART_TS_KEY);
    if (!ts) return;
    const elapsed = Date.now() - parseInt(ts, 10);
    const remaining = CART_EXPIRY_MS - elapsed;
    if (remaining <= 0) {
      clearGuestCart();
      setItems([]);
      return;
    }
    const timer = setTimeout(() => {
      clearGuestCart();
      setItems([]);
    }, remaining);
    return () => clearTimeout(timer);
  }, [items]);

  const addItem = useCallback((productId: string, quantity = 1, maxQuantity?: number) => {
    const currentItems = loadCart();
    const existing = currentItems.find((i) => i.productId === productId);
    const requestedQuantity = Math.max(1, Math.floor(quantity));
    const availableQuantity =
      maxQuantity === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(maxQuantity));
    let next: GuestCartItem[];
    if (existing) {
      const nextQuantity = getQuantityAfterAdd(
        existing.quantity,
        requestedQuantity,
        availableQuantity,
      );
      if (nextQuantity <= 0) return;
      next = currentItems.map((i) =>
        i.productId === productId
          ? { ...i, quantity: nextQuantity }
          : i
      );
    } else {
      const nextQuantity = getQuantityAfterAdd(0, requestedQuantity, availableQuantity);
      if (nextQuantity <= 0) return;
      next = [...currentItems, { productId, quantity: nextQuantity, addedAt: Date.now() }];
    }
    saveCart(next);
    setItems(next);
  }, []);

  const removeItem = useCallback((productId: string) => {
    const next = loadCart().filter((i) => i.productId !== productId);
    saveCart(next);
    setItems(next);
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number, maxQuantity?: number) => {
    const currentItems = loadCart();
    if (quantity <= 0) {
      const next = currentItems.filter((i) => i.productId !== productId);
      saveCart(next);
      setItems(next);
      return;
    }
    const cappedQuantity =
      maxQuantity === undefined
        ? Math.floor(quantity)
        : Math.min(Math.floor(quantity), Math.max(0, Math.floor(maxQuantity)));
    if (cappedQuantity <= 0) {
      const next = currentItems.filter((i) => i.productId !== productId);
      saveCart(next);
      setItems(next);
      return;
    }
    const next = currentItems.map((i) =>
      i.productId === productId ? { ...i, quantity: cappedQuantity } : i
    );
    saveCart(next);
    setItems(next);
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    clearGuestCart();
  }, []);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, addItem, removeItem, updateQuantity, clearCart, itemCount };
}
