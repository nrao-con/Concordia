import { Link } from "wouter";
import { MapPin, Phone, Clock } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 pt-12 pb-8" style={{ background: "rgba(15, 23, 42, 0.95)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-10">
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4" data-testid="text-footer-about-heading">Concordia Pharmacy</h3>
            <div className="space-y-3 text-sm text-slate-400">
              <a
                href="https://maps.google.com/?q=898+East+Tremont+Ave,+Bronx,+NY+10460"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 hover:text-slate-300 transition-colors group"
                aria-label="Open Concordia Pharmacy in Google Maps"
                data-testid="link-footer-address-map"
              >
                <MapPin className="h-4 w-4 text-slate-300 mt-0.5 flex-shrink-0" />
                <span className="group-hover:underline">
                  898 East Tremont Ave<br />Bronx, NY 10460
                </span>
              </a>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-300 flex-shrink-0" />
                <a href="tel:+17183282833" className="hover:text-slate-300 transition-colors" data-testid="link-footer-phone">(718) 328-2833</a>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-slate-300 mt-0.5 flex-shrink-0" />
                <span>Mon-Fri: 9AM - 7PM<br />Sat: 10AM - 3PM<br />Sun: Closed</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4" data-testid="text-footer-services-heading">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-about">About Us</span>
                </Link>
              </li>
              <li>
                <Link href="/shop">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-shop">Health Shop</span>
                </Link>
              </li>
              <li>
                <Link href="/schedule-flu-shot">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-flu-shots">Flu Shots</span>
                </Link>
              </li>
              <li>
                <Link href="/specialty">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-specialty">Specialty Medications</span>
                </Link>
              </li>
              <li>
                <Link href="/ltc-partnership">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-ltc">Long-Term Care</span>
                </Link>
              </li>
              <li>
                <Link href="/faq">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-faq">FAQ</span>
                </Link>
              </li>
              <li>
                <Link href="/contact">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-contact">Contact Us</span>
                </Link>
              </li>
              <li>
                <Link href="/wellness">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-wellness">Wellness Zone</span>
                </Link>
              </li>
              <li>
                <Link href="/blog">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-blog">Health Blog</span>
                </Link>
              </li>
              <li>
                <Link href="/my-tickets">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-my-tickets">My Tickets</span>
                </Link>
              </li>
              <li>
                <Link href="/signup">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-signup">Become a Patient</span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4" data-testid="text-footer-legal-heading">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/privacy-policy">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-privacy">Privacy Policy</span>
                </Link>
              </li>
              <li>
                <Link href="/terms-of-service">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-terms">Terms of Service</span>
                </Link>
              </li>
              <li>
                <Link href="/cookie-policy">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-cookies">Cookie Policy</span>
                </Link>
              </li>
              <li>
                <Link href="/non-discrimination">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-nondiscrimination">Non-Discrimination</span>
                </Link>
              </li>
              <li>
                <Link href="/accessibility">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-accessibility">Accessibility</span>
                </Link>
              </li>
              <li>
                <Link href="/sitemap">
                  <span className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" data-testid="link-footer-sitemap">Sitemap</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6">
          <div className="text-center text-xs text-slate-300">
            <p>Licensed by the New York State Board of Pharmacy. DEA Schedule II-V licensed.</p>
            <p className="mt-1">&copy; {new Date().getFullYear()} Concordia Pharmacy. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
