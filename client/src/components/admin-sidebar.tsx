import { useState } from "react";
import QRCode from "react-qr-code";
import { Link, useLocation } from "wouter";
import concordiaLogo from "@assets/concordia_logo_trimmed_transparent.png";
import {
  LayoutDashboard,
  Package,
  Users,
  Pill,
  BarChart3,
  LogOut,
  Activity,
  TrendingUp,
  Syringe,
  Shield,
  FileText,
  Bell,
  RefreshCw,
  Clock,
  Gift,
  ClipboardList,
  UserCheck,
  Stethoscope,
  Flame,
  Building2,
  BadgeDollarSign,
  Mail,
  BellRing,
  QrCode,
  Copy,
  Check,
  Boxes,
  HeartPulse,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AttentionLevel = "none" | "low" | "medium" | "high";

interface AttentionCounts {
  urgentRefills: { count: number; urgentCount: number; normalCount: number; level: AttentionLevel };
  transferRequests: { count: number; level: AttentionLevel };
  insuranceHelp: { count: number; level: AttentionLevel };
  caregiverRequests: { count: number; level: AttentionLevel };
  conversionLeads: { count: number; level: AttentionLevel };
  specialtyRequests: { count: number; level: AttentionLevel };
}

type MenuItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  attentionKey: keyof AttentionCounts | null;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

const menuSections: MenuSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard, attentionKey: null },
    ],
  },
  {
    label: "Patients & Care",
    items: [
      { title: "Patients", url: "/admin/patients", icon: Users, attentionKey: null },
      { title: "Blister Patients", url: "/admin/blister-patients", icon: Package, attentionKey: null },
      { title: "Insurance Help", url: "/admin/insurance-help", icon: Shield, attentionKey: "insuranceHelp" },
      { title: "Access Requests", url: "/admin/caregiver-requests", icon: UserCheck, attentionKey: "caregiverRequests" },
      { title: "Flu Shots", url: "/admin/flu-shots", icon: Syringe, attentionKey: null },
    ],
  },
  {
    label: "Rx & Workflow",
    items: [
      { title: "Prescriptions", url: "/admin/prescriptions", icon: Pill, attentionKey: null },
      { title: "PharmFlow Queue", url: "/admin/patient-requests", icon: ClipboardList, attentionKey: null },
      { title: "Urgent Refills", url: "/admin/urgent-refills", icon: Clock, attentionKey: "urgentRefills" },
      { title: "Transfer Requests", url: "/admin/transfer-requests", icon: RefreshCw, attentionKey: "transferRequests" },
      { title: "Specialty Requests", url: "/admin/specialty-requests", icon: Pill, attentionKey: "specialtyRequests" },
      { title: "Prior Auth (PA)", url: "/admin/pa-requests", icon: FileText, attentionKey: null },
      { title: "PA Analytics", url: "/admin/pa-analytics", icon: BarChart3, attentionKey: null },
    ],
  },
  {
    label: "Find a Doctor",
    items: [
      { title: "Doctor Directory", url: "/admin/doctors", icon: Stethoscope, attentionKey: null },
      { title: "Doctor Partners", url: "/admin/doctor-partners", icon: Stethoscope, attentionKey: null },
      { title: "Doctor Match Leads", url: "/admin/doctor-match-leads", icon: ClipboardList, attentionKey: null },
    ],
  },
  {
    label: "Leads & Growth",
    items: [
      { title: "Conversion Leads", url: "/admin/conversion-leads", icon: Flame, attentionKey: "conversionLeads" },
      { title: "LTC Leads", url: "/admin/ltc-leads", icon: Building2, attentionKey: null },
      { title: "Rx Savings Requests", url: "/admin/savings-requests", icon: BadgeDollarSign, attentionKey: null },
      { title: "Restock Alerts", url: "/admin/restock-notifications", icon: BellRing, attentionKey: null },
      { title: "Contact Submissions", url: "/admin/contact-submissions", icon: Mail, attentionKey: null },
    ],
  },
  {
    label: "Loyalty & Content",
    items: [
      { title: "Rewards Program", url: "/admin/rewards", icon: Gift, attentionKey: null },
      { title: "Write Blog", url: "/admin/blog", icon: FileText, attentionKey: null },
    ],
  },
  {
    label: "Inventory",
    items: [
      { title: "Products", url: "/admin/inventory", icon: Boxes, attentionKey: null },
    ],
  },
  {
    label: "Reports",
    items: [
      { title: "Sales Reports", url: "/admin/sales", icon: TrendingUp, attentionKey: null },
      { title: "Analytics", url: "/admin/analytics", icon: BarChart3, attentionKey: null },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Pharmacy Alerts", url: "/admin/alerts", icon: Bell, attentionKey: null },
      { title: "Notification Settings", url: "/admin/notification-settings", icon: Bell, attentionKey: null },
      { title: "Email Templates", url: "/admin/email-template", icon: Mail, attentionKey: null },
      { title: "PrimeRx Sync", url: "/admin/primerx-sync", icon: Activity, attentionKey: null },
      { title: "Integration Health", url: "/admin/integration-health", icon: HeartPulse, attentionKey: null },
      { title: "API Docs", url: "/admin/api-docs", icon: FileText, attentionKey: null },
    ],
  },
];

function getAttentionBadgeColor(level: AttentionLevel): string {
  switch (level) {
    case "high":
      return "bg-red-500 text-white hover:bg-red-600";
    case "medium":
      return "bg-yellow-500 text-yellow-950";
    case "low":
      return "bg-green-500 text-white hover:bg-green-600";
    default:
      return "";
  }
}

export function AdminSidebar() {
  const [location] = useLocation();
  const { toast } = useToast();
  const { signOut } = useAuth();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  // Lets the admin paste their production URL when viewing from the dev preview.
  // Saved to localStorage so it survives page refreshes.
  const [customProdUrl, setCustomProdUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("adminProdUrl") ?? "";
  });

  const devBaseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const isLiveSite = typeof window !== "undefined" && !window.location.hostname.includes(".replit.dev") && window.location.hostname !== "localhost";
  // Use the custom URL the admin pasted (in dev), or the live origin (in prod).
  const effectiveBase = isLiveSite ? devBaseUrl : (customProdUrl.replace(/\/$/, "") || devBaseUrl);
  const adminUrl = `${effectiveBase}/admin`;

  const handleCustomUrlChange = (val: string) => {
    setCustomProdUrl(val);
    localStorage.setItem("adminProdUrl", val);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(adminUrl).then(() => {
      setCopied(true);
      toast({ title: "Link copied!", description: "Paste it in any browser to open the admin panel." });
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ title: "Could not copy", description: "Please copy the link manually from the dialog.", variant: "destructive" });
    });
  };

  // Fetch attention counts for sidebar badges
  const { data: attentionCounts } = useQuery<AttentionCounts>({
    queryKey: ["/api/admin/attention-counts"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/logout", {});
    },
    onSuccess: async () => {
      queryClient.clear();
      toast({
        title: "Logged out",
        description: "Admin session ended successfully.",
      });
      // Sign out of Clerk completely so the session is actually terminated
      await signOut("/");
    },
  });

  const handleLogout = () => {
    setShowLogoutDialog(true);
  };

  const confirmLogout = () => {
    logoutMutation.mutate();
    setShowLogoutDialog(false);
  };

  const getItemAttention = (attentionKey: string | null) => {
    if (!attentionKey || !attentionCounts) return null;
    const attention = attentionCounts[attentionKey as keyof AttentionCounts];
    if (!attention || attention.level === "none") return null;
    return attention;
  };

  return (
    <Sidebar className="admin-sidebar">
      <SidebarHeader className="admin-sidebar-header border-b px-4 py-5">
        <div className="flex items-center gap-3">
          <img src={concordiaLogo} alt="Concordia Pharmacy" className="h-auto w-full max-w-[188px]" decoding="async" width="188" height="52" />
        </div>
        <p className="admin-sidebar-subtitle mt-3">Pharmacy operations</p>
      </SidebarHeader>
      <SidebarContent data-lenis-prevent>
        {menuSections.map((section) => (
          <SidebarGroup key={section.label} className="admin-sidebar-group">
            <SidebarGroupLabel className="admin-sidebar-label">{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const attention = getItemAttention(item.attentionKey);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        className="admin-sidebar-item"
                        asChild
                        isActive={location === item.url}
                        data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span className="flex-1">{item.title}</span>
                          {attention && (
                            <Badge
                              className={`admin-count-badge ml-auto text-xs ${getAttentionBadgeColor(attention.level)}`}
                              data-testid={`badge-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              {attention.count}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="admin-sidebar-footer border-t p-4 flex flex-col gap-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowQrDialog(true)}
          data-testid="button-admin-download-app"
        >
          <QrCode className="mr-2 h-4 w-4" />
          Download Admin App
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          data-testid="button-admin-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {logoutMutation.isPending ? "Logging out..." : "Logout"}
        </Button>
      </SidebarFooter>

      {/* Download Admin App QR Dialog */}
      <Dialog open={showQrDialog} onOpenChange={(open) => { setShowQrDialog(open); if (!open) setCopied(false); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-admin-qr">
          <DialogHeader>
            <DialogTitle className="text-center">Admin Panel on Mobile</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <img src={concordiaLogo} alt="Concordia Pharmacy" className="h-8 w-auto" decoding="async" width="160" height="32" />

            {/* When on the live site: simple instructions */}
            {isLiveSite ? (
              <p className="text-sm text-muted-foreground text-center">
                Scan with your phone, tap the link, then choose{" "}
                <span className="font-medium text-foreground">"Add to Home Screen"</span>.{" "}
                The icon opens straight into the admin panel.
              </p>
            ) : (
              /* Dev preview: let admin paste their production URL so the QR is correct */
              <div className="w-full flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground text-center">
                  Paste your published site URL so the QR points to production, not this dev preview.
                </p>
                <input
                  type="url"
                  placeholder="https://your-app.replit.app"
                  value={customProdUrl}
                  onChange={(e) => handleCustomUrlChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  data-testid="input-prod-url"
                />
              </div>
            )}

            <div className="rounded-md bg-white p-3 shadow-sm">
              <QRCode
                value={adminUrl}
                size={180}
                data-testid="img-admin-qr-code"
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <p className="text-xs text-muted-foreground break-all text-center">{adminUrl}</p>
              {isLiveSite ? (
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/5 text-[10px]">
                  Live site
                </Badge>
              ) : customProdUrl ? (
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/5 text-[10px]">
                  Production URL set
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/5 text-[10px]">
                  Dev preview. Paste your production URL above.
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCopyLink}
              data-testid="button-admin-copy-link"
            >
              {copied ? (
                <Check className="mr-2 h-4 w-4 text-green-500" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to leave?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be logged out of your admin session and redirected to the home page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-admin-logout-cancel">No</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLogout}
              data-testid="button-admin-logout-confirm"
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
