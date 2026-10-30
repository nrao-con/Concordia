import { Link } from "wouter";
import { SEO } from "@/components/seo";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { PageTransition } from "@/components/page-transition";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  Heart,
  Shield,
  Truck,
  Pill,
  Users,
  Award,
  Clock,
  MapPin,
  Phone,
  Globe,
  Stethoscope,
  Building2,
} from "lucide-react";
import concordiaLogo from "@assets/concordia_logo_trimmed_transparent.png";

const values = [
  {
    icon: Heart,
    title: "Patient-First Care",
    description: "Every decision we make starts with one question: what's best for our patients? We treat every person who walks through our doors like family.",
    color: "text-rose-400",
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
  },
  {
    icon: Shield,
    title: "Trust & Accuracy",
     description: "Licensed pharmacists verify every prescription and check your insurance in real time, so you get the right medication at the right price every time.",
    color: "text-primary",
    bg: "bg-primary/15",
    border: "border-primary/30",
  },
  {
    icon: Globe,
    title: "Community Connection",
    description: "We serve the Bronx and Manhattan with bilingual staff (English & Spanish) who understand the diverse needs of our neighborhoods.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
  },
  {
    icon: Truck,
    title: "Accessible Healthcare",
    description: "Free same-day delivery, GPS tracking, and flexible hours ensure your medications are always within reach, no matter your schedule.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
    border: "border-cyan-500/30",
  },
];

const differentiators = [
  {
    icon: Truck,
    label: "Free Same-Day Delivery",
    description: "Across the Bronx and Manhattan with live GPS tracking through the ConcordiaCare app.",
  },
  {
    icon: Pill,
    label: "Specialty Medications",
    description: "Full-service specialty pharmacy for complex conditions including oncology, rheumatology, and neurology.",
  },
  {
    icon: Shield,
    label: "Real-Time Insurance Processing",
     description: "We verify your coverage and check your copay before you fill, so there are never surprises at the counter.",
  },
  {
    icon: Globe,
    label: "English & Spanish Service",
     description: "Our bilingual team serves you in the language you're most comfortable with. Healthcare should not have a language barrier.",
  },
  {
    icon: Building2,
    label: "Long-Term Care",
    description: "Dedicated partnerships with nursing facilities, group homes, and assisted living communities.",
  },
  {
    icon: Stethoscope,
    label: "Clinical Services",
    description: "Flu shots, immunizations, medication therapy management, and blister packaging for adherence.",
  },
];

const team = [
  {
    name: "Lead Pharmacist",
    role: "PharmD, RPh",
    description: "Over 20 years of experience in community and specialty pharmacy. Dedicated to personalized patient care.",
  },
  {
    name: "Clinical Pharmacist",
    role: "PharmD, BCPS",
    description: "Board-certified specialist focused on medication therapy management and chronic disease care.",
  },
  {
    name: "Pharmacy Operations",
    role: "Manager",
    description: "Ensures seamless prescription processing, inventory management, and delivery coordination.",
  },
  {
    name: "Patient Care Team",
    role: "Technicians & Staff",
    description: "Bilingual team providing friendly, knowledgeable support for all your pharmacy needs.",
  },
];

function WordReveal({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <motion.span
          key={i}
          className="inline-block mr-[0.25em]"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -20px 0px" }}
          transition={{ delay: i * 0.02, duration: 0.35, ease: "easeOut" }}
        >
          {word}
        </motion.span>
      ))}
    </>
  );
}

export default function AboutUs() {
  return (
    <PageTransition>
      <SEO
        title="About Us"
        description="Learn about Concordia Pharmacy. We serve the Bronx and Manhattan with free same-day delivery, specialty medications, bilingual staff, and personalized care."
        path="/about"
      />
      <div className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
        <Header />

        <section className="relative py-20 overflow-hidden">
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
                <p className="text-sm uppercase tracking-widest text-primary mb-4" data-testid="text-about-label">About Concordia Pharmacy</p>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight" data-testid="text-about-heading">
                  Your Neighborhood Pharmacy,{" "}
                  <span className="text-primary">Reimagined</span>
                </h1>
                <p className="text-lg text-slate-200 leading-relaxed" data-testid="text-about-intro">
                  Concordia Pharmacy has been a trusted healthcare partner for families across the Bronx
                  and Manhattan. We combine the personal touch of a neighborhood pharmacy with the tools
                  and technology to deliver an experience that's anything but ordinary.
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="py-16" data-testid="about-story-section">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4" data-testid="text-story-heading">Our Story</h2>
                <div className="space-y-5 leading-relaxed">
                  <p className="text-slate-400">
                    <WordReveal text="Concordia Pharmacy opened its doors on East Tremont Avenue in the heart of the Bronx with a simple mission: provide the best pharmaceutical care to our community, one patient at a time." />
                  </p>
                  <p className="text-slate-400">
                    <WordReveal text="We've grown from a small corner pharmacy into a full-service healthcare destination, but our commitment to personal care has never changed. We still know our patients by name, remember their families, and go the extra mile to ensure every prescription is filled with precision and care." />
                  </p>
                  <p className="text-slate-400">
                    <WordReveal text="Today, we serve thousands of patients with free same-day delivery, specialty medications, long-term care partnerships, and the ConcordiaCare mobile app that puts your pharmacy in your pocket." />
                  </p>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="w-full max-w-sm rounded-md bg-slate-800/50 border border-slate-700/50 p-8 flex flex-col items-center gap-6">
                  <img src={concordiaLogo} alt="Concordia Pharmacy" className="h-20 w-auto" data-testid="img-about-logo" />
                  <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary" data-testid="text-stat-years">4.9 / 5</p>
                      <p className="text-xs text-slate-300 uppercase tracking-wider">Avg. Rating</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-emerald-400" data-testid="text-stat-patients">35K+</p>
                      <p className="text-xs text-slate-300 uppercase tracking-wider">Patients</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-cyan-400" data-testid="text-stat-delivery">Free</p>
                      <p className="text-xs text-slate-300 uppercase tracking-wider">Delivery</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-rose-400" data-testid="text-stat-languages">2</p>
                      <p className="text-xs text-slate-300 uppercase tracking-wider">Languages</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="py-16" data-testid="about-values-section">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <p className="text-sm uppercase tracking-widest text-primary mb-3">What Drives Us</p>
              <h2 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-values-heading">Our Values</h2>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {values.map((value, i) => (
                <motion.div
                  key={value.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="text-center p-6"
                >
                  <div className={`h-14 w-14 rounded-2xl ${value.bg} border ${value.border} flex items-center justify-center mx-auto mb-4`}>
                    <value.icon className={`h-7 w-7 ${value.color}`} aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2" data-testid={`text-value-title-${i}`}>{value.title}</h3>
                  <p className="text-sm text-slate-400">{value.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16" data-testid="about-differentiators-section">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <p className="text-sm uppercase tracking-widest text-primary mb-3">Why Concordia</p>
              <h2 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-diff-heading">What Sets Us Apart</h2>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {differentiators.map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                >
                  <Card className="bg-slate-800/40 border-slate-700/50 h-full">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="h-10 w-10 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
                          <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white mb-1" data-testid={`text-diff-label-${i}`}>{item.label}</h3>
                          <p className="text-sm text-slate-400">{item.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16" data-testid="about-team-section">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <p className="text-sm uppercase tracking-widest text-primary mb-3">The People Behind the Counter</p>
              <h2 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-team-heading">Our Team</h2>
              <p className="text-slate-400 mt-3 max-w-2xl mx-auto">
                Our dedicated team of pharmacists, technicians, and support staff work together to ensure
                you receive the highest quality care every visit.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {team.map((member, i) => (
                <motion.div
                  key={member.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="text-center"
                >
                  <div className="h-20 w-20 rounded-full bg-slate-700/50 border border-slate-600/50 flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-slate-400" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold text-white" data-testid={`text-team-name-${i}`}>{member.name}</h3>
                  <p className="text-xs text-primary mb-2">{member.role}</p>
                  <p className="text-sm text-slate-400">{member.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16" data-testid="about-location-section">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <Card className="bg-slate-800/40 border-slate-700/50">
                <CardContent className="p-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h2 className="text-xl font-bold text-white mb-4" data-testid="text-location-heading">Visit Us</h2>
                      <div className="space-y-4 text-sm text-slate-400">
                        <div className="flex items-start gap-3">
                          <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                          <span data-testid="text-about-address">898 East Tremont Ave<br />Bronx, NY 10460</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Phone className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
                          <a href="tel:+17183282833" className="hover:text-slate-300 transition-colors" data-testid="link-about-phone">(718) 328-2833</a>
                        </div>
                        <div className="flex items-start gap-3">
                          <Clock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                          <div data-testid="text-about-hours">
                            <p>Mon-Fri: 9:00 AM - 7:00 PM</p>
                            <p>Sat: 10:00 AM - 3:00 PM</p>
                            <p>Sun: Closed</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-4 justify-center">
                      <Link href="/signup">
                        <span className="inline-flex items-center gap-2 text-primary hover:text-primary/70 transition-colors text-sm font-medium cursor-pointer" data-testid="link-about-signup">
                          <Award className="h-4 w-4" aria-hidden="true" />
                          Become a Patient
                        </span>
                      </Link>
                      <Link href="/shop">
                        <span className="inline-flex items-center gap-2 text-primary hover:text-primary/70 transition-colors text-sm font-medium cursor-pointer" data-testid="link-about-shop">
                          <Pill className="h-4 w-4" aria-hidden="true" />
                          Browse Health Shop
                        </span>
                      </Link>
                      <Link href="/specialty">
                        <span className="inline-flex items-center gap-2 text-primary hover:text-primary/70 transition-colors text-sm font-medium cursor-pointer" data-testid="link-about-specialty">
                          <Stethoscope className="h-4 w-4" aria-hidden="true" />
                          Specialty Medications
                        </span>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </PageTransition>
  );
}
