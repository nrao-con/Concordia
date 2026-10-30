import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function usePageViewTracker() {
  const [location] = useLocation();
  const lastTracked = useRef("");

  useEffect(() => {
    if (location === lastTracked.current) return;
    lastTracked.current = location;

    if (location.startsWith("/admin")) return;

    // Internal page-view analytics
    const body: { path: string; referrer?: string } = { path: location };
    if (document.referrer) {
      body.referrer = document.referrer;
    }

    navigator.sendBeacon?.(
      "/api/page-views",
      new Blob([JSON.stringify(body)], { type: "application/json" }),
    ) ||
      fetch("/api/page-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});

    // Google Analytics 4 — only fire if user has accepted cookies
    const consent = localStorage.getItem("concordia_cookie_consent");
    if (consent === "accepted" && typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: location,
        page_title: document.title,
      });
    }
  }, [location]);
}
