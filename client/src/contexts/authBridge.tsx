import { createContext, useContext, type ReactNode } from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/react";
import { setClerkTokenGetter } from "@/lib/clerkToken";

type ClerkUser = ReturnType<typeof useUser>["user"];

interface AuthBridgeState {
  isLoaded: boolean;
  isSignedIn: boolean;
  clerkUser: ClerkUser;
  signOut: (opts?: { redirectUrl?: string }) => Promise<void>;
  isClerkEnabled: boolean;
}

const defaultState: AuthBridgeState = {
  isLoaded: true,
  isSignedIn: false,
  clerkUser: null,
  signOut: async () => {},
  isClerkEnabled: false,
};

const AuthBridgeContext = createContext<AuthBridgeState>(defaultState);

function AuthBridgeInner({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, signOut, getToken } = useClerkAuth();
  const { user } = useUser();

  setClerkTokenGetter(() => getToken());

  return (
    <AuthBridgeContext.Provider
      value={{
        isLoaded,
        isSignedIn: isSignedIn ?? false,
        clerkUser: user,
        signOut: (opts) => signOut(opts),
        isClerkEnabled: true,
      }}
    >
      {children}
    </AuthBridgeContext.Provider>
  );
}

export function AuthBridgeProviderWithClerk({ children }: { children: ReactNode }) {
  return <AuthBridgeInner>{children}</AuthBridgeInner>;
}

export function AuthBridgeProviderNoClerk({ children }: { children: ReactNode }) {
  setClerkTokenGetter(null);

  return (
    <AuthBridgeContext.Provider value={defaultState}>
      {children}
    </AuthBridgeContext.Provider>
  );
}

export function useAuthBridge(): AuthBridgeState {
  return useContext(AuthBridgeContext);
}
