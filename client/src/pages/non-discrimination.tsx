import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { SEO } from "@/components/seo";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NonDiscrimination() {
  return (
    <PageTransition className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
      <SEO
        title="Non-Discrimination Notice"
        description="Concordia Pharmacy's non-discrimination notice. We do not discriminate on the basis of race, color, national origin, age, disability, or sex in our healthcare services."
        path="/non-discrimination"
      />
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <Link href="/">
          <span className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors cursor-pointer mb-8" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </span>
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" data-testid="text-nondiscrimination-title">Non-Discrimination Notice</h1>
        <p className="text-slate-300 text-sm mb-10">Last updated: June 4, 2025</p>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Our Commitment to Equal Access</h2>
            <p>
              Concordia Pharmacy complies with applicable federal and New York State civil rights laws and does not discriminate, exclude people, or treat them differently on the basis of:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-3 columns-2">
              <li>Race</li>
              <li>Color</li>
              <li>National origin</li>
              <li>Age</li>
              <li>Disability</li>
              <li>Sex</li>
              <li>Gender identity</li>
              <li>Sexual orientation</li>
              <li>Religion</li>
              <li>Immigration status</li>
              <li>Source of payment</li>
              <li>Limited English proficiency</li>
            </ul>
            <p className="mt-4">
              This policy applies to all pharmacy services, programs, and activities offered by Concordia Pharmacy, whether provided in person, by phone, through our website, or through the ConcordiaCare mobile application.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Section 1557 of the Affordable Care Act</h2>
            <p>
              Concordia Pharmacy complies with Section 1557 of the Affordable Care Act, which prohibits discrimination in health programs or activities that receive federal financial assistance (including Medicare and Medicaid). We do not discriminate in the provision of pharmacy services, including:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>Prescription dispensing and medication counseling</li>
              <li>Delivery services</li>
              <li>Specialty pharmacy programs</li>
              <li>Long-term care services</li>
              <li>Insurance verification and prior authorization assistance</li>
              <li>Clinical consultations and medication therapy management</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Language Assistance Services</h2>
            <p>
              Concordia Pharmacy provides free language assistance services to patients who have limited English proficiency or speak a language other than English. You have the right to receive this assistance at no cost to you.
            </p>
            <h3 className="text-white font-medium mb-2 mt-4">Available Language Services</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><span className="text-slate-300">Spanish:</span> Bilingual staff available in-store and by phone during all business hours</li>
              <li><span className="text-slate-300">Other languages:</span> Interpretation services available via phone or in-person by appointment</li>
              <li><span className="text-slate-300">Written translations:</span> Key documents can be translated upon request</li>
              <li><span className="text-slate-300">TTY/TDD:</span> Dial 711 (New York Relay Service) for telephone assistance</li>
            </ul>
            <p className="mt-3">
              To request language assistance, call us at <a href="tel:+17183282833" className="text-primary">(718) 328-2833</a> or ask any staff member when you visit.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Accessibility for Patients with Disabilities</h2>
            <p>
              We provide reasonable modifications and accommodations to ensure equal access for patients with disabilities:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-2">
              <li>Wheelchair-accessible pharmacy entrance and service counter</li>
              <li>Large-print prescription labels and patient information sheets available upon request</li>
              <li>Audio format for key pharmacy materials available upon request</li>
              <li>Sign language interpretation available for in-person visits with advance scheduling</li>
              <li>Delivery services available for patients who cannot travel to the pharmacy</li>
            </ul>
            <p className="mt-3">
              See our full <Link href="/accessibility"><span className="text-primary underline cursor-pointer">Accessibility Statement</span></Link> for more information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">How to File a Discrimination Complaint</h2>
            <p>
              If you believe you have been treated differently or discriminated against in any of our programs or services, you have the right to file a complaint. You will not be retaliated against for filing a complaint.
            </p>

            <h3 className="text-white font-medium mb-2 mt-4">File a Complaint with Concordia Pharmacy</h3>
            <p className="text-slate-400 mb-2">Contact our Civil Rights Coordinator:</p>
            <div className="text-slate-400">
              <p className="text-white font-medium">Civil Rights Coordinator: Concordia Pharmacy</p>
              <p>898 East Tremont Ave, Bronx, NY 10460</p>
              <p>Phone: <a href="tel:+17183282833" className="text-primary">(718) 328-2833</a></p>
              <p>Email: civilrights@concordianyc.com</p>
            </div>

            <h3 className="text-white font-medium mb-2 mt-5">File a Complaint with Federal Agencies</h3>
            <p className="text-slate-400 mb-2">You may also file a civil rights complaint with:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>
                <span className="text-slate-300">U.S. Department of Health and Human Services: Office for Civil Rights:</span><br />
                <a href="https://www.hhs.gov/ocr/complaints" target="_blank" rel="noopener noreferrer" className="text-primary">www.hhs.gov/ocr/complaints</a> &nbsp;|&nbsp; (800) 368-1019 &nbsp;|&nbsp; TDD: (800) 537-7697
              </li>
              <li>
                <span className="text-slate-300">U.S. Department of Justice: Civil Rights Division:</span><br />
                <a href="https://www.ada.gov/filing-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-primary">www.ada.gov/filing-a-complaint</a> &nbsp;|&nbsp; (800) 514-0301
              </li>
            </ul>

            <h3 className="text-white font-medium mb-2 mt-5">File a Complaint with New York State Agencies</h3>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>
                <span className="text-slate-300">New York State Division of Human Rights:</span><br />
                <a href="https://dhr.ny.gov" target="_blank" rel="noopener noreferrer" className="text-primary">dhr.ny.gov</a> &nbsp;|&nbsp; (888) 392-3644
              </li>
              <li>
                <span className="text-slate-300">New York State Department of Health: Office of Minority Health &amp; Health Disparities Prevention:</span><br />
                (518) 474-2002
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Taglines: Language Assistance Available</h2>
            <p className="text-slate-400 mb-4">If you need these services, call <a href="tel:+17183282833" className="text-primary">(718) 328-2833</a>.</p>
            <div className="space-y-2 text-slate-400">
              <p><span className="text-slate-300">Spanish / Español:</span> ATENCIÓN: si habla español, tiene a su disposición servicios gratuitos de asistencia lingüística. Llame al (718) 328-2833.</p>
              <p><span className="text-slate-300">Chinese / 中文:</span> 注意：如果您使用繁體中文，您可以免費獲得語言援助服務。請致電 (718) 328-2833。</p>
              <p><span className="text-slate-300">French / Français:</span> ATTENTION : Si vous parlez français, des services d'aide linguistique vous sont proposés gratuitement. Appelez le (718) 328-2833.</p>
              <p><span className="text-slate-300">Arabic / العربية:</span> تنبيه: إن كنت تتحدث اللغة العربية، فإن خدمات المساعدة اللغوية تتوافر لك بالمجان. اتصل بـ (718) 328-2833.</p>
              <p><span className="text-slate-300">Bengali / বাংলা:</span> মনোযোগ দিন: আপনি যদি বাংলা ভাষায় কথা বলেন, তাহলে বিনামূল্যে ভাষা সহায়তা পরিষেবা পাওয়া যাবে। (718) 328-2833 নম্বরে ফোন করুন।</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Related Policies</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><Link href="/privacy-policy"><span className="text-primary underline cursor-pointer">Privacy Policy</span></Link></li>
              <li><Link href="/accessibility"><span className="text-primary underline cursor-pointer">Accessibility Statement</span></Link></li>
              <li><Link href="/terms-of-service"><span className="text-primary underline cursor-pointer">Terms of Service</span></Link></li>
            </ul>
          </section>
        </div>
      </div>

      <SiteFooter />
    </PageTransition>
  );
}
