import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { InventorySync } from "@/components/inventory-sync";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useGuestCartSync } from "@/hooks/useGuestCartSync";
import { MotionConfig } from "framer-motion";
import { PharmacyLoader } from "@/components/pharmacy-loader";
import { CookieConsent } from "@/components/cookie-consent";
import { HoursBar } from "@/components/hours-bar";
import { usePageViewTracker } from "@/hooks/usePageViewTracker";
import { useLenis, getLenis } from "@/hooks/useLenis";
import { ErrorBoundary } from "@/components/error-boundary";

// Static imports — must be in the initial bundle
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

// Lazy-loaded components (not needed on initial paint)
const ChatWidget = lazy(() => import("@/components/chat-widget").then(m => ({ default: m.ChatWidget })));

// Lazy-loaded public pages
const Signup = lazy(() => import("@/pages/signup"));
const Login = lazy(() => import("@/pages/login"));
const CompleteProfile = lazy(() => import("@/pages/complete-profile"));
const ScheduleFluShot = lazy(() => import("@/pages/schedule-flu-shot"));
const Shop = lazy(() => import("@/pages/shop"));
const Cart = lazy(() => import("@/pages/cart"));
const ExpressCheckout = lazy(() => import("@/pages/express-checkout"));
const Specialty = lazy(() => import("@/pages/specialty"));
const LTCPartnership = lazy(() => import("@/pages/ltc-partnership"));
const Blog = lazy(() => import("@/pages/blog"));
const BlogPostPage = lazy(() => import("@/pages/blog-post"));
const AboutUs = lazy(() => import("@/pages/about"));
const FAQ = lazy(() => import("@/pages/faq"));
const Contact = lazy(() => import("@/pages/contact"));
const FindDoctor = lazy(() => import("@/pages/find-doctor"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy-policy"));
const TermsOfService = lazy(() => import("@/pages/terms-of-service"));
const CookiePolicy = lazy(() => import("@/pages/cookie-policy"));
const Accessibility = lazy(() => import("@/pages/accessibility"));
const NonDiscrimination = lazy(() => import("@/pages/non-discrimination"));
const Sitemap = lazy(() => import("@/pages/sitemap"));
const Wellness = lazy(() => import("@/pages/wellness"));
const RxSavings = lazy(() => import("@/pages/rx-savings"));
const MyTickets = lazy(() => import("@/pages/my-tickets"));
const MyOrders = lazy(() => import("@/pages/my-orders"));
const Profile = lazy(() => import("@/pages/profile"));

// Lazy-loaded admin + staff pages
const AdminLogin = lazy(() => import("@/pages/admin-login"));
const ApiDocs = lazy(() => import("@/pages/api-docs"));
const StaffApp = lazy(() => import("@/pages/staff"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminPrescriptions = lazy(() => import("@/pages/admin/prescriptions"));
const AdminAnalytics = lazy(() => import("@/pages/admin/analytics"));
const AdminCustomers = lazy(() => import("@/pages/admin/customers"));
const AdminSales = lazy(() => import("@/pages/admin/sales"));
const AdminInsuranceHelp = lazy(() => import("@/pages/admin/insurance-help"));
const AdminFluShots = lazy(() => import("@/pages/admin/flu-shots"));
const PrimeRxSync = lazy(() => import("@/pages/admin/primerx-sync"));
const AdminBlog = lazy(() => import("@/pages/admin/blog"));
const AdminAlerts = lazy(() => import("@/pages/admin/alerts"));
const AdminBlisterPatients = lazy(() => import("@/pages/admin/blister-patients"));
const AdminTransferRequests = lazy(() => import("@/pages/admin/transfer-requests"));
const AdminUrgentRefills = lazy(() => import("@/pages/admin/urgent-refills"));
const AdminStaffEmails = lazy(() => import("@/pages/admin/staff-emails"));
const AdminRewards = lazy(() => import("@/pages/admin/rewards"));
const AdminPatientRequests = lazy(() => import("@/pages/admin/patient-requests"));
const AdminCaregiverRequests = lazy(() => import("@/pages/admin/caregiver-requests"));
const AdminDoctors = lazy(() => import("@/pages/admin/doctors"));
const AdminDoctorPartners = lazy(() => import("@/pages/admin/doctor-partners"));
const AdminDoctorMatchLeads = lazy(() => import("@/pages/admin/doctor-match-leads"));
const AdminNotificationSettings = lazy(() => import("@/pages/admin/notification-settings"));
const AdminEmailTemplate = lazy(() => import("@/pages/admin/email-template"));
const AdminPatientProfile = lazy(() => import("@/pages/admin/patient-profile"));
const AdminPatientsList = lazy(() => import("@/pages/admin/patients-list"));
const AdminConversionLeads = lazy(() => import("@/pages/admin/conversion-leads"));
const AdminMilestonePatients = lazy(() => import("@/pages/admin/milestone-patients"));
const AdminSpecialtyRequests = lazy(() => import("@/pages/admin/specialty-requests"));
const AdminLtcLeads = lazy(() => import("@/pages/admin/ltc-leads"));
const AdminRestockNotifications = lazy(() => import("@/pages/admin/restock-notifications"));
const AdminSavingsRequests = lazy(() => import("@/pages/admin/savings-requests"));
const AdminInventory = lazy(() => import("@/pages/admin/inventory"));
const AdminPaRequests = lazy(() => import("@/pages/admin/pa-requests"));
const AdminPaAnalytics = lazy(() => import("@/pages/admin/pa-analytics"));
const AdminContactSubmissions = lazy(() => import("@/pages/admin/contact-submissions"));
const IntegrationHealth = lazy(() => import("@/pages/admin/integration-health"));
const PaSign = lazy(() => import("@/pages/pa-sign"));

const PageFallback = (
  <div className="min-h-screen flex items-center justify-center">
    <PharmacyLoader size="lg" text="Loading..." />
  </div>
);

function AdminGuard({ component: Component }: { component: React.ComponentType }) {
  const [location] = useLocation();
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PharmacyLoader size="lg" text="Checking access..." />
      </div>
    );
  }

  if (!isAdmin) {
    const returnTo = encodeURIComponent(location);
    return <Redirect to={`/admin-login?returnTo=${returnTo}`} />;
  }

  return <Component />;
}

function Router() {
  const { isLoading } = useAuth();
  useGuestCartSync();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PharmacyLoader size="lg" text="Loading..." />
      </div>
    );
  }

  return (
    <Suspense fallback={PageFallback}>
      <Switch>
        {/* Public routes */}
        <Route path="/" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/complete-profile" component={CompleteProfile} />
        <Route path="/schedule-flu-shot" component={ScheduleFluShot} />
        <Route path="/shop" component={Shop} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={ExpressCheckout} />
        <Route path="/express-checkout" component={ExpressCheckout} />
        <Route path="/specialty" component={Specialty} />
        <Route path="/ltc-partnership" component={LTCPartnership} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPostPage} />
        <Route path="/about" component={AboutUs} />
        <Route path="/faq" component={FAQ} />
        <Route path="/contact" component={Contact} />
        <Route path="/find-doctor" component={FindDoctor} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/terms-of-service" component={TermsOfService} />
        <Route path="/cookie-policy" component={CookiePolicy} />
        <Route path="/accessibility" component={Accessibility} />
        <Route path="/non-discrimination" component={NonDiscrimination} />
        <Route path="/sitemap" component={Sitemap} />
        <Route path="/wellness" component={Wellness} />
        <Route path="/rx-savings" component={RxSavings} />
        <Route path="/my-tickets" component={MyTickets} />
        <Route path="/my-orders" component={MyOrders} />
        <Route path="/profile" component={Profile} />
        {/* Admin routes — protected by PIN via AdminGuard */}
        <Route path="/admin-login" component={AdminLogin} />
        <Route path="/admin/api-docs">{() => <AdminGuard component={ApiDocs} />}</Route>
        <Route path="/admin">{() => <AdminGuard component={AdminDashboard} />}</Route>
        <Route path="/admin/customers">{() => <AdminGuard component={AdminCustomers} />}</Route>
        <Route path="/admin/prescriptions">{() => <AdminGuard component={AdminPrescriptions} />}</Route>
        <Route path="/admin/sales">{() => <AdminGuard component={AdminSales} />}</Route>
        <Route path="/admin/analytics">{() => <AdminGuard component={AdminAnalytics} />}</Route>
        <Route path="/admin/insurance-help">{() => <AdminGuard component={AdminInsuranceHelp} />}</Route>
        <Route path="/admin/flu-shots">{() => <AdminGuard component={AdminFluShots} />}</Route>
        <Route path="/admin/primerx-sync">{() => <AdminGuard component={PrimeRxSync} />}</Route>
        <Route path="/admin/blog">{() => <AdminGuard component={AdminBlog} />}</Route>
        <Route path="/admin/alerts">{() => <AdminGuard component={AdminAlerts} />}</Route>
        <Route path="/admin/blister-patients">{() => <AdminGuard component={AdminBlisterPatients} />}</Route>
        <Route path="/admin/transfer-requests">{() => <AdminGuard component={AdminTransferRequests} />}</Route>
        <Route path="/admin/urgent-refills">{() => <AdminGuard component={AdminUrgentRefills} />}</Route>
        <Route path="/admin/staff-emails">{() => <AdminGuard component={AdminStaffEmails} />}</Route>
        <Route path="/admin/rewards">{() => <AdminGuard component={AdminRewards} />}</Route>
        <Route path="/admin/patient-requests">{() => <AdminGuard component={AdminPatientRequests} />}</Route>
        <Route path="/admin/caregiver-requests">{() => <AdminGuard component={AdminCaregiverRequests} />}</Route>
        <Route path="/admin/doctors">{() => <AdminGuard component={AdminDoctors} />}</Route>
        <Route path="/admin/doctor-partners">{() => <AdminGuard component={AdminDoctorPartners} />}</Route>
        <Route path="/admin/doctor-match-leads">{() => <AdminGuard component={AdminDoctorMatchLeads} />}</Route>
        <Route path="/admin/notification-settings">{() => <AdminGuard component={AdminNotificationSettings} />}</Route>
        <Route path="/admin/email-template">{() => <AdminGuard component={AdminEmailTemplate} />}</Route>
        <Route path="/admin/patients">{() => <AdminGuard component={AdminPatientsList} />}</Route>
        <Route path="/admin/patients/:id">{() => <AdminGuard component={AdminPatientProfile} />}</Route>
        <Route path="/admin/conversion-leads">{() => <AdminGuard component={AdminConversionLeads} />}</Route>
        <Route path="/admin/milestone-patients">{() => <AdminGuard component={AdminMilestonePatients} />}</Route>
        <Route path="/admin/specialty-requests">{() => <AdminGuard component={AdminSpecialtyRequests} />}</Route>
        <Route path="/admin/ltc-leads">{() => <AdminGuard component={AdminLtcLeads} />}</Route>
        <Route path="/admin/restock-notifications">{() => <AdminGuard component={AdminRestockNotifications} />}</Route>
        <Route path="/admin/savings-requests">{() => <AdminGuard component={AdminSavingsRequests} />}</Route>
        <Route path="/admin/inventory">{() => <AdminGuard component={AdminInventory} />}</Route>
        <Route path="/admin/pa-requests">{() => <AdminGuard component={AdminPaRequests} />}</Route>
        <Route path="/admin/pa-analytics">{() => <AdminGuard component={AdminPaAnalytics} />}</Route>
        <Route path="/admin/contact-submissions">{() => <AdminGuard component={AdminContactSubmissions} />}</Route>
        <Route path="/admin/integration-health">{() => <AdminGuard component={IntegrationHealth} />}</Route>
        {/* Public prescriber e-signature page — no auth required */}
        <Route path="/pa-sign/:token" component={PaSign} />
        {/* Staff tablet app */}
        <Route path="/staff" component={StaffApp} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [location]);
  return null;
}

function AppProviders({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin") || location.startsWith("/staff");
  usePageViewTracker();
  useLenis(!isAdminRoute);
  return <>{children}</>;
}

function ConditionalChatWidget() {
  const [location] = useLocation();
  if (location.startsWith("/admin") || location.startsWith("/staff")) return null;
  return (
    <Suspense fallback={null}>
      <ChatWidget />
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <InventorySync />
      <TooltipProvider>
        <MotionConfig reducedMotion="user">
          <AppProviders>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
            >
              Skip to main content
            </a>
            <ScrollToTop />
            <HoursBar />
            <ErrorBoundary>
              <main id="main-content">
                <Router />
              </main>
            </ErrorBoundary>
            <ConditionalChatWidget />
            <CookieConsent />
          </AppProviders>
        </MotionConfig>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
