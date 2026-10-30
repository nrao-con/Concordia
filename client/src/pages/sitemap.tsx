import { Link } from "wouter";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { SEO } from "@/components/seo";
import { PageTransition } from "@/components/page-transition";
import {
  Home, ShoppingBag, Syringe, Pill, Building2, Stethoscope,
  FileText, HelpCircle, Phone, User, Ticket, ArrowRight,
  Shield, Cookie, Eye, Scale, BookOpen, MapPin, Leaf,
} from "lucide-react";

const sections = [
  {
    title: "Main Pages",
    links: [
      { href: "/", label: "Home", icon: Home, desc: "Concordia Pharmacy homepage" },
      { href: "/about", label: "About Us", icon: User, desc: "Our story, team, and pharmacy values" },
      { href: "/contact", label: "Contact Us", icon: Phone, desc: "Phone, email, and directions" },
      { href: "/faq", label: "FAQ", icon: HelpCircle, desc: "Frequently asked questions" },
      { href: "/wellness", label: "Wellness Zone", icon: Leaf, desc: "Health tips from the CDC, NIH, WHO, and our clinical team" },
      { href: "/blog", label: "Health Blog", icon: BookOpen, desc: "Health tips, news, and pharmacy updates" },
      { href: "/find-doctor", label: "Find a Doctor", icon: Stethoscope, desc: "Connect with local healthcare providers" },
    ],
  },
  {
    title: "Pharmacy Services",
    links: [
      { href: "/schedule-flu-shot", label: "Flu Shots", icon: Syringe, desc: "Walk-in flu shots for all ages. Most insurance accepted." },
      { href: "/specialty", label: "Specialty Medications", icon: Pill, desc: "Oncology, rare disease, biologics, and hard-to-find meds" },
      { href: "/ltc-partnership", label: "Long-Term Care Partnership", icon: Building2, desc: "Custom pharmacy services for nursing homes and assisted living" },
      { href: "/signup", label: "Become a Patient", icon: User, desc: "Free membership. Join Concordia today." },
    ],
  },
  {
    title: "Shop & Orders",
    links: [
      { href: "/shop", label: "OTC Health Shop", icon: ShoppingBag, desc: "Over-the-counter medications, vitamins, and essentials" },
      { href: "/cart", label: "Shopping Cart", icon: ShoppingBag, desc: "Review and manage your cart" },
      { href: "/checkout", label: "Checkout", icon: ShoppingBag, desc: "Complete your order" },
      { href: "/my-tickets", label: "My Tickets", icon: Ticket, desc: "Track your support requests and orders" },
    ],
  },
  {
    title: "Legal & Compliance",
    links: [
      { href: "/privacy-policy", label: "Privacy Policy", icon: Shield, desc: "How we collect, use, and protect your data" },
      { href: "/terms-of-service", label: "Terms of Service", icon: FileText, desc: "Terms governing use of our website and services" },
      { href: "/cookie-policy", label: "Cookie Policy", icon: Cookie, desc: "Information about cookies we use" },
      { href: "/non-discrimination", label: "Non-Discrimination", icon: Scale, desc: "Our commitment to equal access for all patients" },
      { href: "/accessibility", label: "Accessibility", icon: Eye, desc: "Accessibility features and accommodations" },
    ],
  },
];

export default function Sitemap() {
  return (
    <PageTransition className="min-h-screen clinical-hero-bg clinical-dark-page">
      <SEO
        title="Sitemap"
        description="Complete sitemap for Concordia Pharmacy. Find every page on our website, from pharmacy services to legal documents."
        path="/sitemap"
      />
      <Header />

      <main className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="mb-12">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
            <Link href="/">
              <span className="hover:text-primary transition-colors cursor-pointer flex items-center gap-1">
                <Home className="h-3.5 w-3.5" />
                Home
              </span>
            </Link>
            <span>/</span>
            <span className="text-slate-300">Sitemap</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">Sitemap</h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            Every page on the Concordia Pharmacy website, organized by section.
          </p>
        </div>

        <div className="space-y-12">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-lg font-semibold text-white mb-5 pb-2 border-b border-white/10 flex items-center gap-2">
                <span className="w-1 h-5 rounded-full bg-primary inline-block" />
                {section.title}
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.links.map(({ href, label, icon: Icon, desc }) => (
                  <Link key={href} href={href}>
                    <div
                      className="flex items-start gap-3 p-4 rounded-md clinical-glass hover-elevate cursor-pointer group transition-colors"
                      data-testid={`sitemap-link-${href.replace(/\//g, "-").replace(/^-/, "")}`}
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white flex items-center gap-1 group-hover:text-primary transition-colors">
                          {label}
                          <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/10">
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <MapPin className="h-3.5 w-3.5" />
            <span>898 East Tremont Ave, Bronx, NY 10460 &nbsp;·&nbsp; (718) 328-2833 &nbsp;·&nbsp; &copy; {new Date().getFullYear()} Concordia Pharmacy</span>
          </div>
        </div>
      </main>

      <SiteFooter />
    </PageTransition>
  );
}
