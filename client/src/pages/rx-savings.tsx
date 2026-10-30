import { useRef, useEffect, useState } from "react";
import { Link } from "wouter";
import { PostSubmissionCTA } from "@/components/post-submission-cta";
import { SEO } from "@/components/seo";
import { motion, useReducedMotion, useInView } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MotionButton } from "@/components/motion-button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  dismantlingStaggerGrid,
  dismantlingCardEntrance,
  dismantlingSectionEntrance,
} from "@/lib/animations";
import {
  BadgeDollarSign, CheckCircle2, ClipboardList, ScanLine, Wallet,
  Phone, ArrowRight, Tag, Pill, HeartHandshake, Building,
  CreditCard, Stethoscope, X, TrendingDown, Zap, ShieldCheck, UserCheck,
  Loader2, Send,
} from "lucide-react";

function CountUp({ end, suffix = "", prefix = "", duration = 1.8 }: {
  end: number; suffix?: string; prefix?: string; duration?: number;
}) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!inView) return;
    if (shouldReduceMotion) { setVal(end); return; }
    let start = 0;
    const steps = 60;
    const increment = end / steps;
    const iv = (duration * 1000) / steps;
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) { setVal(end); clearInterval(timer); }
      else setVal(start);
    }, iv);
    return () => clearInterval(timer);
  }, [inView, end, duration, shouldReduceMotion]);

  return <span ref={ref}>{prefix}{Math.floor(val)}{suffix}</span>;
}

const PROGRAMS = [
  { icon: Tag,            label: "Manufacturer Coupons",        desc: "Direct from drug makers. Often $0 copay." },
  { icon: HeartHandshake, label: "Patient Assistance Programs", desc: "Free or near-free meds for qualifying patients" },
  { icon: Building,       label: "State Pharmaceutical Aid",    desc: "NY, NJ & CT government assistance programs" },
  { icon: Pill,           label: "Medicare Extra Help",         desc: "Low-Income Subsidy & Part D cost reduction" },
  { icon: CreditCard,     label: "Discount Card Networks",      desc: "GoodRx-style pricing on thousands of drugs" },
  { icon: Stethoscope,    label: "Specialty Copay Cards",       desc: "Brand biologics & high-cost drug programs" },
];

const BENEFITS = [
  { icon: Zap,        title: "Automatic Price Checking",   desc: "Every fill, every time. We run the comparison before you reach the counter. You never have to ask." },
  { icon: ShieldCheck, title: "Zero Effort for You",       desc: "No apps to download, no coupons to clip, no searching online. Hand us the prescription and we handle the rest." },
  { icon: UserCheck,  title: "Expert Guidance",            desc: "If your medication isn't covered, we find the best cash price or coordinate with your doctor on an affordable alternative." },
];

const STEPS = [
  { icon: ClipboardList, step: "01", title: "Drop Off Your Prescription", desc: "In person, e-script, or fax. We accept all formats from any prescriber.", testId: "step-bring" },
  { icon: ScanLine,      step: "02", title: "We Scan Every Program",      desc: "Our pharmacists compare your insurance against 300+ savings programs in real time.", testId: "step-scan" },
  { icon: Wallet,        step: "03", title: "You Pay the Lowest Price",   desc: "If a coupon beats your copay, we apply it. No questions, no paperwork. It just happens.", testId: "step-pay" },
];

const FAQS = [
  { q: "Do I need to find the coupons myself?",           a: "Never. Our pharmacists run the comparison for you at every fill. It's built into how we work, not a special request." },
  { q: "What if my medication isn't covered?",            a: "We find the best available cash-discount price, or coordinate with your doctor on a clinically equivalent, more affordable option." },
  { q: "Does this cost anything extra?",                  a: "No. It's included in the service. Every patient, every prescription, every time, at no additional charge." },
  { q: "How much can I actually save?",                   a: "Patients regularly save 40% to 80% off retail. Brand-name medications often have manufacturer coupons worth hundreds of dollars per month." },
];

function SavingsRequestSection() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", medication: "" });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/savings-requests", {
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        medication: data.medication || undefined,
      });
      if (!res.ok) throw new Error("Submission failed");
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
    onError: () => toast({ title: "Something went wrong", description: "Please try calling us directly.", variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Required fields missing", description: "Please enter your name and phone number.", variant: "destructive" });
      return;
    }
    mutation.mutate(form);
  }

  return (
    <section className="border-t border-white/5 py-20 sm:py-24" style={{ background: "hsl(222 47% 6%)" }} data-testid="section-savings-cta">
      <div className="container mx-auto px-4 max-w-5xl">
        <motion.div
          variants={dismantlingSectionEntrance}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center p-4 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-white/[0.06] mb-6">
            <BadgeDollarSign className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Ready to Start Saving?</h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Send us your info and we'll reach out, or pick up the phone and we'll find you a better price right now.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* ── Left: quick form ── */}
          <motion.div
            variants={dismantlingCardEntrance(0)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            <Card className="border-white/[0.08]" style={{ background: "hsl(222 47% 9%)" }}>
              <CardContent className="p-6">
                {submitted ? (
                  <div className="py-4">
                    <PostSubmissionCTA confirmationMessage="We got your request! One of our pharmacists will be in touch shortly." />
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-savings-request">
                    <p className="text-white font-semibold text-base mb-1">Request a savings check</p>
                    <p className="text-slate-500 text-sm mb-3">We'll contact you within one business day.</p>

                    <div className="space-y-1.5">
                      <Label htmlFor="sr-name" className="text-slate-300 text-sm">Full Name <span className="text-primary">*</span></Label>
                      <Input
                        id="sr-name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Jane Smith"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-primary/50"
                        data-testid="input-savings-name"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="sr-phone" className="text-slate-300 text-sm">Phone Number <span className="text-primary">*</span></Label>
                      <Input
                        id="sr-phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="(718) 555-0100"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-primary/50"
                        data-testid="input-savings-phone"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="sr-medication" className="text-slate-300 text-sm">Medication Name <span className="text-slate-600">(optional)</span></Label>
                      <Input
                        id="sr-medication"
                        value={form.medication}
                        onChange={(e) => setForm((f) => ({ ...f, medication: e.target.value }))}
                        placeholder="e.g. Ozempic, Eliquis, Trulicity…"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-primary/50"
                        data-testid="input-savings-medication"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="sr-email" className="text-slate-300 text-sm">Email <span className="text-slate-600">(optional)</span></Label>
                      <Input
                        id="sr-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="jane@example.com"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-primary/50"
                        data-testid="input-savings-email"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full gap-2"
                      disabled={mutation.isPending}
                      data-testid="button-savings-submit"
                    >
                      {mutation.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
                      ) : (
                        <><Send className="h-4 w-4" />Send My Request</>
                      )}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Right: call CTA ── */}
          <motion.div
            variants={dismantlingCardEntrance(1)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="flex flex-col gap-5"
          >
            <Card className="border-white/[0.08]" style={{ background: "hsl(222 47% 9%)" }}>
              <CardContent className="p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-full bg-primary/10 border border-primary/20 p-2.5">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Prefer to talk?</p>
                    <p className="text-slate-500 text-xs">We're here during pharmacy hours</p>
                  </div>
                </div>
                <a href="tel:+17183282833" data-testid="cta-call-bottom">
                  <Button size="lg" variant="outline" className="w-full gap-2 text-base border-white/20 text-white hover:border-primary/40">
                    <Phone className="h-5 w-5 text-primary" />
                    (718) 328-2833
                  </Button>
                </a>
                <p className="text-slate-600 text-xs text-center">
                  Tell us your medication. We'll find you a better price on the spot.
                </p>
              </CardContent>
            </Card>

            <Card className="border-white/[0.08]" style={{ background: "hsl(222 47% 9%)" }}>
              <CardContent className="p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-full bg-primary/10 border border-primary/20 p-2.5">
                    <ArrowRight className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Transfer your prescriptions</p>
                    <p className="text-slate-500 text-xs">Save starting with your very next fill</p>
                  </div>
                </div>
                <a href="/signup" data-testid="cta-transfer-bottom">
                  <Button size="lg" className="w-full gap-2 text-base">
                    Get Started. It's Free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
                <p className="text-slate-600 text-xs text-center">
                  Takes 2 minutes. No credit card required.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default function RxSavings() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <PageTransition className="clinical-dark-page min-h-screen flex flex-col" style={{ background: "hsl(222 47% 8%)" }}>
      <SEO
        title="Prescription Savings"
        description="Concordia Pharmacy automatically compares your insurance against manufacturer coupons and discount programs at every fill, so you always pay the lowest price. No apps, no effort."
        path="/rx-savings"
        image="/images/rx-savings-consult.png"
      />

        <Header />

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section className="py-24 sm:py-32 text-center relative" data-testid="section-rx-savings-hero">
          <div className="container mx-auto px-4 max-w-3xl">
            <motion.div
              variants={dismantlingSectionEntrance}
              initial="hidden"
              animate="visible"
            >
              <Badge variant="outline" className="mb-6 border-primary/30 text-primary bg-primary/10 gap-1.5">
                <BadgeDollarSign className="h-3 w-3" />
                Prescription Savings Guarantee
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-6">
                Stop Overpaying{" "}
                <span className="text-primary">at the Pharmacy.</span>
              </h1>
              <p className="text-lg sm:text-xl text-slate-300 mb-3 leading-relaxed max-w-2xl mx-auto">
                We automatically scan <strong className="text-white">300+ savings programs</strong> at
                every fill: manufacturer coupons, patient assistance, and discount networks, and
                apply whichever beats your insurance copay.
              </p>
              <p className="text-slate-500 mb-10">No app. No coupon clipping. No asking. It just happens.</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <a href="/signup" data-testid="cta-transfer-hero">
                  <MotionButton size="lg" className="gap-2">
                    Transfer Your Prescriptions
                    <ArrowRight className="h-5 w-5" />
                  </MotionButton>
                </a>
                <a href="tel:+17183282833" data-testid="cta-call-hero">
                  <MotionButton size="lg" variant="outline" className="gap-2">
                    <Phone className="h-5 w-5" />
                    Call to Check Your Meds
                  </MotionButton>
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── STAT STRIP ───────────────────────────────────────────────── */}
        <div className="border-y border-white/[0.05]">
          <div className="container mx-auto px-4 py-10 max-w-5xl">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.05]">
              {([
                { val: 80,  suffix: "%",  label: "Savings vs. retail",      prefix: "Up to " },
                { val: 300, suffix: "+",  label: "Programs checked per fill", prefix: "" },
                { val: 35,  suffix: "K+", label: "Patients already saving",  prefix: "" },
                { val: 0,   suffix: "$",  label: "Extra cost to you",        prefix: "" },
              ] as const).map((s, i) => (
                <motion.div
                  key={i}
                  className="text-center px-6 py-2"
                  variants={dismantlingSectionEntrance}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.5 }}
                >
                  <p className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                    <CountUp end={s.val} suffix={s.suffix} prefix={s.prefix} />
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* ── PHOTO + PROGRAMS ─────────────────────────────────────────── */}
        <section className="py-20 sm:py-24 border-t border-white/5" data-testid="section-programs">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid lg:grid-cols-2 gap-14 items-center">

              {/* Photo */}
              <motion.div
                variants={dismantlingSectionEntrance}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                className="flex flex-col gap-4"
              >
                <div className="rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center p-4">
                  <img
                    src="/images/rx-savings-consult.png"
                    alt="Concordia pharmacist consulting with a patient"
                    className="w-full h-auto object-contain"
                    style={{ maxHeight: 420 }}
                    loading="lazy"
                  />
                </div>
                <div className="flex items-start justify-between gap-4 px-1">
                  <p className="text-sm text-slate-400 leading-relaxed italic">
                    &ldquo;Our pharmacist checks every savings program so you never have to.&rdquo;
                  </p>
                  <Badge className="flex-shrink-0 gap-1.5 bg-emerald-500/20 text-emerald-300 border-emerald-400/30">
                    <TrendingDown className="h-3 w-3" />
                    Up to 80% off
                  </Badge>
                </div>
              </motion.div>

              {/* Programs grid */}
              <div>
                <motion.div
                  variants={dismantlingSectionEntrance}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.3 }}
                  className="mb-8"
                >
                  <Badge variant="outline" className="mb-4 border-primary/30 text-primary/80 bg-primary/10">
                    What We Check
                  </Badge>
                  <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
                    Every Program.<br />
                    <span className="text-primary">Every Single Fill.</span>
                  </h2>
                  <p className="text-slate-400 leading-relaxed">
                    Most pharmacies only run your insurance. We go further by comparing against
                    every applicable savings source before you pay a cent.
                  </p>
                </motion.div>

                <motion.div
                  className="grid sm:grid-cols-2 gap-3"
                  variants={dismantlingStaggerGrid}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.2 }}
                >
                  {PROGRAMS.map((p, i) => (
                    <motion.div key={p.label} variants={dismantlingCardEntrance(i)}>
                      <Card className="h-full border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
                            <p.icon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white leading-tight">{p.label}</p>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{p.desc}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PRICE DROP EXAMPLE ───────────────────────────────────────── */}
        <section className="clinical-section-alt py-20 sm:py-24 border-t border-white/5" data-testid="section-comparison">
          <div className="container mx-auto px-4 max-w-5xl">
            <motion.div
              variants={dismantlingSectionEntrance}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              className="text-center mb-12"
            >
              <Badge variant="outline" className="mb-4 border-primary/30 text-primary/80 bg-primary/10">
                Real Example
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
                See the Difference in Numbers
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto">
                This happens at our counter every day. Here's a real medication, real programs, real savings.
              </p>
            </motion.div>

            <motion.div
              variants={dismantlingSectionEntrance}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
            >
              <Card className="border-white/[0.06] bg-white/[0.02] backdrop-blur-sm max-w-2xl mx-auto">
                <CardContent className="p-8">
                  <p className="text-xs font-mono tracking-widest text-slate-500 uppercase mb-8 text-center">
                    Eliquis 5mg. 60 tablets (30-day supply)
                  </p>

                  {/* Before */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-red-500/[0.05] border border-red-500/[0.12] mb-3">
                    <div className="flex items-center gap-3">
                      <X className="h-4 w-4 text-red-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-slate-300">Standard insurance copay</p>
                        <p className="text-xs text-slate-500">What most pharmacies charge</p>
                      </div>
                    </div>
                    <span className="text-xl font-bold text-slate-500 line-through font-mono">$340</span>
                  </div>

                  {/* Connector */}
                  <div className="flex justify-center my-3">
                    <TrendingDown className="h-5 w-5 text-emerald-400" />
                  </div>

                  {/* After */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/[0.18] mb-6">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-white">With Concordia coupon applied</p>
                        <p className="text-xs text-slate-500">Manufacturer coupon auto-applied</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-emerald-400 font-mono">
                        $<CountUp end={12} suffix="" duration={1.4} />
                      </p>
                      <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20 mt-1">
                        96% off retail
                      </Badge>
                    </div>
                  </div>

                  <div className="rounded-lg bg-primary/[0.04] border border-primary/[0.12] p-4">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      <span className="text-primary font-semibold">How it happened: </span>
                      Bristol Myers Squibb's manufacturer coupon for Eliquis covered the gap between
                      insurance and retail. Automatically applied at the counter.
                      Patient paid nothing extra beyond $12.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* ── WHY CONCORDIA ─────────────────────────────────────────────── */}
        <section className="py-20 sm:py-24 border-t border-white/5" data-testid="section-benefits">
          <div className="container mx-auto px-4 max-w-5xl">
            <motion.div
              variants={dismantlingSectionEntrance}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              className="text-center mb-12"
            >
              <Badge variant="outline" className="mb-4 border-primary/30 text-primary/80 bg-primary/10">
                Why Choose Us
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
                We Do the Heavy Lifting
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto">
                So you never have to choose between your health and your wallet.
              </p>
            </motion.div>

            <motion.div
              className="grid sm:grid-cols-3 gap-5"
              variants={dismantlingStaggerGrid}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
            >
              {BENEFITS.map((b, i) => (
                <motion.div key={b.title} variants={dismantlingCardEntrance(i)}>
                  <Card className="h-full border-white/[0.06] bg-white/[0.02] backdrop-blur-sm text-center">
                    <CardContent className="p-6 sm:p-8 flex flex-col items-center">
                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 mb-4">
                        <b.icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-base font-semibold text-white mb-2">{b.title}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">{b.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
        <section className="clinical-section-alt py-20 sm:py-24 border-t border-white/5" data-testid="section-how-it-works">
          <div className="container mx-auto px-4 max-w-4xl">
            <motion.div
              variants={dismantlingSectionEntrance}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              className="text-center mb-12"
            >
              <Badge variant="outline" className="mb-4 border-primary/30 text-primary/80 bg-primary/10">
                How It Works
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Three Steps. One Result.</h2>
              <p className="text-slate-400">We handle everything. You just pick up your medication.</p>
            </motion.div>

            <motion.div
              className="grid sm:grid-cols-3 gap-5"
              variants={dismantlingStaggerGrid}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
            >
              {STEPS.map((s, i) => (
                <motion.div key={s.testId} variants={dismantlingCardEntrance(i)} data-testid={s.testId}>
                  <Card className="h-full border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
                    <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center">
                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 mb-4">
                        <s.icon className="h-6 w-6 text-primary" />
                      </div>
                      <p className="text-xs font-mono text-primary/60 tracking-widest mb-2">STEP {s.step}</p>
                      <h3 className="text-base font-semibold text-white mb-2">{s.title}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section className="py-20 sm:py-24 border-t border-white/5" data-testid="section-faq">
          <div className="container mx-auto px-4 max-w-3xl">
            <motion.div
              variants={dismantlingSectionEntrance}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              className="text-center mb-12"
            >
              <Badge variant="outline" className="mb-4 border-primary/30 text-primary/80 bg-primary/10">
                Common Questions
              </Badge>
              <h2 className="text-3xl font-bold text-white mb-2">Questions We Always Hear</h2>
              <p className="text-slate-400">Straight answers, no runaround.</p>
            </motion.div>

            <motion.div
              className="space-y-3"
              variants={dismantlingStaggerGrid}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
            >
              {FAQS.map((faq, i) => (
                <motion.div key={i} variants={dismantlingCardEntrance(i)}>
                  <Card className="border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
                    <CardContent className="p-5">
                      <p className="text-sm font-semibold text-primary italic mb-2">&ldquo;{faq.q}&rdquo;</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{faq.a}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── BOTTOM CTA — dual-track: form OR call ────────────────────── */}
        <SavingsRequestSection />

        <SiteFooter />
    </PageTransition>
  );
}
