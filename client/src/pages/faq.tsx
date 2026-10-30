import { useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/seo";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { PageTransition } from "@/components/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck,
  Pill,
  Shield,
  Clock,
  Smartphone,
  Gift,
  Plus,
} from "lucide-react";

const faqCategories = [
  {
    id: "delivery",
    icon: Truck,
    title: "Delivery & Shipping",
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
    border: "border-cyan-500/30",
    questions: [
      {
        q: "Is delivery really free?",
        a: "Yes. We offer free same-day delivery across the Bronx and Manhattan for all prescriptions and OTC orders. There are no hidden fees or minimum order requirements.",
      },
      {
        q: "How long does delivery take?",
        a: "Most prescriptions are delivered the same day they are filled. For orders placed before 3 PM, you can typically expect delivery by the end of the business day. Rush delivery is available for urgent medications.",
      },
      {
        q: "Can I track my delivery?",
        a: "Yes. Through the ConcordiaCare mobile app, you can track your delivery in real time with live GPS. You'll receive notifications when your order is picked up, in transit, and delivered.",
      },
      {
        q: "What areas do you deliver to?",
        a: "We currently deliver throughout the Bronx and Manhattan. If you're unsure whether your address is in our delivery zone, give us a call at (718) 328-2833 and we'll let you know.",
      },
      {
        q: "What if I'm not home when my delivery arrives?",
        a: "Our delivery team will attempt to reach you by phone. If we can't deliver in person, we'll leave instructions for a safe drop-off or arrange a redelivery at a time that works for you.",
      },
    ],
  },
  {
    id: "prescriptions",
    icon: Pill,
    title: "Prescriptions & Transfers",
    color: "text-primary",
    bg: "bg-primary/15",
    border: "border-primary/30",
    questions: [
      {
        q: "How do I transfer my prescriptions to Concordia?",
        a: "It's simple. Just call us at (718) 328-2833 or use the transfer form on our website. Provide your current pharmacy's name and we'll handle everything, including contacting your previous pharmacy and transferring all your prescriptions. Most transfers are completed the same day.",
      },
      {
        q: "Can I refill my prescriptions online?",
        a: "Yes. You can request refills through the ConcordiaCare mobile app or by calling us directly. We'll process your refill and notify you when it's ready for pickup or delivery.",
      },
      {
        q: "How long does it take to fill a new prescription?",
        a: "Most new prescriptions are filled within 15-30 minutes for in-store pickup. If your prescription requires prior authorization from your insurance, we'll work with your doctor's office to resolve it as quickly as possible.",
      },
      {
        q: "Do you offer blister packaging?",
        a: "Yes. We offer customized blister pack packaging to help patients manage complex medication schedules. Each pack is organized by day and time, making it easy to take the right medications at the right time. This service is especially popular with elderly patients and caregivers.",
      },
      {
        q: "Can you compound medications?",
        a: "We work with trusted compounding partners to provide custom-compounded medications when commercially available options don't meet a patient's needs. Talk to our pharmacist about your specific requirements.",
      },
    ],
  },
  {
    id: "insurance",
    icon: Shield,
    title: "Insurance & Payments",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    questions: [
      {
        q: "What insurance plans do you accept?",
        a: "We accept most major insurance plans, including Medicare Part D, Medicaid, and commercial plans. Our team processes your insurance in real time using our PrimeRx system, so you'll know your copay before you leave. If you're unsure whether we accept your plan, call us and we'll verify it for you.",
      },
      {
        q: "What if I don't have insurance?",
        a: "We offer competitive cash prices and can help you find discount programs or manufacturer coupons to reduce your out-of-pocket costs. Our pharmacists will work with you to find the most affordable option for every medication.",
      },
      {
        q: "Do you accept GoodRx or other discount cards?",
        a: "Yes, we accept most prescription discount cards including GoodRx, SingleCare, and others. Our team will automatically compare your discount card price against your insurance copay to ensure you get the best price.",
      },
      {
        q: "Can you help with prior authorizations?",
        a: "Absolutely. When your insurance requires prior authorization for a medication, our pharmacy team works directly with your doctor's office to submit the necessary paperwork and follow up until it's approved.",
      },
    ],
  },
  {
    id: "hours",
    icon: Clock,
    title: "Hours & Location",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
    questions: [
      {
        q: "What are your hours of operation?",
        a: "We are open Monday through Friday from 9:00 AM to 7:00 PM, Saturday from 10:00 AM to 3:00 PM, and closed on Sundays. Holiday hours may vary and will be posted on our website and the ConcordiaCare app.",
      },
      {
        q: "Where are you located?",
        a: "We're located at 898 East Tremont Avenue, Bronx, NY 10460. We're easily accessible by public transit and there is street parking available nearby.",
      },
      {
        q: "Do I need an appointment?",
        a: "No appointment is needed for prescription pickups or general pharmacy services. For flu shots and immunizations, walk-ins are welcome but scheduling through our website ensures minimal wait time.",
      },
      {
        q: "Do you offer any services in Spanish?",
        a: "Yes. Our team includes bilingual staff members who are fluent in both English and Spanish. We're committed to serving our diverse community in the language they're most comfortable with.",
      },
    ],
  },
  {
    id: "app",
    icon: Smartphone,
    title: "ConcordiaCare App",
    color: "text-violet-400",
    bg: "bg-violet-500/15",
    border: "border-violet-500/30",
    questions: [
      {
        q: "What is the ConcordiaCare app?",
        a: "ConcordiaCare is our mobile app that puts your pharmacy in your pocket. You can manage prescriptions, request refills, track deliveries in real time, communicate with our pharmacy team, and access your medication history, all from your phone.",
      },
      {
        q: "How do I get the ConcordiaCare app?",
        a: "ConcordiaCare is available for download on both iOS and Android devices. Ask our pharmacy team for the download link, or visit our website to learn more about the app's features.",
      },
      {
        q: "Can I message the pharmacy through the app?",
        a: "Yes. The ConcordiaCare app includes a secure messaging feature that lets you communicate directly with our pharmacy team. You can ask questions about your medications, request refills, or get updates on your prescriptions.",
      },
      {
        q: "Is my health information secure in the app?",
        a: "Absolutely. ConcordiaCare is built with HIPAA-compliant security standards. All health data is encrypted in transit and at rest, and we never share your personal information with third parties.",
      },
    ],
  },
  {
    id: "loyalty",
    icon: Gift,
    title: "Loyalty & Rewards",
    color: "text-rose-400",
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
    questions: [
      {
        q: "Do you have a loyalty program?",
        a: "Yes. Our loyalty rewards program lets you earn points on every purchase, both prescriptions and OTC products. Points can be redeemed for discounts on future purchases in our health shop.",
      },
      {
        q: "How do I join the loyalty program?",
        a: "You're automatically enrolled when you become a Concordia patient. You can track your points and rewards through the ConcordiaCare app or ask our staff at the counter.",
      },
      {
        q: "Do you have a referral program?",
        a: "Yes. When you refer a friend or family member to Concordia Pharmacy, both you and the person you refer receive bonus loyalty points once they fill their first prescription with us.",
      },
    ],
  },
];

function FAQItem({ q, a, testId, contentTestId }: {
  q: string; a: string; testId: string; contentTestId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06]">
      <button
        className="w-full text-left py-7 flex items-start justify-between gap-6"
        onClick={() => setOpen(!open)}
        data-testid={testId}
      >
        <span className="text-lg md:text-xl font-semibold text-white leading-snug">{q}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="shrink-0 mt-0.5"
        >
          <Plus className="h-5 w-5 text-primary" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32, opacity: { duration: 0.15 } }}
            className="overflow-hidden"
            data-testid={contentTestId}
          >
            <p className="text-slate-400 leading-relaxed pb-7 pr-8">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQ() {
  return (
    <PageTransition>
      <SEO
        title="Frequently Asked Questions"
        description="Find answers to common questions about Concordia Pharmacy's services including free delivery, prescription transfers, insurance, hours, the ConcordiaCare app, and loyalty rewards."
        path="/faq"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Is delivery really free?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes. We offer free same-day delivery across the Bronx and Manhattan for all prescriptions and OTC orders. There are no hidden fees or minimum order requirements." }
            },
            {
              "@type": "Question",
              "name": "How long does delivery take?",
              "acceptedAnswer": { "@type": "Answer", "text": "Most prescriptions are delivered the same day they are filled. For orders placed before 3 PM, you can typically expect delivery by the end of the business day." }
            },
            {
              "@type": "Question",
              "name": "How do I transfer my prescriptions to Concordia?",
              "acceptedAnswer": { "@type": "Answer", "text": "Just call us at (718) 328-2833 or use the transfer form on our website. Provide your current pharmacy's name and we'll handle everything. Most transfers are completed the same day." }
            },
            {
              "@type": "Question",
              "name": "Can I refill my prescriptions online?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes. You can request refills through the ConcordiaCare mobile app or by calling us directly. We'll process your refill and notify you when it's ready for pickup or delivery." }
            },
            {
              "@type": "Question",
              "name": "What insurance plans do you accept?",
              "acceptedAnswer": { "@type": "Answer", "text": "We accept most major insurance plans, including Medicare Part D, Medicaid, and commercial plans. If you're unsure whether we accept your plan, call us and we'll verify it for you." }
            },
            {
              "@type": "Question",
              "name": "Do you accept GoodRx or other discount cards?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes, we accept most prescription discount cards including GoodRx and SingleCare. Our team will automatically compare your discount card price against your insurance copay to ensure you get the best price." }
            },
            {
              "@type": "Question",
              "name": "What are your hours of operation?",
              "acceptedAnswer": { "@type": "Answer", "text": "We are open Monday through Friday from 9:00 AM to 7:00 PM and Saturday from 10:00 AM to 3:00 PM. Closed Sundays." }
            },
            {
              "@type": "Question",
              "name": "Where are you located?",
              "acceptedAnswer": { "@type": "Answer", "text": "We're located at 898 East Tremont Avenue, Bronx, NY 10460. Easily accessible by public transit with street parking available nearby." }
            },
            {
              "@type": "Question",
              "name": "Do I need an appointment for a flu shot?",
              "acceptedAnswer": { "@type": "Answer", "text": "No appointment is needed. Walk-ins are welcome for flu shots and immunizations. Scheduling through our website ensures minimal wait time." }
            },
            {
              "@type": "Question",
              "name": "Do you offer any services in Spanish?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes. Our team includes bilingual staff members who are fluent in both English and Spanish. We're committed to serving our diverse community in the language they're most comfortable with." }
            },
            {
              "@type": "Question",
              "name": "Do you have a loyalty program?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes. Our loyalty rewards program lets you earn points on every purchase, including prescriptions and OTC products. Points can be redeemed for discounts on future purchases." }
            }
          ]
        })}</script>
      </Helmet>
      <div className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
        <Header />

        <section className="relative py-16 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-transparent to-slate-950" />
          </div>
          <div className="container mx-auto px-4 relative">
            <div className="max-w-3xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <p className="text-sm uppercase tracking-widest text-primary mb-4" data-testid="text-faq-label">Help Center</p>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight" data-testid="text-faq-heading">
                  Frequently Asked{" "}
                  <span className="text-primary">Questions</span>
                </h1>
                <p className="text-lg text-slate-200" data-testid="text-faq-intro">
                  Everything you need to know about Concordia Pharmacy. Can't find what you're looking for?{" "}
                  <a href="tel:+17183282833" className="text-primary hover:text-primary/70 transition-colors" data-testid="link-faq-phone">
                    Call us at (718) 328-2833
                  </a>.
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="pb-20" data-testid="faq-categories-section">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              {faqCategories.map((category, catIndex) => {
                const Icon = category.icon;
                return (
                  <motion.div
                    key={category.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.1 }}
                    transition={{ delay: catIndex * 0.05, duration: 0.4 }}
                    data-testid={`faq-category-${category.id}`}
                    className="mb-10 last:mb-0"
                  >
                    <div className="flex items-center gap-2 mb-1 pt-2">
                      <Icon className={`h-3.5 w-3.5 ${category.color}`} aria-hidden="true" />
                      <p className={`text-xs uppercase tracking-widest font-semibold ${category.color}`} data-testid={`text-faq-category-title-${category.id}`}>
                        {category.title}
                      </p>
                    </div>
                    {category.questions.map((item, qIndex) => (
                      <FAQItem
                        key={qIndex}
                        q={item.q}
                        a={item.a}
                        testId={`faq-trigger-${category.id}-${qIndex}`}
                        contentTestId={`faq-content-${category.id}-${qIndex}`}
                      />
                    ))}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="pb-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center rounded-md bg-slate-800/40 border border-slate-700/50 p-8">
              <h2 className="text-xl font-bold text-white mb-2" data-testid="text-faq-contact-heading">Still Have Questions?</h2>
              <p className="text-slate-400 mb-4">Our team is here to help. Reach out anytime during business hours.</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="tel:+17183282833"
                  className="text-primary hover:text-primary/70 transition-colors text-sm font-medium"
                  data-testid="link-faq-call"
                >
                  Call (718) 328-2833
                </a>
                <span className="hidden sm:inline text-slate-400">|</span>
                <Link href="/about">
                  <span className="text-primary hover:text-primary/70 transition-colors text-sm font-medium cursor-pointer" data-testid="link-faq-about">
                    Visit Us
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </PageTransition>
  );
}
