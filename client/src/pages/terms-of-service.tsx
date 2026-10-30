import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { SEO } from "@/components/seo";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <PageTransition className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
      <SEO
        title="Terms of Service"
        description="Concordia Pharmacy's terms of service. Review the terms and conditions for using our website and pharmacy services."
        path="/terms-of-service"
      />
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <Link href="/">
          <span className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors cursor-pointer mb-8" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </span>
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" data-testid="text-terms-title">Terms of Service</h1>
        <p className="text-slate-300 text-sm mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3" data-testid="text-terms-intro-heading">Agreement to Terms</h2>
            <p>
              These Terms of Service ("Terms") govern your use of the Concordia Pharmacy website at concordianyc.com, the ConcordiaCare mobile application, and all related pharmacy services (collectively, the "Services") operated by Concordia Pharmacy, located at 898 East Tremont Ave, Bronx, NY 10460 ("we," "us," or "our").
            </p>
            <p className="mt-3">
              By accessing or using our Services, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our Services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Description of Services</h2>
            <p>Concordia Pharmacy provides the following services through our website and application:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>Prescription dispensing and management</li>
              <li>Over-the-counter health product sales</li>
              <li>Free prescription delivery across the New York metropolitan area</li>
              <li>Specialty and long-term care pharmacy services</li>
              <li>Medication therapy management and clinical consultations</li>
              <li>Prescription transfer coordination</li>
              <li>Insurance verification and prior authorization assistance</li>
              <li>Blister packaging and medication synchronization</li>
            </ul>
            <p className="mt-3">
              Our website serves as a showcase and informational platform. Prescription fulfillment is managed through the ConcordiaCare app and direct coordination with our pharmacy team.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Eligibility</h2>
            <p>
              You must be at least 18 years of age to use our Services independently. Individuals under 18 may use our pharmacy services only with the involvement of a parent or legal guardian. By using our Services, you represent that you meet these eligibility requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Prescription Services Disclaimer</h2>
            <p>
              All prescription medications are dispensed by licensed pharmacists in accordance with New York State Board of Pharmacy regulations and applicable federal law. Important disclaimers:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>A valid prescription from a licensed healthcare provider is required for all prescription medications</li>
              <li>We reserve the right to verify all prescriptions before dispensing</li>
              <li>We may decline to fill a prescription if, in the professional judgment of our pharmacist, doing so would be contrary to patient safety</li>
              <li>Information on our website and app is for informational purposes only and does not constitute medical advice</li>
              <li>Always consult your healthcare provider before starting, stopping, or changing any medication</li>
              <li>We are not responsible for the clinical decisions of your prescribing healthcare provider</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">User Accounts</h2>
            <p>When you create an account with us, you agree to:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
              <li>Accept responsibility for all activities that occur under your account</li>
            </ul>
            <p className="mt-3">We reserve the right to suspend or terminate accounts that violate these Terms or are used fraudulently.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Orders & Payments</h2>
            <p>For over-the-counter product purchases through our website:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>All prices are listed in US dollars and are subject to change without notice</li>
              <li>Website pickup orders can be paid in cash at the pharmacy counter. Online card checkout is currently unavailable; contact the pharmacy about other payment options.</li>
              <li>You agree to pay all charges incurred through your account at the prices in effect when the charges are incurred</li>
              <li>We reserve the right to cancel orders if pricing errors are identified</li>
              <li>Sales tax is applied in accordance with New York State and local tax regulations</li>
            </ul>
            <p className="mt-3">
              For prescription medications, your copay or out-of-pocket cost is determined by your insurance plan. We will inform you of any costs before dispensing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Delivery Services</h2>
            <p>
              We offer free delivery of prescriptions and eligible products within our service area. Delivery terms:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>Same-day delivery is available for orders placed before 3:00 PM on weekdays</li>
              <li>Delivery times are estimates and are not guaranteed</li>
              <li>A valid delivery address within our service area is required</li>
              <li>Controlled substances may require a signature upon delivery as required by law</li>
              <li>We are not liable for delays caused by circumstances beyond our control</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Intellectual Property</h2>
            <p>
              All content on our website and application, including text, graphics, logos, images, software, and design elements, is the property of Concordia Pharmacy or its licensors and is protected by copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, modify, or create derivative works from our content without our prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Prohibited Uses</h2>
            <p>You agree not to use our Services to:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>Submit false, misleading, or fraudulent prescription or insurance information</li>
              <li>Attempt to obtain medications without a valid prescription</li>
              <li>Interfere with or disrupt the operation of our website or services</li>
              <li>Use automated systems (bots, scrapers) to access our website without permission</li>
              <li>Violate any applicable local, state, or federal law</li>
              <li>Impersonate another person or entity</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by applicable law, Concordia Pharmacy and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or other intangible losses, resulting from:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>Your use or inability to use our Services</li>
              <li>Any errors or omissions in website content</li>
              <li>Unauthorized access to or alteration of your transmissions or data</li>
              <li>Statements or conduct of any third party on our Services</li>
            </ul>
            <p className="mt-3">
              Nothing in these Terms shall limit our liability for negligence in the provision of pharmacy services, which is governed by applicable New York State professional liability standards.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Concordia Pharmacy, its affiliates, officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including reasonable attorneys' fees) arising out of your use of the Services, violation of these Terms, or infringement of any third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Governing Law & Dispute Resolution</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflict of law provisions. Any disputes arising from or relating to these Terms or your use of our Services shall be resolved exclusively in the state or federal courts located in Bronx County, New York.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Changes to These Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated "Last updated" date. Your continued use of the Services after any changes constitutes acceptance of the revised Terms. We encourage you to review these Terms periodically.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Severability</h2>
            <p>
              If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary so that these Terms shall otherwise remain in full force and effect.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Contact Us</h2>
            <p>If you have questions about these Terms of Service, please contact us:</p>
            <div className="mt-3 text-slate-400">
              <p className="text-white font-medium">Concordia Pharmacy</p>
              <p>898 East Tremont Ave, Bronx, NY 10460</p>
              <p>Phone: (718) 328-2833</p>
              <p>Email: legal@concordianyc.com</p>
            </div>
          </section>
        </div>
      </div>

      <SiteFooter />
    </PageTransition>
  );
}
