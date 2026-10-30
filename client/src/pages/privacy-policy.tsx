import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { SEO } from "@/components/seo";
import { Link } from "wouter";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <PageTransition className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
      <SEO
        title="Privacy Policy"
        description="Concordia Pharmacy's privacy policy. Learn how we protect your personal health information in compliance with HIPAA regulations."
        path="/privacy-policy"
      />
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <Link href="/">
          <span className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors cursor-pointer mb-8" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </span>
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" data-testid="text-privacy-title">Privacy Policy</h1>
        <p className="text-slate-300 text-sm mb-10">Last updated: June 2026</p>

        {/* Website showcase notice */}
        <div className="mb-10 rounded-md border border-amber-500/30 bg-amber-500/10 p-5 flex gap-4" data-testid="notice-hipaa-showcase">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm leading-relaxed">
            <p className="text-amber-300 font-semibold mb-1">Website Platform Notice</p>
            <p className="text-amber-200/80">
              This website (<strong>concordianyc.com</strong>) is currently a <strong>public-facing showcase platform</strong>. It does not collect, transmit, or store Protected Health Information (PHI) through its web forms in a manner that has been independently certified as HIPAA-compliant for a web portal.
            </p>
            <p className="text-amber-200/80 mt-2">
              <strong>Concordia Pharmacy as a licensed entity is fully HIPAA compliant.</strong> All clinical operations, prescription management, patient records, and staff workflows follow strict HIPAA Privacy and Security Rule requirements. No PHI submitted through this website is visible to or accessible by unauthorized parties. However, we want to be transparent: formal third-party HIPAA certification of this web platform specifically is still in progress.
            </p>
            <p className="text-amber-200/80 mt-2">
              For any sensitive health matters, please contact us directly by phone at <a href="tel:+17183282833" className="underline text-amber-300">(718) 328-2833</a> or visit us in person. Patient clinical data is managed exclusively through our HIPAA-compliant ConcordiaCare platform and pharmacy management system.
            </p>
          </div>
        </div>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3" data-testid="text-privacy-intro-heading">Introduction</h2>
            <p>
              Concordia Pharmacy ("we," "us," or "our"), located at 898 East Tremont Ave, Bronx, NY 10460, is committed to protecting the privacy and security of your personal and health information. This Privacy Policy describes how we collect, use, disclose, and safeguard your information when you visit our website, use our ConcordiaCare mobile application, or interact with our pharmacy services.
            </p>
            <p className="mt-3">
              As a licensed pharmacy and HIPAA-covered entity, we comply with the Health Insurance Portability and Accountability Act (HIPAA), New York State pharmacy regulations, and all applicable federal and state privacy laws. This policy applies to all our services collectively.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Information We Collect</h2>
            <p className="mb-3">We may collect the following types of information:</p>
            <h3 className="text-white font-medium mb-2">Personal Information</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mb-4">
              <li>Full name, date of birth, and contact information (phone number, email address, mailing address)</li>
              <li>Insurance information and policy details</li>
              <li>Payment and billing information</li>
              <li>Government-issued identification when required by law</li>
            </ul>
            <h3 className="text-white font-medium mb-2">Protected Health Information (PHI)</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mb-4">
              <li>Prescription information and medication history (managed through the ConcordiaCare platform and PrimeRx system)</li>
              <li>Prescriber information and clinical notes</li>
              <li>Allergy and health condition information</li>
              <li>Insurance claims and prior authorization records</li>
            </ul>
            <h3 className="text-white font-medium mb-2">Website Technical Information</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>IP address, browser type, and device information</li>
              <li>Pages visited, time spent on pages, and navigation patterns</li>
              <li>Cookies and similar tracking technologies (see our <Link href="/cookie-policy"><span className="text-primary underline cursor-pointer">Cookie Policy</span></Link>)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Dispensing and managing your prescriptions</li>
              <li>Processing insurance claims and prior authorizations</li>
              <li>Coordinating care with your healthcare providers</li>
              <li>Providing medication therapy management and clinical consultations</li>
              <li>Managing delivery logistics and tracking</li>
              <li>Communicating refill reminders and health-related notifications</li>
              <li>Processing payments and managing your account</li>
              <li>Improving our services and website experience</li>
              <li>Complying with legal and regulatory requirements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">HIPAA Compliance</h2>
            <p>
              As a licensed pharmacy, we are a "covered entity" under HIPAA. Your Protected Health Information (PHI) is subject to the protections outlined in our Notice of Privacy Practices, which is available at our pharmacy location and upon request.
            </p>
            <p className="mt-3">
              All clinical PHI is managed through HIPAA-compliant systems, including our PrimeRx pharmacy management system and the ConcordiaCare mobile platform, not through this public website. Key HIPAA protections include:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>We use and disclose PHI only for treatment, payment, and healthcare operations unless you provide written authorization</li>
              <li>We maintain administrative, physical, and technical safeguards to protect your PHI</li>
              <li>We train all staff members on HIPAA privacy and security requirements</li>
              <li>We conduct regular audits of access to patient health information</li>
              <li>We will notify you in the event of a breach of your unsecured PHI</li>
            </ul>
            <p className="mt-3 text-slate-400">
              For the complete Notice of Privacy Practices governing your health information, please request a copy in person or call <a href="tel:+17183282833" className="text-primary">(718) 328-2833</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Disclosure of Information</h2>
            <p className="mb-3">We may share your information in the following circumstances:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><span className="text-slate-300">Healthcare operations:</span> With your prescribers, insurance providers, and other healthcare entities involved in your care</li>
              <li><span className="text-slate-300">Business associates:</span> With third-party service providers who perform services on our behalf and are bound by HIPAA business associate agreements</li>
              <li><span className="text-slate-300">Legal requirements:</span> When required by federal or state law, including reporting to the New York State Department of Health</li>
              <li><span className="text-slate-300">Public health activities:</span> For disease prevention, FDA reporting, or other public health purposes as permitted by law</li>
              <li><span className="text-slate-300">With your consent:</span> For any purpose not described above, only with your written authorization</li>
            </ul>
            <p className="mt-3">We do not sell your personal information or PHI to third parties. Ever.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Cookies &amp; Tracking Technologies</h2>
            <p>
              Our website uses cookies and similar technologies to enhance your browsing experience and analyze site traffic. See our full <Link href="/cookie-policy"><span className="text-primary underline cursor-pointer">Cookie Policy</span></Link> for detailed information. In summary:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li><span className="text-slate-300">Essential cookies:</span> Required for the website to function properly (session management, authentication)</li>
              <li><span className="text-slate-300">Analytics cookies:</span> Help us understand how visitors interact with our website (no PHI involved)</li>
              <li><span className="text-slate-300">Functional cookies:</span> Remember your preferences and settings</li>
            </ul>
            <p className="mt-3">You can manage cookie preferences through your browser settings. Disabling certain cookies may affect website functionality.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your information, including:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>SSL/TLS encryption for all data transmitted through our website</li>
              <li>Encrypted storage for sensitive personal and health information</li>
              <li>Role-based access controls for staff and systems</li>
              <li>Regular security assessments and vulnerability testing</li>
              <li>HIPAA-compliant audit logging of all access to patient records within clinical systems</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Your Rights</h2>
            <p className="mb-3">Under HIPAA and applicable state law, you have the right to:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Access and obtain a copy of your health records</li>
              <li>Request corrections to your health information</li>
              <li>Request restrictions on certain uses and disclosures of your PHI</li>
              <li>Receive an accounting of disclosures of your PHI</li>
              <li>Request confidential communications (e.g., contact at an alternative address or phone number)</li>
              <li>File a complaint if you believe your privacy rights have been violated</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact our Privacy Officer at (718) 328-2833 or visit our pharmacy in person.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Children's Privacy</h2>
            <p>
              Our website is not directed to children under 13. We do not knowingly collect personal information from children under 13 through our website. Pharmacy services for minors are provided with appropriate parental or guardian consent as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Non-Discrimination</h2>
            <p>
              Concordia Pharmacy does not discriminate on the basis of race, color, national origin, age, disability, or sex in the provision of healthcare services. See our full <Link href="/non-discrimination"><span className="text-primary underline cursor-pointer">Non-Discrimination Notice</span></Link> for details, including how to request language assistance or file a civil rights complaint.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Accessibility</h2>
            <p>
              We are committed to making our website accessible to all users. See our <Link href="/accessibility"><span className="text-primary underline cursor-pointer">Accessibility Statement</span></Link> for information about our current accessibility standards and how to request accommodations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last updated" date. We encourage you to review this policy periodically. Continued use of our services after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Contact Us</h2>
            <p>If you have questions about this Privacy Policy or wish to exercise your privacy rights, please contact us:</p>
            <div className="mt-3 text-slate-400">
              <p className="text-white font-medium">Concordia Pharmacy: Privacy Officer</p>
              <p>898 East Tremont Ave, Bronx, NY 10460</p>
              <p>Phone: (718) 328-2833</p>
              <p>Email: privacy@concordianyc.com</p>
            </div>
            <p className="mt-3 text-slate-300">
              You may also file a complaint with the U.S. Department of Health and Human Services Office for Civil Rights if you believe your privacy rights have been violated: <a href="https://www.hhs.gov/ocr/complaints" target="_blank" rel="noopener noreferrer" className="text-primary">www.hhs.gov/ocr/complaints</a>.
            </p>
          </section>
        </div>
      </div>

      <SiteFooter />
    </PageTransition>
  );
}
