import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { X, Info, AlertTriangle, AlertCircle, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { PharmacyAlert } from "@shared/schema";

const alertStyles: Record<string, { bg: string; border: string; icon: typeof Info; iconColor: string; textColor: string }> = {
  info: {
    bg: "bg-primary/10",
    border: "border-primary/40",
    icon: Info,
    iconColor: "text-primary",
    textColor: "text-primary/60",
  },
  warning: {
    bg: "bg-amber-950/90",
    border: "border-amber-500/40",
    icon: AlertTriangle,
    iconColor: "text-amber-400",
    textColor: "text-amber-200",
  },
  urgent: {
    bg: "bg-red-950/90",
    border: "border-red-500/40",
    icon: AlertCircle,
    iconColor: "text-red-400",
    textColor: "text-red-200",
  },
  closure: {
    bg: "bg-red-950/95",
    border: "border-red-600/50",
    icon: XCircle,
    iconColor: "text-red-400",
    textColor: "text-red-200",
  },
};

function getAlertStyle(type: string) {
  return alertStyles[type] || alertStyles.info;
}

export function AlertsBanner() {
  const [location] = useLocation();

  const isAdminRoute = location.startsWith("/admin");

  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => {
    try {
      const stored = sessionStorage.getItem("dismissed-alerts");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const { data: alerts = [] } = useQuery<PharmacyAlert[]>({
    queryKey: ["/api/alerts"],
    staleTime: 60000,
    refetchInterval: 120000,
    enabled: !isAdminRoute,
  });

  const dismiss = useCallback((id: number) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        sessionStorage.setItem("dismissed-alerts", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  const visibleAlerts = alerts.filter((a) => !dismissedIds.has(a.id));

  if (isAdminRoute || visibleAlerts.length === 0) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-40 pointer-events-none" data-testid="alerts-banner-container" role="region" aria-label="Pharmacy alerts">
      <div className="pointer-events-auto" aria-live="polite">
        <AnimatePresence mode="sync">
          {visibleAlerts.map((alert) => {
            const style = getAlertStyle(alert.type);
            const Icon = style.icon;

            return (
              <motion.div
                key={alert.id}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div
                  className={`${style.bg} ${style.border} border-b backdrop-blur-md`}
                  data-testid={`alert-banner-${alert.id}`}
                >
                  <div className="container mx-auto px-4 py-2.5 flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${style.iconColor} flex-shrink-0`} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      {alert.title && alert.title !== "Pharmacy Alert" && (
                        <span className={`font-semibold text-sm ${style.textColor} mr-2`} data-testid={`alert-title-${alert.id}`}>
                          {alert.title}:
                        </span>
                      )}
                      <span className={`text-sm ${style.textColor}`} data-testid={`alert-message-${alert.id}`}>
                        {alert.message}
                      </span>
                    </div>
                    <button
                      onClick={() => dismiss(alert.id)}
                      className={`${style.textColor} hover:text-white flex-shrink-0 p-1 rounded-md transition-colors`}
                      aria-label={`Dismiss alert: ${alert.title || alert.message}`}
                      data-testid={`button-dismiss-alert-${alert.id}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
