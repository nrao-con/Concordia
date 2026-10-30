import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./admin-sidebar";
import { BackButton } from "@/components/back-button";
import { PageTransition } from "@/components/page-transition";

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  showBackButton?: boolean;
  backTo?: string;
}

export function AdminLayout({ children, title = "Admin Panel", showBackButton = true, backTo }: AdminLayoutProps) {
  // Swap the PWA manifest to the admin-specific one while inside the admin portal.
  // This means "Add to Home Screen" creates a shortcut that opens /admin directly,
  // not the patient-facing landing page.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const original = link?.getAttribute("href") ?? "/manifest.json";
    link?.setAttribute("href", "/admin-manifest.json");
    return () => {
      link?.setAttribute("href", original);
    };
  }, []);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="admin-workspace flex min-h-[100dvh] w-full">
        <AdminSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="admin-topbar flex min-h-14 shrink-0 items-center gap-2 md:gap-4 border-b px-3 md:px-6">
            <SidebarTrigger className="shrink-0 min-h-10 min-w-10" data-testid="button-sidebar-toggle" />
            {showBackButton && <BackButton to={backTo} />}
            <div className="min-w-0 flex-1">
              <p className="admin-topbar-kicker hidden md:block">Concordia Pharmacy</p>
              <h1 className="text-base md:text-lg font-semibold truncate">{title}</h1>
            </div>
          </header>
          <main className="admin-canvas flex-1 overflow-y-auto">
            <PageTransition>
              <div className="admin-content-frame">{children}</div>
            </PageTransition>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
