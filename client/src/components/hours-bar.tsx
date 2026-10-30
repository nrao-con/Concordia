import { useState } from "react";
import { Phone, X, Clock } from "lucide-react";

function isStoreOpen(): boolean {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const totalMinutes = hour * 60 + minute;
  if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday)) {
    return totalMinutes >= 9 * 60 && totalMinutes < 19 * 60;
  }
  if (weekday === "Sat") {
    return totalMinutes >= 10 * 60 && totalMinutes < 16 * 60;
  }
  return false;
}

const DISMISS_KEY = "concordia_hours_bar_dismissed";

export function HoursBar() {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  if (dismissed) return null;

  const open = isStoreOpen();

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  }

  return (
    <div
      className="w-full border-b border-white/10 px-4"
      style={{ background: "rgba(10, 17, 32, 0.97)" }}
      data-testid="banner-hours-bar"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between h-9 gap-3">

        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${open ? "bg-emerald-400" : "bg-red-400"}`}
            />
            <span className={`text-xs font-semibold tracking-wide ${open ? "text-emerald-400" : "text-red-400"}`}>
              {open ? "OPEN NOW" : "CLOSED"}
            </span>
          </div>

          <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 truncate">
            <Clock className="h-3 w-3 shrink-0 text-slate-500" />
            Mon to Fri, 9AM to 7PM&nbsp;&nbsp;·&nbsp;&nbsp;Sat, 10AM to 4PM
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href="tel:+17183282833"
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors font-medium"
            data-testid="link-hoursbar-phone"
            aria-label="Call Concordia Pharmacy"
          >
            <Phone className="h-3 w-3 shrink-0" />
            <span>(718) 328-2833</span>
          </a>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            data-testid="button-hoursbar-dismiss"
            className="text-slate-600 hover:text-slate-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
