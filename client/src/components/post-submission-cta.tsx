import { Link } from "wouter";
import { CheckCircle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const CONCORDIA_CARE_PWA_URL =
  import.meta.env.VITE_CONCORDIA_CARE_APP_URL ||
  "https://concordia-care.replit.app";

interface PostSubmissionCTAProps {
  confirmationMessage: string;
  children?: React.ReactNode;
}

export function PostSubmissionCTA({ confirmationMessage, children }: PostSubmissionCTAProps) {
  const { isLoading, isAuthenticated } = useAuth();

  return (
    <div className="space-y-5" data-testid="post-submission-cta">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15 ring-4 ring-green-500/10">
          <CheckCircle className="h-8 w-8 text-green-400" />
        </div>
        <p className="text-muted-foreground text-sm max-w-xs">{confirmationMessage}</p>
      </div>

      {children && (
        <div className="rounded-md bg-primary/5 border border-primary/15 p-4">
          {children}
        </div>
      )}

      <div className="rounded-md border border-white/10 bg-muted/30 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-medium">Continue with ConcordiaCare</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Optional: open ConcordiaCare to track prescriptions, manage refills,
          earn loyalty rewards, and message your pharmacy team. If you are
          already signed in on this device, your session will continue.
        </p>
        <Button asChild className="w-full" data-testid="button-open-concordiacare-pwa">
          <a href={CONCORDIA_CARE_PWA_URL} target="_blank" rel="noopener noreferrer">
            <Smartphone className="h-4 w-4 mr-2" />
            Continue in ConcordiaCare
          </a>
        </Button>
      </div>

      {!isLoading && !isAuthenticated && (
        <p className="text-center text-xs text-muted-foreground">
          New to Concordia Pharmacy?{" "}
          <Link
            href="/signup"
            className="text-primary hover:underline font-medium"
            data-testid="link-create-account"
          >
            Create your patient account
          </Link>{" "}
          to manage prescriptions and track deliveries.
        </p>
      )}
    </div>
  );
}
