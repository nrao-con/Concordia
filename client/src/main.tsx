import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { AuthBridgeProviderWithClerk, AuthBridgeProviderNoClerk } from "@/contexts/authBridge";
import App from "./App";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const DEV_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV as string | undefined;
const EXTERNAL_PUBLISHABLE_KEY = import.meta.env
  .VITE_EXTERNAL_CLERK_PUBLISHABLE_KEY as string | undefined;
const USE_DIRECT_CLERK = import.meta.env.VITE_USE_DIRECT_CLERK === "true";

const isValidClerkKey = (key: string | undefined): key is string =>
  typeof key === "string" &&
  (key.startsWith("pk_live_") || key.startsWith("pk_test_")) &&
  key !== "pk_test_placeholder";

const root = createRoot(document.getElementById("root")!);

// A production Clerk key is restricted to the published domain and cannot
// initialize on a Replit preview origin. Use a pk_test_ key for preview auth;
// keep pk_live_ exclusively on the published app.
const ACTIVE_PUBLISHABLE_KEY = import.meta.env.DEV
  ? (DEV_PUBLISHABLE_KEY || PUBLISHABLE_KEY)
  : (USE_DIRECT_CLERK ? EXTERNAL_PUBLISHABLE_KEY : PUBLISHABLE_KEY);
const CLERK_PUBLISHABLE_KEY = publishableKeyFromHost(
  window.location.hostname,
  ACTIVE_PUBLISHABLE_KEY,
);
const CLERK_PROXY_URL = import.meta.env.VITE_CLERK_PROXY_URL;

const canUseClerkOnThisOrigin =
  isValidClerkKey(CLERK_PUBLISHABLE_KEY) &&
  (!import.meta.env.DEV || !CLERK_PUBLISHABLE_KEY.startsWith("pk_live_"));

if (canUseClerkOnThisOrigin) {
  root.render(
    <HelmetProvider>
      <ClerkProvider
        publishableKey={CLERK_PUBLISHABLE_KEY}
        proxyUrl={USE_DIRECT_CLERK ? undefined : CLERK_PROXY_URL}
        afterSignOutUrl="/"
      >
        <AuthBridgeProviderWithClerk>
          <App />
        </AuthBridgeProviderWithClerk>
      </ClerkProvider>
    </HelmetProvider>
  );
} else {
  root.render(
    <HelmetProvider>
      <AuthBridgeProviderNoClerk>
        <App />
      </AuthBridgeProviderNoClerk>
    </HelmetProvider>
  );
}
