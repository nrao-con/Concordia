import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { SignIn } from "@clerk/react";
import { PageTransition } from "@/components/page-transition";
import { Shield } from "lucide-react";
import { clerkAppearance } from "@/lib/clerkAppearance";
import { useAuth } from "@/hooks/useAuth";
import { useAuthBridge } from "@/contexts/authBridge";
import { SEO } from "@/components/seo";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const DEV_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV as string | undefined;
const previewHasProductionKey =
  import.meta.env.DEV &&
  !DEV_PUBLISHABLE_KEY &&
  PUBLISHABLE_KEY?.startsWith("pk_live_");

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const returnTo = params.get("returnTo") || "/admin";
  const { isAdmin, isAuthenticated, isLoading, signOut } = useAuth();
  const { isClerkEnabled } = useAuthBridge();

  // Swap PWA manifest so "Add to Home Screen" from login creates an /admin shortcut
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const original = link?.getAttribute("href") ?? "/manifest.json";
    link?.setAttribute("href", "/admin-manifest.json");
    return () => {
      link?.setAttribute("href", original);
    };
  }, []);

  // Redirect if already admin
  useEffect(() => {
    if (!isLoading && isAdmin) {
      setLocation(returnTo);
    }
  }, [isAdmin, isLoading, returnTo, setLocation]);

  return (
    <PageTransition>
      <SEO
        title="Admin Login | Concordia Pharmacy"
        description="Secure pharmacy admin portal login."
      />
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Admin Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in with your admin credentials
            </p>
          </div>
        </div>

        {previewHasProductionKey ? (
          <div className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 p-5 text-center shadow-sm">
            <h2 className="text-base font-semibold text-amber-950">
              Preview authentication is unavailable
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              This preview is using the production Clerk key, which only works
              on the published Concordia Pharmacy domain.
            </p>
            <a
              href="https://concordianyc.com/admin-login"
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Open the live admin portal
            </a>
            <p className="mt-3 text-xs text-amber-800">
              To sign in from preview, configure a Clerk development
              <code className="mx-1 font-mono">pk_test_</code> key.
            </p>
          </div>
        ) : !isLoading && isAuthenticated && !isAdmin ? (
          <div className="w-full max-w-md rounded-xl border border-destructive/20 bg-card p-6 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              Admin access required
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You are signed in, but this account is not authorized for the
              pharmacy admin portal.
            </p>
            <button
              type="button"
              onClick={() => void signOut("/admin-login")}
              className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Sign out and use another account
            </button>
          </div>
        ) : isClerkEnabled ? (
          <SignIn
            appearance={clerkAppearance}
            fallbackRedirectUrl={returnTo}
            signUpUrl="/signup"
            routing="hash"
          />
        ) : (
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Authentication is not configured in this environment. Set{" "}
            <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> to enable admin sign-in.
          </p>
        )}
      </div>
    </PageTransition>
  );
}
