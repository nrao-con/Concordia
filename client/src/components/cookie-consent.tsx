import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "concordia_cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible || !bannerRef.current) {
      document.documentElement.style.removeProperty("--cookie-banner-offset");
      return;
    }

    const banner = bannerRef.current;
    const updateOffset = () => {
      document.documentElement.style.setProperty(
        "--cookie-banner-offset",
        `${Math.ceil(banner.getBoundingClientRect().height) + 8}px`,
      );
    };
    updateOffset();
    const observer = new ResizeObserver(updateOffset);
    observer.observe(banner);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--cookie-banner-offset");
    };
  }, [visible]);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: "granted",
        ad_storage: "denied",
      });
    }
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(STORAGE_KEY, "declined");
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
      });
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[2147483647] border-t border-white/10 px-4 py-3 sm:px-6"
      style={{ background: "rgba(15, 23, 42, 0.97)" }}
      role="dialog"
      aria-label="Cookie consent"
      data-testid="banner-cookie-consent"
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Cookie className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-400 leading-relaxed">
            We use essential cookies to keep this site secure and functional. Analytics cookies help us improve your experience.
            {" "}
            <Link href="/privacy-policy">
              <span className="text-slate-300 underline underline-offset-2 cursor-pointer hover:text-white transition-colors">
                Privacy Policy
              </span>
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={decline}
            data-testid="button-cookie-decline"
            className="border-slate-500 bg-transparent text-xs text-white hover:bg-slate-800 hover:text-white"
          >
            Decline
          </Button>
          <Button
            size="sm"
            onClick={accept}
            data-testid="button-cookie-accept"
            className="text-xs"
          >
            Accept
          </Button>
          <button
            type="button"
            onClick={decline}
            aria-label="Dismiss"
            data-testid="button-cookie-dismiss"
            className="text-slate-500 hover:text-slate-300 transition-colors ml-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
