import { useState, useCallback, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ShoppingCart, ShoppingBag, LayoutDashboard, Menu, X, Pill, Building2,
  UserSearch, Syringe, Search, ChevronDown, Ticket, LogOut, User, Leaf,
  ClipboardList, Settings, BadgeDollarSign, Smartphone,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MotionButton } from "@/components/motion-button";
import { useAuth } from "@/hooks/useAuth";
import { useGuestCart } from "@/hooks/useGuestCart";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { CartItemWithProduct } from "@shared/schema";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import concordiaLogo from "@assets/concordia_logo_trimmed_transparent.png";
import { useSeasonalTheme } from "@/hooks/useSeasonalTheme";
import { SeasonalMark } from "@/components/seasonal-mark";

const navStagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const navItem = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

const dropdownVariants = {
  hidden: { opacity: 0, y: -6, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } },
  exit: { opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.15 } },
};

const SERVICE_ITEMS = [
  {
    icon: Pill,
    label: "Specialty Medications",
    description: "80+ drugs. Oncology, rheumatology, and more.",
    href: "/specialty",
    testId: "link-services-specialty",
  },
  {
    icon: Syringe,
    label: "Flu Shots & Vaccines",
    description: "Walk-ins welcome, most insurance accepted",
    href: "/schedule-flu-shot",
    testId: "link-services-flu-shots",
  },
  {
    icon: BadgeDollarSign,
    label: "Prescription Savings",
    description: "Automatic price matching. Best deal, every fill.",
    href: "/rx-savings",
    testId: "link-services-rx-savings",
  },
  {
    icon: UserSearch,
    label: "Find a Doctor",
    description: "Connect with our network physicians",
    href: "/find-doctor",
    testId: "link-services-find-doctor",
  },
  {
    icon: Leaf,
    label: "Wellness Zone",
    description: "Health tips from CDC, NIH, Reddit & more",
    href: "/wellness",
    testId: "link-services-wellness",
  },
];

function useClickOutside(ref: React.RefObject<HTMLElement>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

function ServicesMenu({ currentLocation }: { currentLocation: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null!);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  const isActive = SERVICE_ITEMS.some((s) => currentLocation === s.href);

  return (
    <div ref={ref} className="relative hidden sm:block">
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors header-glow
          ${isActive || open
            ? "text-white bg-white/10 border border-white/20"
            : "text-slate-300 hover:text-white border border-transparent"
          }`}
        data-testid="button-nav-services"
        aria-expanded={open}
        aria-haspopup="true"
      >
        Services
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute left-0 top-full mt-2 w-72 rounded-md overflow-hidden z-50"
            style={{
              background: "rgba(15, 23, 42, 0.97)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
            }}
            data-testid="dropdown-services"
          >
            <div className="p-1.5">
              {SERVICE_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = currentLocation === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={close}>
                    <div
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-sm cursor-pointer transition-colors hover-elevate
                        ${active ? "bg-white/10" : ""}`}
                      data-testid={item.testId}
                    >
                      <div className="shrink-0 w-8 h-8 rounded-sm bg-white/8 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white leading-tight">{item.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountButton({ landingCtas, currentLocation, onClose }: { landingCtas: boolean; currentLocation: string; onClose?: () => void }) {
  const { user, isAuthenticated, isAdmin, isCaregiver, attendantSession, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null!);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (isCaregiver) {
        await apiRequest("POST", "/api/attendant/logout", {});
      } else {
        await apiRequest("POST", "/api/auth/logout", {});
      }
    },
    onSuccess: async () => {
      queryClient.clear();
      close();
      onClose?.();
      if (isCaregiver) {
        window.location.href = "/";
      } else {
        await signOut("/");
      }
    },
  });

  if (isAdmin) {
    return (
      <Link href="/admin">
        <MotionButton
          variant={currentLocation.startsWith("/admin") ? "default" : "ghost"}
          size="sm"
          className="gap-1.5 no-default-hover-elevate no-default-active-elevate header-glow"
          data-testid="button-nav-admin"
        >
          <LayoutDashboard className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </MotionButton>
      </Link>
    );
  }

  if (isAuthenticated && (user || isCaregiver)) {
    const firstName = user?.firstName || attendantSession?.attendant?.firstName || "";
    const profileImage = user?.profileImageUrl || "";
    const initials = firstName ? firstName[0].toUpperCase() : "P";

    const accountMenuItems = [
      { icon: ClipboardList, label: "My Orders", href: "/my-orders", testId: "link-account-my-orders" },
      { icon: Ticket, label: "My Tickets", href: "/my-tickets", testId: "link-account-my-tickets" },
      { icon: Settings, label: "My Profile", href: "/profile", testId: "link-account-profile" },
    ];
    const APP_URL = "https://concordia-care.replit.app/";

    return (
      <div ref={ref} className="relative">
        <motion.button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-transparent text-slate-300 hover:text-white hover:bg-white/8 transition-colors header-glow"
          data-testid="button-nav-account"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <Avatar className="h-7 w-7">
            {profileImage && <AvatarImage src={profileImage} alt={firstName} />}
            <AvatarFallback className="text-xs bg-primary/20 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </motion.button>

        <AnimatePresence>
          {open && (
            <motion.div
              variants={dropdownVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="absolute right-0 top-full mt-2 w-52 rounded-md overflow-hidden z-50"
              style={{
                background: "rgba(15, 23, 42, 0.97)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              }}
              data-testid="dropdown-account"
            >
              {firstName && (
                <div className="px-3 py-2.5 border-b border-white/8">
                  <p className="text-xs text-slate-400">Signed in as</p>
                  <p className="text-sm font-medium text-white truncate">{firstName}</p>
                  {(user as any)?.concordiaId && (
                    <p className="text-xs text-slate-400 font-mono mt-0.5" data-testid="text-header-concordia-id">{(user as any).concordiaId}</p>
                  )}
                </div>
              )}
              <div className="p-1.5">
                {accountMenuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} onClick={close}>
                      <div
                        className="flex items-center gap-2.5 px-3 py-2 rounded-sm cursor-pointer hover-elevate transition-colors"
                        data-testid={item.testId}
                      >
                        <Icon className="h-4 w-4 text-slate-400" />
                        <span className="text-sm text-white">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
                <div className="my-1 border-t border-white/8" />
                <a href={APP_URL} target="_blank" rel="noopener noreferrer" onClick={close} data-testid="link-account-open-app">
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-sm cursor-pointer hover-elevate transition-colors">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <span className="text-sm text-white">Open App</span>
                  </div>
                </a>
                <div className="my-1 border-t border-white/8" />
                <button
                  onClick={() => logoutMutation.mutate()}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-sm cursor-pointer hover-elevate transition-colors text-left"
                  data-testid="button-account-logout"
                >
                  <LogOut className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-rose-400">Sign Out</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="hidden sm:flex items-center gap-2">
      <Link href="/login">
        <MotionButton
          size="sm"
          variant="ghost"
          className="text-slate-300"
          data-testid="button-nav-sign-in"
        >
          Sign In
        </MotionButton>
      </Link>
      <Link href="/signup">
        <MotionButton
          size="sm"
          className="no-default-hover-elevate no-default-active-elevate"
          data-testid="button-nav-become-patient"
        >
          Become a Patient
        </MotionButton>
      </Link>
    </div>
  );
}

export function Header({ landingCtas = false }: { landingCtas?: boolean } = {}) {
  const { user, isAuthenticated, isAdmin, isCaregiver, signOut } = useAuth();
  const [location, setLocation] = useLocation();
  const guestCart = useGuestCart();
  const isPatientAuthenticated = isAuthenticated && !isAdmin && !!user;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const seasonalTheme = useSeasonalTheme();
  const showHalloweenMark = location === "/" && seasonalTheme?.holiday?.decoration === "pumpkins";

  const closeMobile = useCallback(() => {
    setMobileMenuOpen(false);
    setMobileServicesOpen(false);
  }, []);

  const mobileLogoutMutation = useMutation({
    mutationFn: async () => {
      if (isCaregiver) {
        await apiRequest("POST", "/api/attendant/logout", {});
      } else {
        await apiRequest("POST", "/api/auth/logout", {});
      }
    },
    onSuccess: async () => {
      queryClient.clear();
      closeMobile();
      if (isCaregiver) {
        window.location.href = "/";
      } else {
        await signOut("/");
      }
    },
  });

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 60);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchValue("");
  }, []);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) { closeSearch(); return; }
    setLocation(`/shop?search=${encodeURIComponent(q)}`);
    closeSearch();
    setMobileMenuOpen(false);
  }, [searchValue, setLocation, closeSearch]);

  const { data: cartItems = [] } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
    enabled: isPatientAuthenticated,
  });

  const serverCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartItemCount = isPatientAuthenticated ? serverCartCount : guestCart.itemCount;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-xl" style={{ background: "rgba(15, 23, 42, 0.85)" }}>
      <div className={`w-full flex ${showHalloweenMark ? "h-20 sm:h-24" : "h-16"} items-center justify-between px-4 md:px-6`}>
        {/* Logo */}
        <Link href="/">
          <div
            className="flex min-w-0 items-center header-glow rounded-md px-2 py-1.5 max-[359px]:px-1 cursor-pointer border border-transparent"
            data-testid="link-home"
            aria-label="Concordia Pharmacy home"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <img src={concordiaLogo} alt="Concordia Pharmacy" className="h-10 max-[359px]:h-[29px] sm:h-12 w-auto max-[359px]:max-w-[96px]" decoding="async" width="160" height="48" />
            {location === "/" && seasonalTheme?.holiday && (
              <span className={`ml-1 max-[359px]:ml-0.5 flex shrink-0 items-center ${showHalloweenMark ? "max-[639px]:[&>svg]:h-[60px] max-[639px]:[&>svg]:w-12" : ""}`} aria-hidden="true" data-testid="header-seasonal-mark">
                <SeasonalMark decoration={seasonalTheme.holiday.decoration} size={showHalloweenMark ? 64 : 32} />
              </span>
            )}
          </div>
        </Link>

        {/* Desktop nav */}
        <motion.div
          className="flex items-center gap-1"
          initial={shouldReduceMotion ? "visible" : "hidden"}
          animate="visible"
          variants={navStagger}
        >
          {/* Services dropdown */}
          <motion.div variants={navItem}>
            <ServicesMenu currentLocation={location} />
          </motion.div>

          {/* Shop */}
          <motion.div variants={navItem}>
            <Link href="/shop">
              <MotionButton
                variant={location === "/shop" ? "default" : "ghost"}
                size="sm"
                className={`gap-1.5 hidden sm:flex no-default-hover-elevate no-default-active-elevate header-glow ${location !== "/shop" ? "text-slate-300" : ""}`}
                data-testid="button-nav-shop"
              >
                <ShoppingBag className="h-4 w-4" />
                Shop
              </MotionButton>
            </Link>
          </motion.div>

          {/* For Facilities */}
          <motion.div variants={navItem}>
            <Link href="/ltc-partnership">
              <MotionButton
                variant={location === "/ltc-partnership" ? "default" : "ghost"}
                size="sm"
                className={`gap-1.5 hidden sm:flex no-default-hover-elevate no-default-active-elevate header-glow ${location !== "/ltc-partnership" ? "text-slate-300" : ""}`}
                data-testid="button-nav-for-facilities"
              >
                <Building2 className="h-4 w-4" />
                For Facilities
              </MotionButton>
            </Link>
          </motion.div>

          {/* Search */}
          <motion.div variants={navItem}>
            <MotionButton
              variant="ghost"
              size="icon"
              className="text-slate-300 no-default-hover-elevate no-default-active-elevate header-glow"
              onClick={searchOpen ? closeSearch : openSearch}
              data-testid="button-nav-search"
              aria-label={searchOpen ? "Close search" : "Search products"}
            >
              {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </MotionButton>
          </motion.div>

          {/* Cart */}
          <motion.div variants={navItem}>
            <Link href="/cart">
              <MotionButton
                variant="ghost"
                size="icon"
                className="relative text-slate-300 no-default-hover-elevate no-default-active-elevate header-glow"
                data-testid="button-cart"
                aria-label="Shopping cart"
              >
                <ShoppingCart className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <Badge
                    className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-xs"
                    data-testid="badge-cart-count"
                  >
                    {cartItemCount}
                  </Badge>
                )}
              </MotionButton>
            </Link>
          </motion.div>

          {/* Account area */}
          <motion.div variants={navItem}>
            <AccountButton landingCtas={landingCtas} currentLocation={location} />
          </motion.div>

          {/* Mobile hamburger */}
          <motion.div variants={navItem}>
            <MotionButton
              variant="ghost"
              size="icon"
              className="md:hidden text-slate-300 no-default-hover-elevate no-default-active-elevate header-glow"
              onClick={() => setMobileMenuOpen((v) => !v)}
              data-testid="button-mobile-menu"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </MotionButton>
          </motion.div>
        </motion.div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="border-t border-white/10 px-4 py-2" style={{ background: "rgba(15, 23, 42, 0.97)" }}>
          <form onSubmit={handleSearchSubmit} className="max-w-6xl mx-auto flex items-center gap-2.5">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="search"
              aria-label="Search products and medications"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
              placeholder="Search products, medications, vitamins…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none py-1"
              data-testid="input-header-search"
              autoComplete="off"
            />
            {searchValue && (
              <button type="submit" className="text-xs text-primary hover:text-primary/70 transition-colors font-medium shrink-0">
                Search
              </button>
            )}
          </form>
        </div>
      )}

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <nav
          id="mobile-nav-menu"
          role="navigation"
          aria-label="Mobile navigation"
          className="md:hidden border-t border-white/10 px-4 py-3 space-y-1 max-h-[80vh] overflow-y-auto"
          data-lenis-prevent
          style={{ background: "rgba(15, 23, 42, 0.95)" }}
        >
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2.5 rounded-md border border-white/10 px-3 py-2 mb-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="search"
              aria-label="Search products"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search products…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
              data-testid="input-mobile-search"
              autoComplete="off"
            />
          </form>

          {/* Services group */}
          <div>
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded-sm text-sm font-medium text-slate-300 hover:text-white hover-elevate"
              onClick={() => setMobileServicesOpen((v) => !v)}
              data-testid="button-mobile-services"
            >
              <span>Services</span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${mobileServicesOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {mobileServicesOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden pl-3"
                >
                  {SERVICE_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href} onClick={closeMobile}>
                        <div
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-sm cursor-pointer hover-elevate ${location === item.href ? "text-white bg-white/10" : "text-slate-300"}`}
                          data-testid={`button-mobile-${item.testId.replace("link-services-", "")}`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="text-sm">{item.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Shop */}
          <Link href="/shop" onClick={closeMobile}>
            <MotionButton
              variant={location === "/shop" ? "default" : "ghost"}
              size="sm"
              className={`w-full justify-start gap-2 ${location !== "/shop" ? "text-slate-300" : ""}`}
              data-testid="button-mobile-shop"
            >
              <ShoppingBag className="h-4 w-4" />
              Shop OTC Products
            </MotionButton>
          </Link>

          {/* For Facilities */}
          <Link href="/ltc-partnership" onClick={closeMobile}>
            <MotionButton
              variant={location === "/ltc-partnership" ? "default" : "ghost"}
              size="sm"
              className={`w-full justify-start gap-2 ${location !== "/ltc-partnership" ? "text-slate-300" : ""}`}
              data-testid="button-mobile-for-facilities"
            >
              <Building2 className="h-4 w-4" />
              For Facilities
            </MotionButton>
          </Link>

          {/* Account section */}
          <div className="pt-1 mt-1 border-t border-white/8">
            {isAdmin ? (
              <Link href="/admin" onClick={closeMobile}>
                <MotionButton
                  variant={location.startsWith("/admin") ? "default" : "ghost"}
                  size="sm"
                  className={`w-full justify-start gap-2 ${!location.startsWith("/admin") ? "text-slate-300" : ""}`}
                  data-testid="button-mobile-admin"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </MotionButton>
              </Link>
            ) : isAuthenticated ? (
              <>
                <Link href="/my-orders" onClick={closeMobile}>
                  <MotionButton
                    variant={location === "/my-orders" ? "default" : "ghost"}
                    size="sm"
                    className={`w-full justify-start gap-2 ${location !== "/my-orders" ? "text-slate-300" : ""}`}
                    data-testid="button-mobile-my-orders"
                  >
                    <ClipboardList className="h-4 w-4" />
                    My Orders
                  </MotionButton>
                </Link>
                <Link href="/my-tickets" onClick={closeMobile}>
                  <MotionButton
                    variant={location === "/my-tickets" ? "default" : "ghost"}
                    size="sm"
                    className={`w-full justify-start gap-2 ${location !== "/my-tickets" ? "text-slate-300" : ""}`}
                    data-testid="button-mobile-my-tickets"
                  >
                    <Ticket className="h-4 w-4" />
                    My Tickets
                  </MotionButton>
                </Link>
                <Link href="/profile" onClick={closeMobile}>
                  <MotionButton
                    variant={location === "/profile" ? "default" : "ghost"}
                    size="sm"
                    className={`w-full justify-start gap-2 ${location !== "/profile" ? "text-slate-300" : ""}`}
                    data-testid="button-mobile-profile"
                  >
                    <Settings className="h-4 w-4" />
                    My Profile
                  </MotionButton>
                </Link>
                <a href="https://concordia-care.replit.app/" target="_blank" rel="noopener noreferrer" onClick={closeMobile} className="block" data-testid="link-mobile-open-app">
                  <MotionButton
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 text-primary"
                  >
                    <Smartphone className="h-4 w-4" />
                    Open App
                  </MotionButton>
                </a>
                <MotionButton
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-rose-400"
                  onClick={() => mobileLogoutMutation.mutate()}
                  data-testid="button-mobile-logout"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </MotionButton>
              </>
            ) : (
              <>
                <Link href="/login" onClick={closeMobile}>
                  <MotionButton
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 text-slate-300"
                    data-testid="button-mobile-sign-in"
                  >
                    <LogOut className="h-4 w-4 rotate-180" />
                    Sign In
                  </MotionButton>
                </Link>
                <Link href="/signup" onClick={closeMobile}>
                  <MotionButton
                    size="sm"
                    className="w-full justify-start gap-2"
                    data-testid="button-mobile-become-patient"
                  >
                    <User className="h-4 w-4" />
                    Become a Patient
                  </MotionButton>
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
