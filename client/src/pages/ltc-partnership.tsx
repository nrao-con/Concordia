import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { SEO } from "@/components/seo";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/motion-button";
import { dismantlingStaggerGrid, dismantlingCardEntrance, dismantlingSectionEntrance } from "@/lib/animations";
import { AnimatedTruck, HeartbeatPulse } from "@/components/animated-icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { LucideIcon } from "lucide-react";
import {
  Truck,
  Package,
  Shield,
  Heart,
  CheckCircle2,
  Clock,
  Phone,
  Building2,
  Users,
  ArrowRight,
  MapPin,
  Zap,
} from "lucide-react";

const FACILITY_TYPES = [
  { value: "nursing_home", label: "Skilled Nursing Facility (SNF)" },
  { value: "assisted_living", label: "Assisted Living Facility (ALF)" },
  { value: "memory_care", label: "Memory Care Community" },
  { value: "rehabilitation", label: "Rehabilitation Center" },
  { value: "hospice", label: "Hospice Care" },
  { value: "other", label: "Other" },
] as const;

interface ServiceHighlight {
  icon: LucideIcon;
  title: string;
  description: string;
  features: string[];
  color: string;
}

const SERVICE_HIGHLIGHTS: ServiceHighlight[] = [
  {
    icon: Truck,
    title: "Custom Delivery Solutions",
    description: "Reliable daily and emergency medication delivery across New York State.",
    features: [
      "Scheduled daily delivery routes",
      "STAT delivery within 2 hours",
      "Emergency after-hours service",
      "Temperature-controlled transport",
    ],
    color: "text-primary",
  },
  {
    icon: Package,
    title: "Fulfillment Accuracy",
    description: "Precision packaging designed for long-term care environments.",
    features: [
      "Multi-dose blister packaging",
      "Unit-dose pouching systems",
      "Automated dispensing support",
      "99.97% accuracy rate",
    ],
    color: "text-emerald-400",
  },
  {
    icon: Shield,
    title: "NY Regulatory Compliance",
    description: "Full compliance with New York State Department of Health regulations.",
    features: [
      "NYS Board of Pharmacy licensed",
      "DEA Schedule II-V compliant",
      "HIPAA-certified processes",
      "Monthly compliance audits",
    ],
    color: "text-amber-400",
  },
  {
    icon: Heart,
    title: "Collaborative Care",
    description: "Integrated pharmacy services that support your care team.",
    features: [
      "Dedicated pharmacist consultant",
      "Medication therapy management",
      "Drug regimen reviews (DRR)",
      "Staff in-service training",
    ],
    color: "text-rose-400",
  },
];

export default function LTCPartnership() {
  const { toast } = useToast();
  const [truckDriving, setTruckDriving] = useState(false);
  const [formData, setFormData] = useState({
    facilityName: "",
    facilityType: "" as string,
    numberOfBeds: "",
    contactName: "",
    contactTitle: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/ltc-leads", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Inquiry Submitted",
        description: "Our partnership team will contact you within one business day to discuss how we can serve your facility.",
      });
      setFormData({
        facilityName: "",
        facilityType: "",
        numberOfBeds: "",
        contactName: "",
        contactTitle: "",
        phone: "",
        email: "",
        address: "",
        notes: "",
      });
    },
    onError: () => {
      toast({
        title: "Submission Failed",
        description: "Please try again or call us directly.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.facilityName || !formData.facilityType || !formData.contactName || !formData.phone) {
      toast({
        title: "Required Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate({
      ...formData,
      numberOfBeds: formData.numberOfBeds ? parseInt(formData.numberOfBeds) : null,
    });
  };

  return (
    <PageTransition className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
      <SEO
        title="Long-Term Care Partnership"
        description="Partner with Concordia Pharmacy for long-term care pharmacy services. Blister packaging, medication synchronization, consultant pharmacist reviews, and facility-wide compliance."
        path="/ltc-partnership"
      />
      <Header />

      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-emerald-600/5" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            variants={dismantlingSectionEntrance}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary/70 text-sm">
                <Building2 className="h-4 w-4" />
                Long-Term Care Pharmacy Services
              </div>
            </div>

            <h1
              className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6"
              data-testid="text-ltc-title"
            >
              <span className="text-white">Your New York Partner for</span>
              <br />
              <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                Long-Term Care Excellence
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-200 max-w-3xl mx-auto mb-8">
              Concordia Pharmacy delivers specialized pharmaceutical services to nursing homes, assisted living
              facilities, and long-term care communities across New York State. We combine clinical expertise
              with reliable fulfillment to support your residents and staff.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <a href="#inquiry-form">
                <MotionButton size="lg" className="gap-2" data-testid="button-ltc-get-started">
                  Start a Partnership
                  <ArrowRight className="h-4 w-4" />
                </MotionButton>
              </a>
              <a href="tel:+17183282833">
                <MotionButton variant="outline" size="lg" className="gap-2 backdrop-blur-sm" data-testid="button-ltc-call">
                  <Phone className="h-4 w-4" />
                  Call Our LTC Team
                </MotionButton>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-20 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            variants={dismantlingSectionEntrance}
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Comprehensive LTC Pharmacy Services
            </h2>
            <p className="text-slate-200 text-lg max-w-2xl mx-auto">
              Everything your facility needs from a pharmacy partner, built on decades of experience serving New York&apos;s long-term care community.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true, amount: 0.15 }}
            variants={dismantlingStaggerGrid}
          >
            {SERVICE_HIGHLIGHTS.map((service, idx) => {
              const Icon = service.icon;
              return (
                <motion.div
                  key={service.title}
                  variants={dismantlingCardEntrance(idx)}
                >
                  <Card className="h-full border-white/10 bg-white/[0.03] backdrop-blur-sm hover-elevate" data-testid={`card-service-${idx}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-lg bg-white/5 ${service.color}`}>
                          {service.icon === Truck ? (
                            <span onClick={() => setTruckDriving(true)} className="cursor-pointer">
                              <AnimatedTruck className="h-6 w-6" driveAway={truckDriving} onDriveComplete={() => setTruckDriving(false)} />
                            </span>
                          ) : (
                            <Icon className="h-6 w-6" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-1">{service.title}</h3>
                          <p className="text-slate-400 text-sm mb-4">{service.description}</p>
                          <ul className="space-y-2">
                            {service.features.map((feature) => (
                              <li key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      <section className="py-16 border-t border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { value: "500+", label: "Beds Served", icon: Users },
              { value: "2hr", label: "STAT Delivery", icon: Zap },
              { value: "99.97%", label: "Accuracy Rate", icon: CheckCircle2 },
              { value: "24/7", label: "On-Call Pharmacist", icon: Clock },
            ].map((stat, statIdx) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  variants={dismantlingCardEntrance(statIdx)}
                  initial="hidden"
                  whileInView="visible"
                  exit="exit"
                  viewport={{ once: true }}
                  className="p-4"
                >
                  <Icon className="h-6 w-6 text-primary mx-auto mb-2" />
                  <div className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-slate-400 mt-1">{stat.label}</div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="inquiry-form" className="py-16 md:py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <motion.div
            variants={dismantlingSectionEntrance}
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true }}
          >
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Partner With Concordia
              </h2>
              <p className="text-slate-200 text-lg">
                Tell us about your facility and a member of our LTC team will reach out within one business day.
              </p>
            </div>

            <Card className="border-white/10 bg-white/[0.03] backdrop-blur-sm">
              <CardContent className="p-6 sm:p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="ltc-facility-name" className="text-slate-300">Facility Name *</Label>
                      <Input
                        id="ltc-facility-name"
                        value={formData.facilityName}
                        onChange={(e) => setFormData(d => ({ ...d, facilityName: e.target.value }))}
                        placeholder="e.g. Sunrise Senior Living"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-300"
                        data-testid="input-facility-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ltc-facility-type" className="text-slate-300">Facility Type *</Label>
                      <Select
                        value={formData.facilityType}
                        onValueChange={(v) => setFormData(d => ({ ...d, facilityType: v }))}
                      >
                        <SelectTrigger id="ltc-facility-type" className="bg-white/5 border-white/10 text-white" data-testid="select-facility-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {FACILITY_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value} data-testid={`option-facility-${type.value}`}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ltc-number-of-beds" className="text-slate-300">Number of Beds</Label>
                      <Input
                        id="ltc-number-of-beds"
                        type="number"
                        value={formData.numberOfBeds}
                        onChange={(e) => setFormData(d => ({ ...d, numberOfBeds: e.target.value }))}
                        placeholder="e.g. 120"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-300"
                        data-testid="input-number-of-beds"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ltc-contact-name" className="text-slate-300">Contact Name *</Label>
                      <Input
                        id="ltc-contact-name"
                        value={formData.contactName}
                        onChange={(e) => setFormData(d => ({ ...d, contactName: e.target.value }))}
                        placeholder="Full name"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-300"
                        data-testid="input-contact-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ltc-contact-title" className="text-slate-300">Title / Role</Label>
                      <Input
                        id="ltc-contact-title"
                        value={formData.contactTitle}
                        onChange={(e) => setFormData(d => ({ ...d, contactTitle: e.target.value }))}
                        placeholder="e.g. Director of Nursing"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-300"
                        data-testid="input-contact-title"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ltc-phone" className="text-slate-300">Phone *</Label>
                      <Input
                        id="ltc-phone"
                        value={formData.phone}
                        onChange={(e) => setFormData(d => ({ ...d, phone: e.target.value }))}
                        placeholder="(718) 555-1234"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-300"
                        data-testid="input-ltc-phone"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ltc-email" className="text-slate-300">Email</Label>
                      <Input
                        id="ltc-email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(d => ({ ...d, email: e.target.value }))}
                        placeholder="contact@facility.com"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-300"
                        data-testid="input-ltc-email"
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="ltc-address" className="text-slate-300">Facility Address</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-300" />
                        <Input
                          id="ltc-address"
                          value={formData.address}
                          onChange={(e) => setFormData(d => ({ ...d, address: e.target.value }))}
                          placeholder="Street address, city, state, zip"
                          className="bg-white/5 border-white/10 text-white placeholder:text-slate-300 pl-10"
                          data-testid="input-ltc-address"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="ltc-needs" className="text-slate-300">Tell Us About Your Needs</Label>
                      <Textarea
                        id="ltc-needs"
                        value={formData.notes}
                        onChange={(e) => setFormData(d => ({ ...d, notes: e.target.value }))}
                        placeholder="Current pharmacy challenges, services you're looking for, timeline..."
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-300 min-h-[100px]"
                        data-testid="input-ltc-notes"
                      />
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 leading-relaxed">
                    By submitting this form, you agree to be contacted by Concordia Pharmacy regarding
                    long-term care pharmacy services. Your information is handled in accordance with our
                    privacy policy and HIPAA guidelines.
                  </div>

                  <MotionButton
                    type="submit"
                    size="lg"
                    className="w-full gap-2"
                    disabled={submitMutation.isPending}
                    data-testid="button-submit-ltc-inquiry"
                  >
                    {submitMutation.isPending ? (
                      "Submitting..."
                    ) : (
                      <>
                        Submit Partnership Inquiry
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </MotionButton>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      <SiteFooter />
    </PageTransition>
  );
}
