import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getClerkToken } from "@/lib/clerkToken";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function getAuthenticatedHeaders(
  headers?: HeadersInit,
): Promise<Headers> {
  const authenticatedHeaders = new Headers(headers);
  const token = await getClerkToken();

  if (token) {
    authenticatedHeaders.set("Authorization", `Bearer ${token}`);
  }

  return authenticatedHeaders;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: await getAuthenticatedHeaders(init.headers),
    credentials: init.credentials ?? "include",
  });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  headers?: HeadersInit,
): Promise<Response> {
  const res = await authenticatedFetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json", ...Object.fromEntries(new Headers(headers)) } : headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await authenticatedFetch(queryKey.join("/") as string);

    if (unauthorizedBehavior === "returnNull" && (res.status === 401 || res.status === 404)) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
