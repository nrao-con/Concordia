import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { SEO } from "@/components/seo";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function CookiePolicy() {
  return (
    <PageTransition className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
      <SEO
        title="Cookie Policy"
        description="Concordia Pharmacy's cookie policy. Learn about the cookies and tracking technologies used on our website."
        path="/cookie-policy"
      />
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <Link href="/">
          <span className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors cursor-pointer mb-8" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </span>
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" data-testid="text-cookie-title">Cookie Policy</h1>
        <p className="text-slate-300 text-sm mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">What Are Cookies?</h2>
            <p>
              Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work more efficiently, remember your preferences, and provide information to site owners about how visitors use their site.
            </p>
            <p className="mt-3">
              Concordia Pharmacy uses cookies and similar technologies (such as local storage and session storage) on our website at concordianyc.com. This policy explains what we use, why, and how you can control them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Important: No Health Data in Cookies</h2>
            <p className="text-slate-300">
              We do not store Protected Health Information (PHI), prescription details, insurance data, or any clinical health information in cookies or browser storage. Cookies on this website are limited to session management, user preferences, and anonymous analytics.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Types of Cookies We Use</h2>

            <h3 className="text-white font-medium mb-2 mt-4">1. Strictly Necessary Cookies</h3>
            <p className="text-slate-400 mb-2">These cookies are essential for the website to function and cannot be switched off. They are usually set in response to actions you take such as logging in or adding items to a shopping cart.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><span className="text-slate-300">Session cookies:</span> Maintain your login state while you navigate the site. Deleted when you close your browser.</li>
              <li><span className="text-slate-300">Authentication tokens:</span> Verify your identity when you sign in. Required for account access.</li>
              <li><span className="text-slate-300">Cart data:</span> Store your shopping cart contents temporarily. Stored in browser local storage.</li>
              <li><span className="text-slate-300">CSRF tokens:</span> Protect against cross-site request forgery attacks. Security essential.</li>
            </ul>

            <h3 className="text-white font-medium mb-2 mt-5">2. Functional Cookies</h3>
            <p className="text-slate-400 mb-2">These cookies allow the website to remember choices you make and provide enhanced, more personalized features.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><span className="text-slate-300">Theme preferences:</span> Remember whether you have set a display preference.</li>
              <li><span className="text-slate-300">Language and region settings:</span> Remember your preferred language or location.</li>
              <li><span className="text-slate-300">Chat widget state:</span> Remember whether you have dismissed or interacted with the support chat.</li>
            </ul>

            <h3 className="text-white font-medium mb-2 mt-5">3. Analytics Cookies</h3>
            <p className="text-slate-400 mb-2">These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously. No personally identifiable information is collected.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><span className="text-slate-300">Page view tracking:</span> Which pages are visited most frequently.</li>
              <li><span className="text-slate-300">Traffic sources:</span> How visitors arrive at our website.</li>
              <li><span className="text-slate-300">Session duration:</span> How long visitors spend on different pages.</li>
              <li><span className="text-slate-300">Error tracking:</span> Technical errors that occur during your visit so we can fix them.</li>
            </ul>

            <h3 className="text-white font-medium mb-2 mt-5">4. What We Do Not Use</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>We do not use advertising or targeting cookies</li>
              <li>We do not use third-party social media tracking cookies</li>
              <li>We do not share cookie data with advertising networks</li>
              <li>We do not use cookies to track your activity across other websites</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Local Storage</h2>
            <p>
              In addition to cookies, we use browser local storage for certain features:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li><span className="text-slate-300">Guest cart:</span> If you add items to your cart without signing in, those items are stored in local storage so they persist across sessions. This data stays on your device and is not transmitted to our servers until you proceed to checkout.</li>
              <li><span className="text-slate-300">UI preferences:</span> Sidebar states, display settings, and similar interface preferences.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">How to Control Cookies</h2>
            <p className="mb-3">You have several options for managing cookies:</p>

            <h3 className="text-white font-medium mb-2">Browser Settings</h3>
            <p className="text-slate-400 mb-2">Most browsers allow you to control cookies through their settings. Common options include:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mb-4">
              <li>Block all cookies (note: this will prevent you from logging in or using the cart)</li>
              <li>Block only third-party cookies</li>
              <li>Delete cookies when you close your browser</li>
              <li>Allow cookies from specific websites only</li>
            </ul>
            <p className="text-slate-400">
              To manage cookies in your browser: <span className="text-slate-300">Chrome</span>: Settings &gt; Privacy and Security &gt; Cookies &nbsp;|&nbsp; <span className="text-slate-300">Firefox</span>: Settings &gt; Privacy &amp; Security &nbsp;|&nbsp; <span className="text-slate-300">Safari</span>: Preferences &gt; Privacy &nbsp;|&nbsp; <span className="text-slate-300">Edge</span>: Settings &gt; Site Permissions &gt; Cookies.
            </p>

            <h3 className="text-white font-medium mb-2 mt-4">Opt-Out of Analytics</h3>
            <p className="text-slate-400">
              If you do not wish your browsing behavior to be included in anonymous analytics, you can block analytics cookies through your browser settings. This will not affect your ability to use any features of the website.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Cookie Retention</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><span className="text-slate-300">Session cookies:</span> Deleted automatically when you close your browser</li>
              <li><span className="text-slate-300">Authentication cookies:</span> Expire after your session or a maximum of 30 days if you choose "remember me"</li>
              <li><span className="text-slate-300">Preference cookies:</span> Retained for up to 12 months</li>
              <li><span className="text-slate-300">Analytics cookies:</span> Anonymized data retained for up to 24 months for trend analysis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Changes to This Policy</h2>
            <p>
              We may update this Cookie Policy to reflect changes in technology, regulation, or our practices. Updates will be posted with a revised "Last updated" date. We encourage you to review this page periodically.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">More Information</h2>
            <p>For more information about how we handle your personal data, see our <Link href="/privacy-policy"><span className="text-primary underline cursor-pointer">Privacy Policy</span></Link>. If you have questions about our use of cookies, contact us:</p>
            <div className="mt-3 text-slate-400">
              <p className="text-white font-medium">Concordia Pharmacy</p>
              <p>898 East Tremont Ave, Bronx, NY 10460</p>
              <p>Phone: (718) 328-2833</p>
              <p>Email: privacy@concordianyc.com</p>
            </div>
          </section>
        </div>
      </div>

      <SiteFooter />
    </PageTransition>
  );
}
