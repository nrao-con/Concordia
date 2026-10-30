import { useEffect, useRef, useCallback, useState } from "react";
import { getStoredKey } from "@/lib/staffApi";
import { queryClient } from "@/lib/queryClient";

async function fetchWsTicket(): Promise<string | null> {
  try {
    const res = await fetch("/api/staff/ws-ticket", { method: "POST", credentials: "include" });
    if (!res.ok) return null;
    const { ticket } = await res.json();
    return typeof ticket === "string" ? ticket : null;
  } catch {
    return null;
  }
}

export function useStaffWebSocket(enabled: boolean = true) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;
  const [isConnected, setIsConnected] = useState(false);
  const [hasNewOrder, setHasNewOrder] = useState(false);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

    // Prefer a short-lived Clerk-authenticated ticket (requireStaffKey on server)
    const ticket = await fetchWsTicket();

    let wsUrl: string;
    if (ticket) {
      wsUrl = `${protocol}//${window.location.host}/ws/staff?ticket=${encodeURIComponent(ticket)}`;
    } else {
      // Fall back to legacy API key for tablet/integration callers
      const key = getStoredKey();
      if (!key) return;
      wsUrl = `${protocol}//${window.location.host}/ws/staff?key=${encodeURIComponent(key)}`;
    }

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.channel === "orders") {
            queryClient.invalidateQueries({ queryKey: ["/api/staff/orders"] });
            if (message.type === "new_order") {
              setHasNewOrder(true);
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = () => {
        setIsConnected(false);
      };
    } catch {
      // ignore connection errors
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
      reconnectAttempts.current = 0;
      return;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect, enabled]);

  const clearNewOrder = useCallback(() => setHasNewOrder(false), []);

  return { isConnected, hasNewOrder, clearNewOrder };
}
