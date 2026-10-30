export const SITE_URL = "https://concordianyc.com";
export const SITE_NAME = "Concordia Pharmacy";

export interface PublicPage {
  path: string;
  title: string;
  description: string;
  heading: string;
  summary: string;
  priority: string;
  changefreq: string;
}

export const PUBLIC_PAGES: PublicPage[] = [
  { path: "/", title: "Your Digital Healthcare Partner", description: "Concordia Pharmacy provides prescription fulfillment, specialty medications, immunizations, pharmacy delivery requests, and bilingual care in the Bronx.", heading: "Your neighborhood pharmacy, connected to your care", summary: "Concordia Pharmacy has served the Bronx since 1997 with prescription services, pharmacist support, specialty care, immunizations, and convenient medication delivery requests.", priority: "1.0", changefreq: "weekly" },
  { path: "/about", title: "About Us", description: "Learn about Concordia Pharmacy, an independent bilingual community pharmacy serving the Bronx and Manhattan since 1997.", heading: "About Concordia Pharmacy", summary: "Our pharmacists and care team help New Yorkers manage prescriptions, understand their medications, and access practical pharmacy services in English and Spanish.", priority: "0.8", changefreq: "monthly" },
  { path: "/faq", title: "Pharmacy FAQ", description: "Answers about prescriptions, delivery requests, insurance, immunizations, specialty medications, and services at Concordia Pharmacy.", heading: "Frequently asked pharmacy questions", summary: "Find clear answers about transferring prescriptions, insurance coverage, pharmacy hours, medication delivery requests, vaccinations, and specialty care.", priority: "0.7", changefreq: "monthly" },
  { path: "/contact", title: "Contact Us", description: "Contact Concordia Pharmacy at 898 East Tremont Avenue in the Bronx for prescription and pharmacy service support.", heading: "Contact Concordia Pharmacy", summary: "Visit us at 898 East Tremont Avenue, Bronx, NY 10460, or call our pharmacy team at (718) 328-2833 for help with prescriptions and services.", priority: "0.7", changefreq: "monthly" },
  { path: "/blog", title: "Pharmacy Health Blog", description: "Read practical medication, wellness, insurance, and pharmacy care guidance from Concordia Pharmacy.", heading: "Health and pharmacy insights", summary: "Explore articles from the Concordia Pharmacy team about medication access, preventive care, insurance questions, and everyday wellness.", priority: "0.8", changefreq: "daily" },
  { path: "/shop", title: "Shop Pharmacy Essentials", description: "Shop over-the-counter health, wellness, and personal care essentials from Concordia Pharmacy.", heading: "Shop pharmacy essentials", summary: "Browse over-the-counter medicines, vitamins, supplements, and personal care products available from your neighborhood pharmacy.", priority: "0.8", changefreq: "weekly" },
  { path: "/specialty", title: "Specialty Pharmacy Services", description: "Specialty medication support, prior authorization help, and coordinated pharmacy care from Concordia Pharmacy.", heading: "Specialty pharmacy support", summary: "Our team supports complex therapies with benefits coordination, prior authorization assistance, medication access guidance, and pharmacist follow-up.", priority: "0.8", changefreq: "monthly" },
  { path: "/ltc-partnership", title: "Long-Term Care Pharmacy Services", description: "Pharmacy services for assisted living, nursing, rehabilitation, and other long-term care partners in New York.", heading: "Long-term care pharmacy partnerships", summary: "Concordia Pharmacy works with care facilities on medication packaging, delivery coordination, compliance support, and responsive pharmacist service.", priority: "0.7", changefreq: "monthly" },
  { path: "/schedule-flu-shot", title: "Schedule a Flu Shot", description: "Request a flu vaccination appointment at Concordia Pharmacy in the Bronx.", heading: "Schedule your flu shot", summary: "Protect yourself and your community by requesting a convenient flu vaccination appointment with the Concordia Pharmacy team.", priority: "0.7", changefreq: "monthly" },
  { path: "/find-doctor", title: "Find a Doctor", description: "Find a local healthcare provider through Concordia Pharmacy's doctor matching directory.", heading: "Find a doctor near you", summary: "Answer a few questions to explore local healthcare providers whose services may fit your needs and preferences.", priority: "0.8", changefreq: "monthly" },
  { path: "/wellness", title: "Wellness Resources", description: "Explore trustworthy wellness information and preventive health resources selected by Concordia Pharmacy.", heading: "Wellness resources for everyday health", summary: "Find practical health information and preventive care guidance from trusted public health sources and the Concordia Pharmacy team.", priority: "0.8", changefreq: "weekly" },
  { path: "/rx-savings", title: "Prescription Savings Help", description: "Explore prescription savings options and request help lowering medication costs with Concordia Pharmacy.", heading: "Save on your prescriptions", summary: "Our pharmacy team can help review discount options, assistance programs, and other ways to reduce eligible prescription costs.", priority: "0.8", changefreq: "monthly" },
  { path: "/accessibility", title: "Accessibility", description: "Read Concordia Pharmacy's commitment to accessible digital pharmacy services.", heading: "Accessibility at Concordia Pharmacy", summary: "We work to make our website and pharmacy services accessible and welcome feedback about barriers or accommodations.", priority: "0.3", changefreq: "yearly" },
  { path: "/non-discrimination", title: "Non-Discrimination Notice", description: "Read Concordia Pharmacy's notice of non-discrimination and language assistance services.", heading: "Non-discrimination notice", summary: "Concordia Pharmacy provides services without unlawful discrimination and supports patients who need language or accessibility assistance.", priority: "0.3", changefreq: "yearly" },
  { path: "/cookie-policy", title: "Cookie Policy", description: "Learn how Concordia Pharmacy uses cookies and related technologies on this website.", heading: "Cookie policy", summary: "This policy explains the cookies and similar technologies used to operate, understand, and improve the Concordia Pharmacy website.", priority: "0.3", changefreq: "yearly" },
  { path: "/privacy-policy", title: "Privacy Policy", description: "Read the Concordia Pharmacy website privacy policy.", heading: "Privacy policy", summary: "Learn what information this website collects, how it is used, and the choices available to visitors.", priority: "0.3", changefreq: "yearly" },
  { path: "/terms-of-service", title: "Terms of Service", description: "Read the terms governing use of the Concordia Pharmacy website and online services.", heading: "Terms of service", summary: "These terms explain the conditions that apply when using the Concordia Pharmacy website and online services.", priority: "0.3", changefreq: "yearly" },
  { path: "/sitemap", title: "Website Sitemap", description: "Browse the public pages and services available on the Concordia Pharmacy website.", heading: "Concordia Pharmacy website sitemap", summary: "Use this page to find pharmacy services, health resources, company information, and website policies.", priority: "0.4", changefreq: "monthly" },
];

export const PUBLIC_PAGE_BY_PATH = new Map(PUBLIC_PAGES.map((page) => [page.path, page]));

const SPA_ROUTE_PATTERNS = [
  /^\/(?:login|signup|complete-profile|cart|checkout|express-checkout|my-tickets|my-orders|profile|admin-login|staff)\/?$/,
  /^\/admin(?:\/.*)?$/,
  /^\/pa-sign\/[^/]+\/?$/,
];

export function isKnownSpaRoute(pathname: string): boolean {
  return SPA_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}