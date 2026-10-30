const STAFF_KEY_STORAGE = "concordia_staff_key";

export function getStoredKey(): string | null {
  try { return localStorage.getItem(STAFF_KEY_STORAGE); } catch { return null; }
}

export function setStoredKey(key: string): void {
  try { localStorage.setItem(STAFF_KEY_STORAGE, key); } catch {}
}

export function clearStoredKey(): void {
  try { localStorage.removeItem(STAFF_KEY_STORAGE); } catch {}
}

async function getClerkToken(): Promise<string | null> {
  try {
    const w = window as any;
    const session = w.Clerk?.session;
    if (!session) return null;
    return await session.getToken();
  } catch {
    return null;
  }
}

async function staffFetch(path: string, options?: RequestInit): Promise<Response> {
  const key = getStoredKey();
  const clerkToken = await getClerkToken();
  const authHeaders: Record<string, string> = {};
  if (clerkToken) {
    authHeaders["Authorization"] = `Bearer ${clerkToken}`;
  } else if (key) {
    authHeaders["X-STAFF-KEY"] = key;
  }
  return fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(options?.headers as Record<string, string> ?? {}),
    },
  });
}

async function staffJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await staffFetch(path, options);
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export type StaffProduct = {
  id: string;
  name: string;
  category: string;
  price: string;
  stockQuantity: number;
  inStock: boolean;
  ndc: string | null;
  externalId: string | null;
  showOnWebsite: boolean;
  showInApp: boolean;
};

export type StaffOrderItem = {
  name: string;
  quantity: number;
  price: string;
  productId: string | null;
};

export type StaffOrder = {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  paymentStatus: string | null;
  deliveryMethod: string | null;
  total: string;
  items: StaffOrderItem[];
  customer: { name: string | null; phone: string | null };
  createdAt: string;
};

export const staffApi = {
  validateKey: async (key: string): Promise<boolean> => {
    const clerkToken = await getClerkToken();
    const authHeaders: Record<string, string> = clerkToken
      ? { Authorization: `Bearer ${clerkToken}` }
      : { "X-STAFF-KEY": key };
    const res = await fetch("/api/staff/products", {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders },
    });
    return res.ok;
  },

  getProducts: (): Promise<StaffProduct[]> =>
    staffJson("/api/staff/products"),

  searchProducts: (q: string): Promise<StaffProduct[]> =>
    staffJson(`/api/staff/products/search?q=${encodeURIComponent(q)}`),

  updateStock: (id: string, delta: number): Promise<StaffProduct> =>
    staffJson(`/api/staff/products/${id}/stock`, {
      method: "PATCH",
      body: JSON.stringify({ delta }),
    }),

  updateVisibility: (
    id: string,
    body: { showOnWebsite?: boolean; showInApp?: boolean }
  ): Promise<StaffProduct> =>
    staffJson(`/api/staff/products/${id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  createProduct: (body: {
    name: string;
    category: string;
    price: string;
    stockQuantity: number;
    ndc?: string;
  }): Promise<StaffProduct> =>
    staffJson("/api/staff/products", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteProduct: (id: string): Promise<{ success: boolean }> =>
    staffJson(`/api/staff/products/${id}`, { method: "DELETE" }),

  getOrders: (status?: string): Promise<StaffOrder[]> =>
    staffJson(
      `/api/staff/orders${status ? `?status=${encodeURIComponent(status)}` : ""}`
    ),

  advanceOrderStatus: (id: string, status: string): Promise<StaffOrder> =>
    staffJson(`/api/staff/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
