type ClerkTokenGetter = () => Promise<string | null>;

let clerkTokenGetter: ClerkTokenGetter | null = null;

export function setClerkTokenGetter(getToken: ClerkTokenGetter | null): void {
  clerkTokenGetter = getToken;
}

export async function getClerkToken(): Promise<string | null> {
  if (clerkTokenGetter) {
    try {
      const token = await clerkTokenGetter();
      if (token) return token;
    } catch {
      // Fall through to Clerk's active browser session.
    }
  }

  try {
    const clerk = (window as typeof window & {
      Clerk?: {
        session?: {
          getToken: () => Promise<string | null>;
        } | null;
      };
    }).Clerk;
    return await clerk?.session?.getToken() ?? null;
  } catch {
    return null;
  }
}