import { useAuthBridge } from "@/contexts/authBridge";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

interface AttendantSession {
  attendant: {
    id: number;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email: string | null;
    status: string;
  };
  patients: Array<{
    linkId: number;
    patientId: string;
    firstName: string | null;
    lastName: string | null;
    relationshipType: string;
  }>;
  actingPatientId: string | null;
}

export function useAuth() {
  const { isLoaded: clerkLoaded, isSignedIn, clerkUser, signOut: clerkSignOut } = useAuthBridge();

  const {
    data: user,
    isLoading: userLoading,
    isError: localUserError,
    refetch: refetchUser,
  } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: clerkLoaded && isSignedIn === true,
    retry: false,
  });

  const { data: attendantSession, isLoading: attendantLoading } = useQuery<AttendantSession | null>({
    queryKey: ["/api/attendant/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  const isLoading = !clerkLoaded || userLoading || attendantLoading;
  // A Clerk session alone is not enough for patient-only API calls. Consumers
  // that need a local patient record can use these values rather than treating
  // the short hydration window (or a failed local lookup) as a guest session.
  const localUserLoading = clerkLoaded && isSignedIn === true && userLoading;
  const patientAuthReady =
    clerkLoaded &&
    (isSignedIn !== true || (!!user && !userLoading && !localUserError));

  const isCaregiver = !!attendantSession?.attendant;
  const actingPatientId = attendantSession?.actingPatientId || null;
  const hasSelectedPatient = isCaregiver && !!actingPatientId;

  const isAuthenticated = isSignedIn === true || hasSelectedPatient;

  const isAdmin =
    clerkUser?.publicMetadata?.role === "admin" ||
    (isSignedIn === true && user?.role === "admin") ||
    false;

  async function signOut(redirectUrl = "/") {
    await clerkSignOut({ redirectUrl });
  }

  return {
    user,
    isLoading,
    clerkLoaded,
    isSignedIn,
    localUserLoading,
    localUserError,
    patientAuthReady,
    refetchUser,
    isAuthenticated,
    isAdmin,
    isCaregiver,
    hasSelectedPatient,
    actingPatientId,
    attendantSession,
    signOut,
  };
}
