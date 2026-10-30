import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { SignIn } from "@clerk/react";
import { PageTransition } from "@/components/page-transition";
import { Pill } from "lucide-react";
import { clerkAppearance } from "@/lib/clerkAppearance";
import { SEO } from "@/components/seo";
import { useAuth } from "@/hooks/useAuth";
import { useAuthBridge } from "@/contexts/authBridge";

export default function Login() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const { isClerkEnabled } = useAuthBridge();

  // Redirect already-authenticated users — admins go to /admin, patients to /profile
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation(isAdmin ? "/admin" : "/profile");
    }
  }, [isAuthenticated, isAdmin, isLoading, setLocation]);

  return (
    <PageTransition>
      <SEO
        title="Sign In | Concordia Pharmacy"
        description="Sign in to Concordia Pharmacy to manage your prescriptions, orders, and health information."
      />
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20">
            <Pill className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Welcome Back</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to your Concordia Pharmacy account
            </p>
          </div>
        </div>

        {isClerkEnabled ? (
          <SignIn
            appearance={clerkAppearance}
            fallbackRedirectUrl="/profile"
            signUpUrl="/signup"
            routing="hash"
          />
        ) : (
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Authentication is not configured in this environment. Set{" "}
            <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> to enable sign-in.
          </p>
        )}

        <p className="mt-6 text-sm text-muted-foreground text-center">
          New patient?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </PageTransition>
  );
}
