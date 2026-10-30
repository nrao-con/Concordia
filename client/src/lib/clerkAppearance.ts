import type { ComponentProps } from "react";
import { SignIn } from "@clerk/react";

type ClerkAppearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

/**
 * Clinical Arctic dark theme for all Clerk embedded components.
 * Matches the main site's midnight-slate / electric-cobalt design language.
 */
export const clerkAppearance: ClerkAppearance = {
  variables: {
    colorBackground: "hsl(222 47% 8%)",
    colorInput: "hsl(222 47% 11%)",
    colorInputForeground: "hsl(210 40% 88%)",
    colorForeground: "hsl(210 40% 88%)",
    colorMutedForeground: "hsl(215 20% 55%)",
    colorPrimary: "hsl(217 91% 60%)",
    colorDanger: "hsl(0 72% 51%)",
    colorSuccess: "hsl(142 71% 45%)",
    colorNeutral: "hsl(222 47% 15%)",
    borderRadius: "0.5rem",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontSize: "0.9rem",
  },
  elements: {
    card: {
      backgroundColor: "hsl(222 47% 10%)",
      border: "1px solid hsl(222 47% 18%)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    },
    headerTitle: {
      color: "hsl(210 40% 95%)",
      fontWeight: "700",
    },
    headerSubtitle: {
      color: "hsl(215 20% 55%)",
    },
    socialButtonsBlockButton: {
      backgroundColor: "hsl(222 47% 14%)",
      border: "1px solid hsl(222 47% 22%)",
      color: "hsl(210 40% 88%)",
    },
    formFieldInput: {
      backgroundColor: "hsl(222 47% 11%)",
      border: "1px solid hsl(222 47% 22%)",
      color: "hsl(210 40% 88%)",
    },
    formFieldLabel: {
      color: "hsl(215 20% 65%)",
    },
    formButtonPrimary: {
      backgroundColor: "hsl(217 91% 60%)",
      color: "hsl(0 0% 100%)",
      fontWeight: "600",
    },
    footerActionLink: {
      color: "hsl(217 91% 60%)",
    },
    identityPreviewText: {
      color: "hsl(210 40% 88%)",
    },
    dividerLine: {
      backgroundColor: "hsl(222 47% 18%)",
    },
    dividerText: {
      color: "hsl(215 20% 45%)",
    },
  },
};
