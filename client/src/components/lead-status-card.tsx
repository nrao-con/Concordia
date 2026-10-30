import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Phone, XCircle, Apple, Smartphone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

interface LeadStatusCardProps {
  leadId: number;
  statusToken: string;
  contactName: string;
  phone: string;
  qualifiesForWellnessPack: boolean;
}

const STATUS_MESSAGES = [
  "Verifying Insurance Coverage...",
  "Contacting Previous Pharmacy...",
  "Calculating Loyalty Multiplier...",
  "Building Your Patient Profile...",
  "Preparing Wellness Benefits...",
  "Syncing Medication Records...",
];

function ConfettiParticle({ delay, x, color }: { delay: number; x: number; color: string }) {
  return (
    <motion.div
      className="absolute rounded-sm"
      style={{
        width: 6,
        height: 6,
        backgroundColor: color,
        left: `${x}%`,
        top: "50%",
      }}
      initial={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      animate={{
        opacity: [1, 1, 0],
        y: [-20, -60 - Math.random() * 40],
        x: [(Math.random() - 0.5) * 80],
        scale: [1, 0.6],
        rotate: [0, (Math.random() - 0.5) * 360],
      }}
      transition={{ duration: 1.2, delay, ease: "easeOut" }}
    />
  );
}

function ConfettiBurst() {
  const colors = ["hsl(48 96% 53%)", "hsl(142 71% 45%)", "hsl(var(--primary))", "hsl(25 95% 53%)", "hsl(330 81% 60%)", "hsl(263 70% 50%)"];
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.3,
    x: 30 + Math.random() * 40,
    color: colors[i % colors.length],
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((p) => (
        <ConfettiParticle key={p.id} delay={p.delay} x={p.x} color={p.color} />
      ))}
    </div>
  );
}

function FlyingPoints() {
  return (
    <motion.div
      className="text-2xl font-bold text-yellow-500 font-mono"
      initial={{ opacity: 0, y: 20, scale: 0.5 }}
      animate={{ opacity: [0, 1, 1, 0], y: [20, -10, -30, -60], scale: [0.5, 1.2, 1, 0.8] }}
      transition={{ duration: 1.8, ease: "easeOut" }}
    >
      +500
    </motion.div>
  );
}

export function LeadStatusCard({ leadId, statusToken, contactName, phone, qualifiesForWellnessPack }: LeadStatusCardProps) {
  const concordiaCareUrl = typeof window !== "undefined"
    ? (import.meta.env.VITE_CONCORDIA_CARE_APP_URL || "https://concordia-care.replit.app")
    : "https://concordia-care.replit.app";

  const [msgIndex, setMsgIndex] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevStatusRef = useRef<string>("pending_request");

  const { data: leadStatus } = useQuery<{
    id: number;
    status: string;
    pendingPoints: number;
    pointsGranted: boolean;
    qualifiesForWellnessPack: boolean;
    approvedAt: string | null;
    rejectionReason: string | null;
  }>({
    queryKey: ["/api/leads", leadId, "status"],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/status?token=${encodeURIComponent(statusToken)}`);
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const status = leadStatus?.status || "pending_request";

  useEffect(() => {
    if (status === "pending_request") {
      const interval = setInterval(() => {
        setMsgIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [status]);

  useEffect(() => {
    if (prevStatusRef.current === "pending_request" && status === "approved") {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 2500);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = status;
  }, [status]);

  if (status === "approved") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <Card className="rounded-md border-green-700/50 relative" data-testid="card-lead-approved">
          {showConfetti && <ConfettiBurst />}
          <CardContent className="pt-6 space-y-4 text-center relative">
            <div className="flex justify-center">
              <motion.div
                className="rounded-full bg-green-900/30 p-4"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
              >
                <CheckCircle className="h-10 w-10 text-green-400" />
              </motion.div>
            </div>
            <div className="flex justify-center">
              <AnimatePresence>
                {showConfetti && <FlyingPoints />}
              </AnimatePresence>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-green-300">You're Approved!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Welcome to the ConcordiaCare family, {contactName.split(" ")[0]}!
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap items-center justify-center gap-2"
            >
              <Badge className="bg-yellow-900/30 text-yellow-300">
                +{leadStatus?.pendingPoints || 500} Wellness Points Credited
              </Badge>
              {qualifiesForWellnessPack && (
                <Badge className="bg-green-900/30 text-green-300">
                  Free Wellness Pack Qualified
                </Badge>
              )}
            </motion.div>
            <div className="rounded-md border border-white/10 bg-slate-800/60 p-4 space-y-3">
              <p className="font-medium text-sm">Download the ConcordiaCare App to:</p>
              <ul className="text-sm text-muted-foreground space-y-1 text-left list-disc list-inside">
                <li>View your 500 Wellness Points</li>
                <li>Track prescription deliveries</li>
                <li>Manage your medications</li>
                <li>Earn more rewards</li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <Button asChild className="flex-1" data-testid="button-ios-app-approved">
                  <a href="https://apps.apple.com/us/app/concordiacare/id6741450205" target="_blank" rel="noopener noreferrer">
                    <Apple className="h-4 w-4 mr-2" />
                    App Store
                  </a>
                </Button>
                <Button asChild variant="outline" className="flex-1" data-testid="button-android-app-approved">
                  <a href="https://play.google.com/store/apps/details?id=com.concordia.care" target="_blank" rel="noopener noreferrer">
                    <Smartphone className="h-4 w-4 mr-2" />
                    Google Play
                  </a>
                </Button>
              </div>
              <a
                href={concordiaCareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground text-center block pt-1"
                data-testid="link-web-app-approved"
              >
                Open web app instead
              </a>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (status === "rejected") {
    return (
      <Card className="rounded-md border-muted" data-testid="card-lead-rejected">
        <CardContent className="pt-6 space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-4">
              <XCircle className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold">We Couldn't Process Your Request</h3>
            {leadStatus?.rejectionReason && (
              <p className="text-sm text-muted-foreground mt-1">{leadStatus.rejectionReason}</p>
            )}
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span>Please call us at <strong>(718) 555-0100</strong> for assistance</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="rounded-md border-primary/20" data-testid="card-lead-pending">
        <CardContent className="pt-6 space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4" style={{ width: 72, height: 72 }}>
              <div className="flex items-center justify-center h-full">
                <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Request Received!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Our team is reviewing your profile. Please stay on this page. You may receive a confirmation call shortly.
            </p>
          </div>

          <div className="h-6 flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.span
                key={msgIndex}
                className="text-xs font-mono text-primary/80 tracking-wide"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                {STATUS_MESSAGES[msgIndex]}
              </motion.span>
            </AnimatePresence>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge variant="outline" className="border-yellow-500/40 text-yellow-300">
              +500 Points Pending
            </Badge>
            {qualifiesForWellnessPack && (
              <Badge variant="outline" className="border-green-500/40 text-green-300">
                Wellness Pack Pending
              </Badge>
            )}
          </div>

          <div className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 flex-shrink-0" />
              <span>Someone from our store will call <strong>{phone}</strong> to finalize your transfer</span>
            </div>
            <p className="text-xs">
              We'll notify you on this page once your account is approved and your ConcordiaCare App access is ready.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <motion.div
              className="h-2 w-2 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-xs text-muted-foreground font-mono">Processing...</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
