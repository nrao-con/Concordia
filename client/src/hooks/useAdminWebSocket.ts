import { useCallback, useEffect, useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";

type WebSocketMessage = {
  channel: string;
  type?: "new" | "update" | "delete";
  data?: unknown;
};

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function invalidate(channel: string, data: unknown) {
  switch (channel) {
    case "blister-patients":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blister-patients"] });
      break;
    case "transfer-requests":
    case "transfer_requests":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transfer-requests"] });
      break;
    case "flu-shots":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/flu-shot-appointments"] });
      break;
    case "orders":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      break;
    case "prescriptions":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prescriptions"] });
      break;
    case "specialty-requests":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialty-fulfillment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attention-counts"] });
      break;
    case "ltc_lead":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ltc-leads"] });
      break;
    case "savings_request":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/savings-requests"] });
      break;
    case "urgent_refills":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/urgent-refills"] });
      break;
    case "patient_request":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/patient-requests"] });
      break;
    case "conversion-leads":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversion-leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attention-counts"] });
      break;
    case "restock-notifications":
    case "restock_notifications":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restock-notifications"] });
      break;
    case "contact-submissions":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contact-submissions"] });
      break;
    case "fraud-alerts":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-alerts"] });
      break;
    case "wallet:updated": {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const userId =
        typeof data === "object" && data !== null && "userId" in data
          ? (data as { userId?: string | number }).userId
          : undefined;
      if (userId !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/points/wallet", userId] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/points/ledger", userId] });
      }
      break;
    }
    case "user:updated":
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points/analytics"] });
      break;
    default:
      // Unexpected server messages should not fill production logs.
      if (import.meta.env.DEV) {
        console.debug("Unknown admin WebSocket channel:", channel);
      }
  }
}

export function useAdminWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(false);
  const connectRef = useRef<() => void>(() => undefined);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current || reconnectTimeoutRef.current !== null) {
      return;
    }

    const attempt = reconnectAttemptsRef.current;
    reconnectAttemptsRef.current = Math.min(attempt + 1, 30);
    const exponentialDelay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** Math.min(attempt, 10),
      MAX_RECONNECT_DELAY_MS,
    );
    // Jitter prevents clients that disconnected together from reconnecting together.
    const delay = Math.floor(exponentialDelay * (0.8 + Math.random() * 0.2));

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    const currentSocket = wsRef.current;
    if (
      currentSocket?.readyState === WebSocket.OPEN ||
      currentSocket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    clearReconnectTimeout();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/admin`;

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isMountedRef.current || wsRef.current !== socket) return;
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          if (typeof message.channel !== "string") {
            throw new Error("WebSocket message is missing a channel");
          }
          invalidate(message.channel, message.data);
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error("Error parsing admin WebSocket message:", error);
          }
        }
      };

      socket.onclose = () => {
        if (wsRef.current !== socket) return;
        wsRef.current = null;
        if (!isMountedRef.current) return;
        setIsConnected(false);
        scheduleReconnect();
      };

      socket.onerror = () => {
        // Closing ensures a failed socket follows the same reconnect path.
        socket.close();
      };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to create admin WebSocket connection:", error);
      }
      setIsConnected(false);
      scheduleReconnect();
    }
  }, [clearReconnectTimeout, scheduleReconnect]);

  connectRef.current = connect;

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    const reconnectWhenAvailable = () => {
      const socketState = wsRef.current?.readyState;
      if (socketState !== WebSocket.OPEN && socketState !== WebSocket.CONNECTING) {
        clearReconnectTimeout();
        connectRef.current();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconnectWhenAvailable();
      }
    };

    window.addEventListener("online", reconnectWhenAvailable);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      clearReconnectTimeout();
      window.removeEventListener("online", reconnectWhenAvailable);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const socket = wsRef.current;
      wsRef.current = null;
      socket?.close();
    };
  }, [clearReconnectTimeout, connect]);

  return { isConnected };
}