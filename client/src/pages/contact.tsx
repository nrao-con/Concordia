import { SEO } from "@/components/seo";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { PageTransition } from "@/components/page-transition";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  MapPin,
  Phone,
  Clock,
  Mail,
  Send,
  CheckCircle,
} from "lucide-react";
import concordiaLogo from "@assets/concordia_logo_trimmed_transparent.png";

const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

const infoCards = [
  {
    icon: MapPin,
    title: "Visit Us",
    lines: ["898 East Tremont Ave", "Bronx, NY 10460"],
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
  },
  {
    icon: Phone,
    title: "Call Us",
    lines: ["(718) 328-2833"],
    href: "tel:+17183282833",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
  },
  {
    icon: Mail,
    title: "Email Us",
    lines: ["info@concordianyc.com"],
    href: "mailto:info@concordianyc.com",
    color: "text-violet-400",
    bg: "bg-violet-500/15",
  },
  {
    icon: Clock,
    title: "Hours",
    lines: ["Mon to Fri: 9AM to 7PM", "Sat: 10AM to 3PM", "Sun: Closed"],
    color: "text-amber-400",
    bg: "bg-amber-500/15",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

export default function Contact() {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: "", email: "", phone: "", message: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const res = await apiRequest("POST", "/api/contact", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Message sent", description: "We'll get back to you as soon as possible." });
      reset();
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please try again or call us directly.", variant: "destructive" });
    },
  });

  const submitted = mutation.isSuccess;

  return (
    <PageTransition>
      <SEO
        title="Contact Us"
        description="Get in touch with Concordia Pharmacy. Visit us at 898 East Tremont Ave, Bronx, NY 10460, call (718) 328-2833, or send us a message."
        path="/contact"
      />
      <div className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
        <Header />

        <section className="relative pt-24 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent" />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <img src={concordiaLogo} alt="Concordia Pharmacy" className="h-12 mx-auto mb-6 opacity-80" decoding="async" width="160" height="48" />
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4" data-testid="text-contact-heading">
                Contact Us
              </h1>
              <p className="text-slate-200 max-w-xl mx-auto text-lg" data-testid="text-contact-intro">
                Have a question or need assistance? We're here to help. Reach out by phone, visit us in person, or send a message below.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
              {infoCards.map((card, i) => (
                <motion.div
                  key={card.title}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-40px" }}
                  variants={fadeUp}
                >
                  <Card className="border-white/10 bg-white/5 h-full" data-testid={`card-contact-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
                    <CardContent className="p-5">
                      <div className={`w-10 h-10 rounded-md ${card.bg} flex items-center justify-center mb-3`}>
                        <card.icon className={`h-5 w-5 ${card.color}`} />
                      </div>
                      <h3 className="text-white font-semibold text-sm mb-2">{card.title}</h3>
                      <div className="space-y-1 text-sm text-slate-400">
                        {card.lines.map((line) =>
                          card.href ? (
                            <a
                              key={line}
                              href={card.href}
                              className="block hover:text-slate-300 transition-colors"
                              data-testid={`link-contact-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              {line}
                            </a>
                          ) : (
                            <p key={line}>{line}</p>
                          ),
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold text-white mb-4" data-testid="text-contact-map-heading">Find Us</h2>
                <p className="text-slate-400 text-sm mb-4">
                  Located on East Tremont Avenue in the heart of the Bronx. Free street parking available. Accessible by BX36 and BX40 buses.
                </p>
                <div className="rounded-md overflow-hidden border border-white/10 aspect-video" data-testid="map-container">
                  <iframe
                    title="Concordia Pharmacy Location"
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3017.354!2d-73.8675!3d40.8415!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c2f47b29e46e03%3A0xbae82e57c7e8c74d!2s898%20E%20Tremont%20Ave%2C%20Bronx%2C%20NY%2010460!5e0!3m2!1sen!2sus!4v1700000000000"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="w-full h-full"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold text-white mb-4" data-testid="text-contact-form-heading">Send a Message</h2>
                <p className="text-slate-400 text-sm mb-4">
                  Fill out the form and our team will respond within one business day.
                </p>

                {submitted ? (
                  <Card className="border-white/10 bg-white/5">
                    <CardContent className="p-8 text-center">
                      <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
                      <h3 className="text-white font-semibold text-lg mb-2" data-testid="text-contact-success">Thank You!</h3>
                      <p className="text-slate-400 text-sm mb-4">
                        Your message has been received. We'll get back to you as soon as possible.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          mutation.reset();
                          reset();
                        }}
                        data-testid="button-contact-another"
                      >
                        Send Another Message
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-white/10 bg-white/5">
                    <CardContent className="p-6">
                      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                        <div>
                          <Label htmlFor="name" className="text-slate-300 text-sm">
                            Name <span className="text-red-400">*</span>
                          </Label>
                          <Input
                            id="name"
                            placeholder="Your full name"
                            className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-slate-300"
                            {...register("name")}
                            data-testid="input-contact-name"
                          />
                          {errors.name && (
                            <p className="text-red-400 text-xs mt-1" data-testid="error-contact-name">{errors.name.message}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="email" className="text-slate-300 text-sm">
                            Email <span className="text-red-400">*</span>
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-slate-300"
                            {...register("email")}
                            data-testid="input-contact-email"
                          />
                          {errors.email && (
                            <p className="text-red-400 text-xs mt-1" data-testid="error-contact-email">{errors.email.message}</p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="phone" className="text-slate-300 text-sm">
                            Phone <span className="text-slate-300 text-xs">(optional)</span>
                          </Label>
                          <Input
                            id="phone"
                            type="tel"
                            placeholder="(718) 555-0100"
                            className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-slate-300"
                            {...register("phone")}
                            data-testid="input-contact-phone"
                          />
                        </div>

                        <div>
                          <Label htmlFor="message" className="text-slate-300 text-sm">
                            Message <span className="text-red-400">*</span>
                          </Label>
                          <Textarea
                            id="message"
                            placeholder="How can we help you?"
                            rows={5}
                            className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-slate-300 resize-none"
                            {...register("message")}
                            data-testid="input-contact-message"
                          />
                          {errors.message && (
                            <p className="text-red-400 text-xs mt-1" data-testid="error-contact-message">{errors.message.message}</p>
                          )}
                        </div>

                        <Button
                          type="submit"
                          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
                          disabled={mutation.isPending}
                          data-testid="button-contact-submit"
                        >
                          {mutation.isPending ? (
                            "Sending..."
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-2" />
                              Send Message
                            </>
                          )}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </PageTransition>
  );
}
