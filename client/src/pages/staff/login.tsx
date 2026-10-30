import { SignIn } from "@clerk/react";
import { Pill } from "lucide-react";
import { useAuthBridge } from "@/contexts/authBridge";

export function StaffLogin() {
  const { isClerkEnabled } = useAuthBridge();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Pill className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold">Concordia Staff</h1>
            <p className="text-sm text-muted-foreground">Tablet App. Staff Sign In</p>
          </div>
        </div>
        {isClerkEnabled ? (
          <SignIn routing="hash" fallbackRedirectUrl="/staff" />
        ) : (
          <p className="text-sm text-muted-foreground text-center">
            Authentication is not configured in this environment.
          </p>
        )}
      </div>
    </div>
  );
}
