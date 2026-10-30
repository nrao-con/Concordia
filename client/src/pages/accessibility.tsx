import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { SEO } from "@/components/seo";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function Accessibility() {
  return (
    <PageTransition className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
      <SEO
        title="Accessibility Statement"
        description="Concordia Pharmacy's accessibility statement. Our commitment to making our website and services accessible to all patients, including those with disabilities."
        path="/accessibility"
      />
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <Link href="/">
          <span className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors cursor-pointer mb-8" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </span>
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" data-testid="text-accessibility-title">Accessibility Statement</h1>
        <p className="text-slate-300 text-sm mb-10">Last updated: June 4, 2025</p>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Our Commitment</h2>
            <p>
              Concordia Pharmacy is committed to ensuring that our website and digital services are accessible to everyone, including people with disabilities. We believe that access to healthcare information and pharmacy services is a fundamental right, and we work continuously to remove barriers that might prevent anyone from using our website effectively.
            </p>
            <p className="mt-3">
              We strive to conform to the <strong className="text-white">Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</strong> standards and comply with the Americans with Disabilities Act (ADA), Section 504 of the Rehabilitation Act, and applicable New York State accessibility requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Accessibility Features</h2>
            <p className="mb-3">Our website is designed and built with the following accessibility considerations:</p>

            <h3 className="text-white font-medium mb-2">Visual</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mb-4">
              <li>High-contrast color schemes designed for readability</li>
              <li>Text that can be resized up to 200% without loss of content or functionality</li>
              <li>Alternative text (alt text) provided for all meaningful images</li>
              <li>Icons paired with descriptive text labels where possible</li>
              <li>Support for browser and OS-level dark mode and color preferences</li>
            </ul>

            <h3 className="text-white font-medium mb-2">Navigation &amp; Interaction</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mb-4">
              <li>All functionality is accessible via keyboard navigation</li>
              <li>Logical tab order throughout all pages</li>
              <li>Visible focus indicators for keyboard users</li>
              <li>Skip navigation links to bypass repetitive content</li>
              <li>Descriptive page titles and heading structures</li>
            </ul>

            <h3 className="text-white font-medium mb-2">Content</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mb-4">
              <li>Plain language used throughout to improve comprehension</li>
              <li>Form labels clearly associated with their input fields</li>
              <li>Error messages that describe what went wrong and how to correct it</li>
              <li>No content that flashes more than three times per second</li>
              <li>Animations respect the <code className="text-slate-300">prefers-reduced-motion</code> system setting</li>
            </ul>

            <h3 className="text-white font-medium mb-2">Assistive Technology Compatibility</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>ARIA landmark roles and labels for screen reader navigation</li>
              <li>Semantic HTML structure throughout</li>
              <li>Compatible with common screen readers including NVDA, JAWS, and VoiceOver</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Current Limitations</h2>
            <p>
              While we strive for full accessibility, some areas of our website are still being improved. Known limitations include:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>Some older PDF documents linked from the site may not be fully screen reader accessible. We are working to remediate these.</li>
              <li>Third-party embedded content (such as maps) may not fully conform to WCAG 2.1 AA. We provide text-based alternatives where possible.</li>
              <li>Certain interactive data visualizations in the admin section may have limited screen reader support.</li>
            </ul>
            <p className="mt-3">
              We are actively working to address these gaps and appreciate your patience.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">In-Person &amp; Phone Accessibility</h2>
            <p>We are also committed to accessibility at our physical location and over the phone:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>Our pharmacy at 898 East Tremont Ave is accessible to individuals using wheelchairs and mobility devices</li>
              <li>Large-print prescription labels are available upon request</li>
              <li>Braille and audio formats for key documents available upon request</li>
              <li>Bilingual staff (English and Spanish) available to assist patients</li>
              <li>TTY/TDD users may contact us through the New York Relay Service by dialing 711</li>
              <li>Sign language interpretation can be arranged with advance notice for in-person visits</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Request an Accommodation</h2>
            <p>
              If you need information in an alternative format, require a reasonable modification to access our services, or have difficulty using any part of our website, please contact us. We will work with you to provide the information or assistance you need.
            </p>
            <div className="mt-3 text-slate-400">
              <p className="text-white font-medium">Concordia Pharmacy</p>
              <p>898 East Tremont Ave, Bronx, NY 10460</p>
              <p>Phone: <a href="tel:+17183282833" className="text-primary">(718) 328-2833</a></p>
              <p>Email: accessibility@concordianyc.com</p>
              <p>TTY: Dial 711 (New York Relay Service)</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Feedback</h2>
            <p>
              We welcome your feedback on the accessibility of our website. If you encounter an accessibility barrier, please tell us so we can fix it. When contacting us, please include:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>The page or feature where you encountered the problem</li>
              <li>A description of what you were trying to do and what happened</li>
              <li>The assistive technology you are using (if applicable)</li>
              <li>Your browser and operating system</li>
            </ul>
            <p className="mt-3">
              We aim to respond to accessibility feedback within 2 business days and to resolve verified accessibility barriers as quickly as practicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Filing a Complaint</h2>
            <p>
              If you are not satisfied with our response to an accessibility concern, you may file a complaint with the following agencies:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li><a href="https://www.ada.gov/filing-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-primary">U.S. Department of Justice: ADA complaints</a></li>
              <li><a href="https://www.hhs.gov/ocr/complaints" target="_blank" rel="noopener noreferrer" className="text-primary">HHS Office for Civil Rights: Section 504 complaints</a></li>
              <li>New York State Division of Human Rights: (888) 392-3644</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Related Policies</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><Link href="/privacy-policy"><span className="text-primary underline cursor-pointer">Privacy Policy</span></Link></li>
              <li><Link href="/non-discrimination"><span className="text-primary underline cursor-pointer">Non-Discrimination Notice</span></Link></li>
              <li><Link href="/terms-of-service"><span className="text-primary underline cursor-pointer">Terms of Service</span></Link></li>
            </ul>
          </section>
        </div>
      </div>

      <SiteFooter />
    </PageTransition>
  );
}
