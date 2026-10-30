import { Link } from "wouter";
import { SignUp } from "@clerk/react";
import { PageTransition } from "@/components/page-transition";
import { Pill } from "lucide-react";
import { clerkAppearance } from "@/lib/clerkAppearance";
import { SEO } from "@/components/seo";
import { useAuthBridge } from "@/contexts/authBridge";

export default function Signup() {
  const { isClerkEnabled } = useAuthBridge();

  return (
    <PageTransition>
      <SEO
        title="Create Account | Concordia Pharmacy"
        description="Join Concordia Pharmacy for easy prescription management, OTC shopping, and personalized care."
      />
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20">
            <Pill className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Create Your Account</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Join Concordia Pharmacy for personalized care
            </p>
          </div>
        </div>

        {isClerkEnabled ? (
          <SignUp
            appearance={clerkAppearance}
            fallbackRedirectUrl="/complete-profile"
            signInUrl="/login"
            routing="hash"
          />
        ) : (
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Authentication is not configured in this environment. Set{" "}
            <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> to enable sign-up.
          </p>
        )}

        <p className="mt-6 text-sm text-muted-foreground text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </PageTransition>
  );
}
