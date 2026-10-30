import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useGuestCart } from "@/hooks/useGuestCart";
import { getCapabilityScopeResponse, PHARMACY_SCOPE_RESPONSE } from "@/lib/pharmacy-capabilities";
import { shouldConsultLocalClassifier } from "@/lib/chat-intent-guard";
import { detectCompoundIntent, isEmergencySafetySignal } from "@/lib/intent-engine";
import { resolvePendingClarification, type PendingClarification } from "@/lib/conversation-followups";
import { getContextRecoveryResponse, getVagueConversationResponse } from "@/lib/conversation-recovery";
import { buildConciergeHandoff } from "@/lib/concierge-handoff";
import { extractPendingPickupItems, extractUnmatchedPickupItem, getPickupWindowFromFreeText, isExplicitShopSearch, isGenericMedicationAndGroceryRequest, isPastPickupWindow, isPrescriptionReadinessRequest, resolveStoreCollectionTurn } from "@/lib/chat-request-routing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddressAutocompleteInput, type VerifiedAddressSelection } from "@/components/address-autocomplete-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import concordiaCIcon from "@assets/concordia_c_icon.png";
import {
  X,
  Send,
  User,
  Heart,
  Stethoscope,
  MapPin,
  Phone,
  Mail,
  Loader2,
  CheckCircle,
  Package,
  Repeat,
  PhoneCall,
  MessageCircle,
  Truck,
  Info,
  Pill,
  Building2,
  Shield,
  CreditCard,
  Clock,
  ShoppingBag,
  Smartphone,
  ShoppingCart,
  CheckCircle2,
  BellRing,
} from "lucide-react";

type UserRole = "patient" | "caregiver" | "professional" | null;

function AssistantAvatar() {
  return (
    <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
      <img src={concordiaCIcon} alt="" aria-hidden="true" className="h-4 w-4 object-contain" decoding="async" width="16" height="16" />
    </div>
  );
}

function ChoiceButton({
  btn,
  onClick,
  testPrefix,
  accentColor = "blue",
}: {
  btn: { label: string; value: string; icon?: React.ComponentType<any> };
  onClick: () => void;
  testPrefix: string;
  accentColor?: "blue" | "amber";
}) {
  const Icon = btn.icon;
  const border = accentColor === "amber" ? "border-amber-500/20 hover:border-amber-500/40" : "border-primary/20 hover:border-primary/40";
  const iconColor = accentColor === "amber" ? "text-amber-400" : "text-primary";
  const bg = accentColor === "amber" ? "bg-amber-950/20 hover:bg-amber-950/40" : "bg-slate-700/40 hover:bg-slate-700/70";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-md border ${border} ${bg} px-4 py-3 text-left text-sm text-white transition-all`}
      style={{ minHeight: "48px" }}
      data-testid={`${testPrefix}-${btn.value}`}
    >
      {Icon && <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />}
      <span>{btn.label}</span>
    </button>
  );
}

function InlineProductCard({
  product,
  onNavigate,
  onAddToCart,
  addedToCart,
}: {
  product: { id: string; name: string; category: string; inStock: boolean; stockQuantity: number; price?: string | null; imageUrl?: string | null };
  onNavigate: (path: string) => void;
  onAddToCart?: (productId: string) => void;
  addedToCart?: boolean;
}) {
  const inStock = product.inStock && (product.stockQuantity ?? 0) > 0;
  const shopPath = `/shop?product=${encodeURIComponent(product.id)}`;
  return (
    <div
      data-testid={`chat-product-card-${product.id}`}
      className="flex items-center gap-3 w-full rounded-lg border border-white/10 bg-slate-700/50 p-2.5"
    >
      <button
        type="button"
        onClick={() => onNavigate(shopPath)}
        className="h-12 w-12 rounded-md bg-slate-600/60 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center hover:opacity-80 transition-opacity"
        data-testid={`chat-product-image-${product.id}`}
        aria-label={`View ${product.name}`}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <ShoppingBag className="h-5 w-5 text-slate-400" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => onNavigate(shopPath)}
          className="text-xs font-medium text-white leading-snug truncate block w-full text-left hover:text-primary/90 transition-colors"
          data-testid={`chat-product-name-${product.id}`}
        >
          {product.name}
        </button>
        <p className="text-[11px] text-slate-400 truncate">{product.category}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {product.price && !isNaN(parseFloat(product.price)) && (
            <span className="text-xs font-semibold text-primary/90">${parseFloat(product.price).toFixed(2)}</span>
          )}
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              inStock
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-red-500/20 text-red-300"
            }`}
          >
            {inStock ? "In Stock" : "Out of Stock"}
          </span>
        </div>
      </div>
      {inStock && onAddToCart && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product.id);
          }}
          disabled={addedToCart}
          data-testid={`chat-add-to-cart-${product.id}`}
          className={`shrink-0 flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
            addedToCart
              ? "bg-emerald-500/20 text-emerald-300 cursor-default"
              : "bg-primary/20 text-primary hover:bg-primary/30"
          }`}
        >
          {addedToCart ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              <span>Added!</span>
            </>
          ) : (
            <>
              <ShoppingCart className="h-3 w-3" />
              <span>Add</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

type ConversationStep =
  | "greeting"
  | "chat_or_call"
  | "pain_point"
  | "triage_response"
  | "delivery_pitch"
  | "gibberish_help"
  | "address_capture"
  | "pickup_time"
  | "lead_capture"
  | "review"
  | "restock_notify"
  | "submitted"
  | "free_chat";

const CONCIERGE_DRAFT_KEY = "concordia.concierge-draft";
const CONCIERGE_DRAFT_VERSION = 2;
const CONCIERGE_DRAFT_TTL_MS = 30 * 60 * 1000;
const SAFE_STEPS = new Set<ConversationStep>([
  "greeting",
  "pain_point",
  "address_capture",
  "pickup_time",
  "lead_capture",
  "review",
  "submitted",
  "free_chat",
]);

function resumableStep(step: ConversationStep, hasRole: boolean): ConversationStep {
  if (SAFE_STEPS.has(step)) return step;
  if (!hasRole) return "greeting";
  if (step === "chat_or_call") return "pain_point";
  if (step === "delivery_pitch") return "address_capture";
  return "free_chat";
}

interface ConciergeDraft {
  version: number;
  expiresAt: number;
  step: ConversationStep;
  userRole: UserRole;
  deliveryType: "delivery" | "pickup" | null;
  callRequested: boolean;
}

function readConciergeDraft(): ConciergeDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(CONCIERGE_DRAFT_KEY) || "null");
    if (!value || typeof value !== "object") return null;
    const draft = value as Partial<ConciergeDraft>;
    if (draft.version !== CONCIERGE_DRAFT_VERSION || typeof draft.expiresAt !== "number" || draft.expiresAt < Date.now() || typeof draft.step !== "string" || !SAFE_STEPS.has(draft.step as ConversationStep) || (draft.userRole !== null && draft.userRole !== "patient" && draft.userRole !== "caregiver" && draft.userRole !== "professional") || typeof draft.callRequested !== "boolean" || (draft.deliveryType !== null && draft.deliveryType !== "delivery" && draft.deliveryType !== "pickup")) {
      sessionStorage.removeItem(CONCIERGE_DRAFT_KEY); return null;
    }
    return draft as ConciergeDraft;
  } catch {
    sessionStorage.removeItem(CONCIERGE_DRAFT_KEY); return null;
  }
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  buttons?: { label: string; value: string; icon?: React.ComponentType<any> }[];
  productCards?: ProductCacheItem[];
}

const ROLE_OPTIONS = [
  { label: "Myself (Patient)", value: "patient", icon: User },
  { label: "A Family Member / Loved One (Caregiver)", value: "caregiver", icon: Heart },
  { label: "A Healthcare Professional", value: "professional", icon: Stethoscope },
];

const DYNAMIC_GREETINGS = [
  "Hi there! Welcome to Concordia. How are you doing today?",
  "Hello! I'm the Concordia Concierge. I'm here to make your health journey easier. How's your day going?",
  "Hi! Thanks for stopping by. I'd love to help. How can I support you today?",
  "Welcome! I'm so glad you're here. How can I make things easier for you today?",
  "Hey there! I'm your ConcordiaCare Concierge. Think of me as a friendly guide. What's on your mind?",
];

let greetingIndex = 0;
function getNextGreeting(): string {
  const greeting = DYNAMIC_GREETINGS[greetingIndex % DYNAMIC_GREETINGS.length];
  greetingIndex++;
  return greeting;
}

const ROLE_GREETINGS: Record<string, string> = {
  patient:
    "I'm really glad you reached out. Managing medications can be a lot, and you shouldn't have to do it alone.\n\nI'm happy to chat here and answer your questions, or if you prefer, I can have someone from our store give you a call right now. What works best for you?",
  caregiver:
    "It's clear how much you care about your loved one, and that means the world.\n\nI'm happy to chat here and answer your questions, or if you prefer, I can have someone from our store give you a call right now. What works best for you?",
  professional:
    "Thank you so much for connecting with us. We love partnering with providers to give patients the best care.\n\nI'm happy to chat here and help, or if you prefer, I can have someone from our store give you a call right now. What works best for you?",
};

const CHAT_OR_CALL_OPTIONS = [
  { label: "Let's Chat Here", value: "chat", icon: MessageCircle },
  { label: "Request a Call", value: "call", icon: PhoneCall },
];

function detectEmotion(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("overwhelm") || lower.includes("stressed") || lower.includes("stress") || lower.includes("anxious") || lower.includes("anxiety")) return "stressed";
  if (lower.includes("tired") || lower.includes("exhausted") || lower.includes("burned out") || lower.includes("burnout")) return "tired";
  if (lower.includes("confused") || lower.includes("don't understand") || lower.includes("complicated") || lower.includes("confusing")) return "confused";
  if (lower.includes("worried") || lower.includes("scared") || lower.includes("afraid") || lower.includes("concern")) return "worried";
  if (lower.includes("frustrat") || lower.includes("angry") || lower.includes("upset") || lower.includes("annoyed") || lower.includes("fed up")) return "frustrated";
  if (lower.includes("lonely") || lower.includes("alone") || lower.includes("no one") || lower.includes("nobody")) return "lonely";
  if (lower.includes("happy") || lower.includes("glad") || lower.includes("great") || lower.includes("good") || lower.includes("wonderful")) return "happy";
  return null;
}

function detectSentiment(text: string): string {
  const emotion = detectEmotion(text);
  if (!emotion) return "neutral";
  if (emotion === "happy") return "happy";
  if (emotion === "stressed" || emotion === "frustrated") return "stressed";
  if (emotion === "worried") return "urgent";
  return emotion;
}

const EMOTION_PREFIXES: Record<string, string> = {
  stressed: "I can hear how much you're carrying right now, and I want you to know that you're doing an amazing job. Let's take some of that weight off your shoulders.",
  tired: "I completely understand that feeling. Dealing with medications and pharmacy logistics on top of everything else is exhausting. You deserve support, and that's exactly what we're here for.",
  confused: "It's completely normal to feel that way. The healthcare system can be really confusing. That's why we're here: to make things simple and clear for you.",
  worried: "Your concern shows how much you care, and that matters. Let's work through this together so you can feel more at peace.",
  frustrated: "I'm really sorry you've been dealing with that. You shouldn't have to fight for good pharmacy care. Let's fix this for you.",
  lonely: "You're not alone in this, not anymore. Our whole team is here to support you, and we mean that personally.",
  happy: "That's wonderful to hear! I'm so glad you're in good spirits. Let's keep that going. How can I help you today?",
};

function extractCompetitor(text: string): string | null {
  const lower = text.toLowerCase();
  const competitors = ["cvs", "walgreens", "rite aid", "duane reade", "walmart pharmacy", "costco pharmacy"];
  for (const c of competitors) {
    if (lower.includes(c)) return c.charAt(0).toUpperCase() + c.slice(1);
  }
  return null;
}

function detectKeywordCategory(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("cvs") || lower.includes("walgreens") || lower.includes("rite aid") || lower.includes("duane reade") || lower.includes("walmart pharmacy") || lower.includes("costco pharmacy")) return "competitor";
  // Require medication context so "this is hard" / "what a mess" don't false-trigger
  const hasMedContext = lower.includes("med") || lower.includes("pill") || lower.includes("prescription") || lower.includes("rx") || lower.includes("refill") || lower.includes("blister") || lower.includes("organiz");
  if (hasMedContext && (lower.includes("forget") || lower.includes("confused") || lower.includes("mess") || lower.includes("difficult") || lower.includes("struggle"))) return "difficulty";
  // "doctor" alone fires on "my doctor sent a script". require a change/discharge context
  if (lower.includes("hospital") || lower.includes("surgery") || lower.includes("discharged") || lower.includes("procedure") || (lower.includes("doctor") && (lower.includes("changed my") || lower.includes("adjusted") || lower.includes("discharged")))) return "clinical";
  // "denied" / "rejected" alone are too broad. "my credit card was denied" would
  // falsely trigger the insurance logistics message. Require insurance/claim context.
  const hasDenialContext = lower.includes("insurance") || lower.includes("medicare") || lower.includes("copay") || lower.includes("medicaid") || lower.includes("coverage") || lower.includes("prior auth") ||
    (lower.includes("denied") && (lower.includes("claim") || lower.includes("authorization") || lower.includes("benefit") || lower.includes("formulary") || lower.includes("copay"))) ||
    (lower.includes("rejected") && (lower.includes("claim") || lower.includes("authorization") || lower.includes("benefit") || lower.includes("copay")));
  if (hasDenialContext) return "logistics";
  // "reaction" alone is too broad. require "side effect" or "allergic" context
  if (lower.includes("side effect") || lower.includes("allergic reaction") || (lower.includes("reaction") && (lower.includes("med") || lower.includes("pill") || lower.includes("drug") || lower.includes("prescription"))) || lower.includes("nausea") || lower.includes("dizzy") || lower.includes("rash")) return "safety";
  if (lower.includes("ozempic") || lower.includes("wegovy") || lower.includes("mounjaro") || lower.includes("weight loss") || lower.includes("semaglutide")) return "weight_mgmt";
  if (lower.includes("diabetes") || lower.includes("insulin") || lower.includes("blood sugar") || lower.includes("glucose") || lower.includes("a1c")) return "chronic_care";
  return null;
}

const KEYWORD_VERIFICATION: Record<string, (competitor?: string) => string> = {
  competitor: (comp) => `I noticed you mentioned ${comp || "another pharmacy"}. Are you thinking about switching your prescriptions to us for easier delivery?`,
  difficulty: () => "It sounds like the current routine is a bit stressful. Would you like to see how our organized Blister Packs solve that?",
  clinical: () => "I'm sorry to hear about the medical change. Do you need us to help reconcile new meds with your old ones?",
  logistics: () => "I heard you mention coverage. If you'd like, someone from our store can verify your copay and find you the best pricing. It only takes a few minutes.",
  safety: () => "I want to make sure you're safe. If this is a medical emergency, please call 911. Otherwise, our pharmacist can review your symptoms. Call us at (718) 328-2833.",
  weight_mgmt: () => "I see you're interested in weight management medications. We carry those and can help with insurance coverage. Would you like more details?",
  chronic_care: () => "Managing a chronic condition takes a great team. Our pharmacists specialize in helping patients stay on top of their medications. Would you like to talk about your care needs?",
};

function isTalkTalk(text: string): boolean {
  return text.split(/\s+/).length > 40;
}

function summarizeTalkTalk(text: string): string {
  const lower = text.toLowerCase();
  const themes: string[] = [];
  if (lower.includes("forget") || lower.includes("miss") || lower.includes("confus") || lower.includes("remember")) themes.push("medication organization");
  // "far" alone ("I work far from home") is too broad. require travel/pharmacy context
  if (lower.includes("deliver") || lower.includes("travel") || lower.includes("drive") || lower.includes("distance") ||
      (lower.includes("far") && (lower.includes("pharmac") || lower.includes("commute") || lower.includes("travel") || lower.includes("drive") || lower.includes("from me") || lower.includes("distance")))) themes.push("delivery needs");
  if (lower.includes("cost") || lower.includes("expensive") || lower.includes("afford") || lower.includes("insurance") || lower.includes("copay")) themes.push("cost concerns");
  if (lower.includes("switch") || lower.includes("bad") || lower.includes("slow") || lower.includes("frustrat") || lower.includes("terrible")) themes.push("pharmacy frustrations");
  if (lower.includes("family") || lower.includes("parent") || lower.includes("mom") || lower.includes("dad") || lower.includes("grandpa") || lower.includes("grandma") || lower.includes("loved one")) themes.push("caring for a loved one");
  if (lower.includes("refill") || lower.includes("run out") || lower.includes("running low")) themes.push("refill management");
  if (lower.includes("side effect") || lower.includes("reaction") || lower.includes("nausea") || lower.includes("dizzy") || lower.includes("sick from")) themes.push("medication side effects");
  if (lower.includes("weight") || lower.includes("ozempic") || lower.includes("wegovy") || lower.includes("mounjaro") || lower.includes("semaglutide")) themes.push("weight management");
  if (lower.includes("diabetes") || lower.includes("insulin") || lower.includes("blood sugar") || lower.includes("glucose")) themes.push("diabetes care");
  // Require insurance/claim context for "denied"/"rejected". "my card was denied" shouldn't push insurance theme
  if (lower.includes("prior auth") || lower.includes("not covered") ||
      (lower.includes("denied") && (lower.includes("insurance") || lower.includes("claim") || lower.includes("coverage") || lower.includes("authorization"))) ||
      (lower.includes("rejected") && (lower.includes("insurance") || lower.includes("claim") || lower.includes("authorization")))) themes.push("insurance challenges");
  if (lower.includes("new prescription") || lower.includes("new rx") || lower.includes("doctor sent") || lower.includes("e-prescribe")) themes.push("new prescription needs");
  if (themes.length === 0) themes.push("your situation");
  return themes.join(", ");
}

function isVagueMessage(text: string): boolean {
  const trimmed = text.trim().toLowerCase().replace(/[^a-z\s]/g, "");
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 3) {
    const vagueWords = new Set(["hi", "hey", "hello", "yo", "sup", "ok", "okay", "sure", "yeah", "yes", "no", "nah", "good", "fine", "great", "cool", "nice", "thanks", "ty", "idk", "dunno", "nothing", "nm", "sop", "hm", "hmm", "um", "uh", "lol", "haha", "k", "yep", "nope", "yea", "ya"]);
    return words.every(w => vagueWords.has(w));
  }
  return false;
}

const COMMON_WORDS = new Set(["i", "me", "my", "we", "you", "your", "the", "a", "an", "is", "are", "was", "am", "be", "been", "do", "does", "did", "have", "has", "had", "will", "would", "can", "could", "should", "may", "might", "to", "of", "in", "on", "at", "for", "with", "from", "by", "it", "this", "that", "not", "no", "yes", "and", "or", "but", "if", "so", "just", "get", "got", "go", "come", "want", "need", "like", "know", "think", "make", "take", "see", "look", "help", "tell", "call", "give", "use", "try", "find", "ask", "work", "feel", "let", "put", "say", "said", "what", "how", "when", "where", "who", "why", "which", "all", "some", "any", "much", "many", "more", "most", "very", "too", "also", "about", "out", "up", "down", "off", "over", "here", "there", "now", "then", "than", "them", "they", "their", "he", "she", "his", "her", "him", "its", "our", "us", "back", "only", "well", "still", "even", "way", "day", "time", "new", "old", "good", "bad", "big", "long", "first", "last", "right", "left", "next", "one", "two", "three", "don", "dont", "doesn", "didn", "won", "can", "cant", "couldn", "shouldn", "wouldn", "isn", "aren", "wasn", "weren", "hasn", "haven", "hadn", "ll", "ve", "re", "pharmacy", "medicine", "medication", "prescription", "pill", "drug", "doctor", "health", "sick", "pain", "delivery", "deliver", "pickup", "pick", "refill", "blister", "pack", "insurance", "cost", "price", "order", "track", "transfer", "switch", "store", "line", "wait", "hate", "love", "tired", "busy", "thank", "thanks", "please", "sorry", "hey", "hi", "hello"]);
function isSpanishText(text: string): boolean {
  return isSupportedSpanishMessage(text);
}

function extractSearchTerm(text: string): string | null {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !COMMON_WORDS.has(w));
  if (words.length === 0) return null;
  return words.slice(0, 3).join(" ");
}

function isGibberish(text: string): boolean {
  const cleaned = text.trim();
  if (isUnreadableShortMessage(cleaned)) return true;
  if (cleaned.length < 4) return false;
  // The heuristics below use an English vocabulary. Valid Spanish must reach
  // the Spanish intent path instead of being rejected as malformed input.
  if (isSpanishText(cleaned)) return false;
  const alphaOnly = cleaned.replace(/[^a-zA-Z]/g, "");
  if (alphaOnly.length === 0 && cleaned.length >= 4) return true;
  const vowelRatio = (alphaOnly.match(/[aeiouAEIOU]/g) || []).length / (alphaOnly.length || 1);
  if (alphaOnly.length >= 6 && (vowelRatio < 0.1 || vowelRatio > 0.85)) return true;
  // Check consecutive consonants per word (not across the whole string. joining
  // removes spaces and creates false chains like "transfer my" → "rmypr")
  const wordTokens = cleaned.split(/\s+/);
  const hasGibberishWord = wordTokens.some(w => {
    const wAlpha = w.replace(/[^a-zA-Z]/g, "");
    if (wAlpha.length < 5) return false;
    const cc = wAlpha.match(/[^aeiouAEIOU]{5,}/gi);
    return cc !== null && cc.length > 0;
  });
  if (hasGibberishWord) return true;
  const words = cleaned.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const recognizedCount = words.filter(w => COMMON_WORDS.has(w)).length;
  const recognizedRatio = recognizedCount / words.length;
  if (words.length >= 3 && recognizedRatio < 0.15) return true;
  if (words.length === 1 && !COMMON_WORDS.has(words[0]) && words[0].length >= 6) {
    const repeats = words[0].match(/(.)\1{2,}/g);
    if (repeats) return true;
    if (vowelRatio < 0.15) return true;
  }
  return false;
}

function detectPII(text: string): boolean {
  const t = text.toLowerCase();
  // Full name: "my name is John Doe". two title-case words after the phrase
  if (/my name is\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text)) return true;
  // Social Security Number pattern: 123-45-6789 or 123 45 6789
  if (/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/.test(text)) return true;
  // Date of birth shared explicitly
  if (t.includes("date of birth") || /\bdob\b/.test(t) || t.includes("born on") || /my dob/.test(t)) return true;
  if (t.includes("fecha de nacimiento") || t.includes("nací el") || t.includes("naci el")) return true;
  // Insurance / member ID
  if (t.includes("member id") || t.includes("insurance number") || t.includes("insurance id") || t.includes("policy number") || t.includes("group number") || t.includes("rx bin") || t.includes("rx group")) return true;
  if (/\b(?:prescription|rx)\s*(?:number|no\.?|#)\s*[:#-]?\s*[a-z0-9-]+\b/i.test(text)) return true;
  if (t.includes("número de miembro") || t.includes("numero de miembro") || t.includes("número de seguro") || t.includes("numero de seguro") || t.includes("identificación del seguro") || t.includes("identificacion del seguro") || t.includes("número de póliza") || t.includes("numero de poliza") || t.includes("número de receta") || t.includes("numero de receta")) return true;
  return false;
}

function isOnlyNameIntroduction(text: string): boolean {
  return /^(?:my name is|call me|i am|i'm|im|me llamo|puedes llamarme|soy)\s+[\p{L}][\p{L}'-]{1,29}[.!]?$/iu.test(text.trim());
}

function isConversationCancellation(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  return /^(?:cancel|stop|never\s*mind|nevermind)(?:\s+(?:that|this|it|request))?$/.test(normalized) ||
    /^(?:i\s+)?(?:do not|don't|dont)\s+(?:need|want)\s+(?:delivery|pickup|a refill|the refill|that|this|it)$/.test(normalized) ||
    /^(?:do not|don't|dont)\s+refill\b/.test(normalized);
}

// ── Catalog category → shop slug normalization ────────────────────────────
// Maps free-form catalog category strings to the slug values accepted by the
// shop page (?category=<slug> must be a key in OTC_INTENTS on shop.tsx).
const CATALOG_TO_SHOP_SLUG: Record<string, string> = {
  "pain relief": "pain",
  "pain & joints": "pain",
  "pain": "pain",
  "allergy": "wellness",
  "cold & flu": "wellness",
  "vitamins": "wellness",
  "vitamin": "wellness",
  "supplements": "wellness",
  "supplement": "wellness",
  "wellness": "wellness",
  "immunity": "wellness",
  "first aid": "wellness",
  "sleep aid": "wellness",
  "digestive": "digestive",
  "digestive health": "digestive",
  "skin": "skin",
  "skin care": "skin",
  "skin & aesthetics": "skin",
  "dental": "dental",
  "dental & oral": "dental",
  "oral care": "dental",
  "headache": "headache",
  "headache & focus": "headache",
  "diabetes": "diabetes",
  "weight management": "weight-management",
  "weight-management": "weight-management",
  "heart vitality": "heart-vitality",
  "mens-womens-health": "mens-womens-health",
  "grocery": "wellness",
};

function normalizeCategoryToShopSlug(category: string): string {
  return CATALOG_TO_SHOP_SLUG[category.toLowerCase()] ?? "all";
}

// ── Live product catalog cache ─────────────────────────────────────────────
interface ProductCacheItem {
  id: string;
  name: string;
  category: string;
  inStock: boolean;
  stockQuantity: number;
  requiresPrescription: boolean;
  price?: string | null;
  imageUrl?: string | null;
}
let _liveProducts: ProductCacheItem[] = [];
let _liveProductsLastFetched = 0;
const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;

function fuzzyMatchProduct(text: string): ProductCacheItem | null {
  if (_liveProducts.length === 0) return null;
  const inputTokens = text
    .toLowerCase()
    .split(/[\s,.()\-/]+/)
    .filter(t => t.length > 2 && !COMMON_WORDS.has(t));
  if (inputTokens.length === 0) return null;

  // Expand query tokens with brand↔generic and purpose synonyms so that e.g.
  // "Advil" matches a product named "Ibuprofen 200mg" and vice-versa.
  // Score denominator stays at inputTokens.length (original query size) so
  // synonym expansion never artificially inflates relevance.
  const expandedTokens = expandWithSynonyms(inputTokens);

  let best: { product: ProductCacheItem; score: number } | null = null;
  for (const p of _liveProducts) {
    // Strip dosage/count tokens that start with a digit (e.g. "200mg", "10mg", "30ct")
    // so the denominator reflects meaningful name words only, not packaging metadata.
    const nameTokens = p.name.toLowerCase().split(/[\s,.()\-/]+/)
      .filter(t => t.length > 1 && !/^\d/.test(t));
    const catTokens = p.category.toLowerCase().split(/[\s,.()\-/]+/).filter(t => t.length > 1);
    const allTokens = [...nameTokens, ...catTokens];
    let matches = 0;
    for (const it of expandedTokens) {
      // pt.includes(it): product token contains the query/synonym token (primary direction).
      // it.includes(pt): query token contains the product token. only allowed when the
      //   product token is ≥70% the length of the query token so that e.g. "multivitamin"
      //   does NOT false-match "vitamin" in an unrelated product, while "probiotics" still
      //   correctly matches "probiotic" (9/10 = 0.9 ≥ 0.7).
      if (allTokens.some(pt =>
        pt.includes(it) || (it.includes(pt) && pt.length >= it.length * 0.7)
      )) matches++;
    }
    const score = matches / Math.max(inputTokens.length, nameTokens.length, 1);
    if (score >= 0.45 && (!best || score > best.score)) {
      best = { product: p, score };
    }
  }
  if (best) return best.product;

  // ── Levenshtein second pass ────────────────────────────────────────────
  // Only runs when the .includes() pass above found nothing (best === null).
  // Applies fuzzy matching to tokens ≥ 4 chars to recover typos like
  // "tyenol" → Tylenol, "ibuprofn" → Ibuprofen, "advill" → Advil.
  // Short tokens (< 4 chars) are skipped to avoid false positives on
  // common abbreviations ("mg", "oz", "tab").
  for (const p of _liveProducts) {
    const nameTokens = p.name.toLowerCase().split(/[\s,.()\-/]+/)
      .filter(t => t.length > 1 && !/^\d/.test(t));
    const catTokens = p.category.toLowerCase().split(/[\s,.()\-/]+/).filter(t => t.length > 1);
    const allTokens = [...nameTokens, ...catTokens];

    let matches = 0;
    for (const it of inputTokens) {
      if (it.length < 4) continue; // skip short tokens. too error-prone
      const maxEdits = getAllowedEdits(it);
      const hit = allTokens.some(pt => levenshteinDistance(it, pt, maxEdits) <= maxEdits);
      if (hit) matches++;
    }
    const score = matches / Math.max(inputTokens.length, nameTokens.length, 1);
    if (score >= 0.45 && (!best || score > best.score)) {
      best = { product: p, score };
    }
  }

  return best ? best.product : null;
}

// ── Split & Extract helpers ────────────────────────────────────────────────
// Handles "mixed basket" messages that combine a pharmacy request with OTC
// item names, e.g. "my rxs and a shaving cream also need pedialyte".

function splitIntoClauses(text: string): string[] {
  return text
    .split(/\b(?:and|then|also|plus|along with|as well as)\b|,/i)
    .map(s => s.trim())
    .filter(Boolean);
}

const PHARMACY_INTENTS_SET = new Set([
  "refill", "transfer", "new_rx", "medication_clarification", "speak_pharmacist",
  "insurance", "delivery", "blister_pack", "specialty", "flu_shot",
  "pickup", "cost_concern", "loyalty",
]);

interface MixedQueryResult {
  intent: string;
  products: ProductCacheItem[];
  unmatchedItems: string[];
}

function extractMixedQuery(rawText: string): MixedQueryResult | null {
  // Only attempt on messages long enough to plausibly be multi-topic
  const wordCount = rawText.trim().split(/\s+/).length;
  if (wordCount < 5) return null;

  const clauses = splitIntoClauses(rawText);
  if (clauses.length < 2) return null;

  let pharmacyIntent: string | null = null;
  const products: ProductCacheItem[] = [];
  const unmatchedItems: string[] = [];
  const seen = new Set<string>();

  for (const clause of clauses) {
    // Try catalog match first. a direct product hit captures the OTC side
    const productHit = fuzzyMatchProduct(clause);
    if (productHit && !seen.has(productHit.id)) {
      seen.add(productHit.id);
      products.push(productHit);
    } else {
      // Not a product. check for pharmacy intent on this clause alone,
      // bypassing the live-product lookup to avoid false "live_product:" hits.
      const clauseIntent = isMedicationHelpRequest(clause)
        ? "medication_clarification"
        : detectIntentHybrid(clause);
      if (clauseIntent !== "general" && PHARMACY_INTENTS_SET.has(clauseIntent)) {
        pharmacyIntent = pharmacyIntent ?? clauseIntent;
        const embeddedItem = extractUnmatchedPickupItem(clause);
        if (embeddedItem) unmatchedItems.push(embeddedItem);
      } else {
        const item = clause
          .replace(/^(?:i (?:also )?(?:want|need)|some|a|an|the)\s+/i, "")
          .replace(/\b(?:por favor|please|gracias|thanks)\b/gi, "")
          .trim();
        if (item.length >= 3) unmatchedItems.push(item);
      }
    }
  }

  if ((pharmacyIntent || products.length > 0) && (products.length > 0 || unmatchedItems.length > 0)) {
    return { intent: pharmacyIntent ?? "otc_shop", products, unmatchedItems };
  }
  return null;
}

const INTENT_LABEL: Record<string, string> = {
  refill: "prescription refill",
  transfer: "prescription transfer",
  transfer_and_shop: "separate transfer and shop requests",
  new_rx: "new prescription",
  medication_clarification: "prescription request",
  speak_pharmacist: "pharmacist consultation",
  insurance: "insurance question",
  delivery: "delivery request",
  blister_pack: "blister pack",
  specialty: "specialty medication",
  flu_shot: "flu shot appointment",
  pickup: "pharmacy pickup",
  cost_concern: "cost / savings question",
  loyalty: "loyalty rewards question",
};

function findRelatedInStock(outOfStockProduct: ProductCacheItem, limit = 2): ProductCacheItem[] {
  return _liveProducts
    .filter(
      p =>
        p.id !== outOfStockProduct.id &&
        p.category === outOfStockProduct.category &&
        p.inStock &&
        (p.stockQuantity ?? 0) > 0
    )
    .slice(0, limit);
}

const ADJACENT_SHOP_SLUGS: Record<string, string[]> = {
  pain: ["wellness", "digestive"],
  wellness: ["pain", "digestive", "skin"],
  digestive: ["wellness", "pain"],
  skin: ["wellness", "dental"],
  dental: ["skin", "wellness"],
  headache: ["pain", "wellness"],
  diabetes: ["wellness", "digestive"],
  "weight-management": ["wellness", "digestive"],
  "heart-vitality": ["wellness", "pain"],
  "mens-womens-health": ["wellness"],
};

function findAdjacentCategoryInStock(shopSlug: string, limit = 2): ProductCacheItem[] {
  const adjacents = ADJACENT_SHOP_SLUGS[shopSlug] ?? [];
  const results: ProductCacheItem[] = [];
  for (const adjSlug of adjacents) {
    if (results.length >= limit) break;
    const matching = _liveProducts.filter(
      p =>
        normalizeCategoryToShopSlug(p.category) === adjSlug &&
        p.inStock &&
        (p.stockQuantity ?? 0) > 0 &&
        !p.requiresPrescription
    );
    results.push(...matching.slice(0, limit - results.length));
  }
  return results.slice(0, limit);
}

import { detectIntentHybrid, expandWithSynonyms, levenshteinDistance, getAllowedEdits, extractVoluntaryFirstName, isEnglishLanguagePreference, isSpanishLanguagePreference, detectConversationLanguage, type ConversationLanguage, isSignupRequest, isUnreadableShortMessage, isSupportedSpanishMessage, isMedicationHelpRequest, isSmallTalkCheckIn, isAppointmentDateFragment, isFluSchedulingAssistanceFollowUp, isExplicitOtcRequest, isControlledSubstanceRequest, hasClinicalTermOrDiagnosis, detectSpanishIntent, isInboundTransferRequest, extractOtcPainSymptom } from "@/lib/intent-engine";

function detectIntent(text: string): string {
  const lower = text.toLowerCase();

  // ── Tier 0-A: Life-threatening emergencies ─────────────────────────────
  if (isEmergencySafetySignal(text)) {
    return "emergency";
  }

  // ── Tier 0-B: Clinical safety escalations → speak_pharmacist ──────────
  // Must fire before live product match so that e.g. "do you have warfarin?"
  // routes to a pharmacist instead of a product page.

  // Wrong medication dispensed
  if (lower.includes("wrong medication") || lower.includes("wrong pill") || lower.includes("wrong drug") || lower.includes("wrong medicine") || lower.includes("incorrect medication") || lower.includes("incorrect pill") || lower.includes("wrong prescription") || lower.includes("gave me the wrong") || lower.includes("received the wrong") || lower.includes("dispensed wrong") || lower.includes("wrong dose") || lower.includes("wrong dosage") || lower.includes("wrong strength")) {
    return "speak_pharmacist";
  }
  // Medication not working as expected
  if ((lower.includes("not working") || lower.includes("isn't working") || lower.includes("isnt working") || lower.includes("doesn't work") || lower.includes("doesnt work") || lower.includes("not helping") || lower.includes("isn't helping") || lower.includes("not effective")) && (lower.includes("med") || lower.includes("pill") || lower.includes("drug") || lower.includes("prescription") || lower.includes("medicine") || lower.includes("medication"))) {
    return "speak_pharmacist";
  }
  // Pregnancy / breastfeeding safety
  if (lower.includes("pregnant") || lower.includes("pregnancy") || lower.includes("safe during pregnancy") || lower.includes("while pregnant") || lower.includes("breastfeed") || lower.includes("breastfeeding") || lower.includes("while breastfeeding") || lower.includes("safe while nursing") || (lower.includes("nursing") && (lower.includes("medication") || lower.includes("safe") || lower.includes("pill") || lower.includes("drug") || lower.includes("take")))) {
    return "speak_pharmacist";
  }
  // Concordia does not stock or dispense controlled substances. Keep this
  // ahead of catalog matching so chat can never imply availability.
  if (isControlledSubstanceRequest(text)) {
    return "controlled_substance";
  }
  // Other high-risk medications always escalate regardless of product match.
  if (lower.includes("blood thinner") || lower.includes("warfarin") || lower.includes("coumadin") || lower.includes("eliquis") || lower.includes("xarelto")) {
    return "speak_pharmacist";
  }

  // Account creation must outrank catalog matching. Short user abbreviations
  // such as "create acc" must never resolve to a product named "Accessory".
  if (isSignupRequest(text)) return "signup";
  if (/\b(?:can(?:not|'t)|cant|unable to|trouble|problem|issues?)\b.*\b(?:sign in|log in|login)\b/.test(lower) ||
      /\b(?:sign in|log in|login)\b.*\b(?:problem|trouble|issue|not working|failed)\b/.test(lower)) {
    return "forgot_password";
  }
  // A symptom or diagnosis mention is not a request for treatment advice.
  if (isInboundTransferRequest(text)) return "transfer";
  if (hasClinicalTermOrDiagnosis(text) && !isExplicitOtcRequest(text)) return "clinical_information";
  // Explicit language choices must outrank catalog matching and generic search
  // recovery, including a one-word reply such as "spanish".
  if (isSpanishLanguagePreference(text)) return "spanish";
  if (isSpanishText(text)) {
    const spanishIntent = detectSpanishIntent(text);
    if (spanishIntent !== "spanish") return spanishIntent;
  }
  if (/\b(?:headache|migraines?|migranes?)\b/.test(lower) && isExplicitOtcRequest(text)) return "otc_pain";

  // ── Tier 0-C: Live catalog match ───────────────────────────────────────
  // Runs after safety escalations so high-risk drug names never land on a
  // product card; runs before everything else so specific OTC questions get
  // a real product answer before category-level intents fire.
  const liveMatch = fuzzyMatchProduct(text);
  if (liveMatch) return `live_product:${liveMatch.id}`;

  const negativeWords = ["hate", "sick of", "tired of", "tired", "can't stand", "don't want", "dont want", "don't like", "dont like", "dread", "annoying", "frustrat", "awful", "worst", "terrible", "horrible", "long", "wait", "busy", "no time"];
  const pickupContextWords = ["pickup", "pick up", "store", "line", "lines", "pharmacy", "counter", "drive", "go in", "going in", "going to"];
  const hasNegative = negativeWords.some(w => lower.includes(w));
  const hasPickupContext = pickupContextWords.some(w => lower.includes(w));
  if (hasNegative && hasPickupContext) {
    return "negative_pickup";
  }
  if (lower.includes("someone else pick") || lower.includes("authorized pickup") || lower.includes("proxy pickup") || lower.includes("pick it up for me") || lower.includes("pick up for me") || lower.includes("picking up for me") || (lower.includes("can my") && lower.includes("pick")) || (lower.includes("on my behalf") && lower.includes("pick"))) {
    return "proxy_pickup";
  }
  if ((lower.includes("walk") || lower.includes("come in") || lower.includes("walk-in")) && (lower.includes("vaccine") || lower.includes("flu shot") || lower.includes("immuniz"))) {
    return "flu_shot";
  }
  if (lower.includes("pickup") || lower.includes("pick up") || lower.includes("come in") || lower.includes("walk in") || lower.includes("in person") || lower.includes("stop by") || lower.includes("swing by") || lower.includes("drive thru") || lower.includes("drive through") || lower.includes("drive-through") || lower.includes("drive-thru") || lower.includes("curbside")) {
    return "pickup";
  }

  if (!/\b(?:flu|vaccine|vaccination|shot|booster|gripe|vacuna)\b/.test(lower) &&
      (/\b(?:book|schedule|make|set up|need|want)\b.{0,24}\b(?:an?\s+)?appointment\b|\bappointment\b.{0,24}\b(?:book|schedule|available|availability)\b|\b(?:programar|hacer|necesito|quiero)\b.{0,24}\b(?:una\s+)?cita\b|\bcita\b.{0,24}\b(?:disponible|programar|reservar)\b/.test(lower))) {
    return "appointment";
  }
  if (lower.includes("habla espa") || lower.includes("en español") || lower.includes("no hablo") || lower.includes("spanish speaking") || lower.includes("necesito ayuda") || lower.includes("farmacia") || lower.includes("hablo") || lower.includes("receta") || lower.includes("pastilla") || lower.includes("medicament") || lower.includes("necesito") || lower.includes("cuánto") || lower.includes("por favor") || lower.includes("ayuda") || lower.includes("tengo") || lower.includes("quiero") || lower.includes("tiene") || lower.includes("seguro medico") || lower.includes("seguro médico") || lower.includes("entrega a domicilio") || lower.includes("dolor") || lower.includes("español")) {
    return "spanish";
  }

  if (lower.includes("who is the pharmacist") || lower.includes("pharmacist name") || lower.includes("head pharmacist") || lower.includes("pharmacist in charge")) {
    return "pharmacist";
  }

  if (lower.includes("are you a robot") || lower.includes("are you a bot") || lower.includes("are you human") || lower.includes("are you real") || lower.includes("are you ai") || lower.includes("are you automated") || lower.includes("talking to a bot") || lower.includes("talking to a human") || lower.includes("am i talking to") || lower.includes("robot or human") || lower.includes("bot or human") || lower.includes("chatbot") || lower.includes("are you alive") || lower.includes("is this a bot") || lower.includes("is this a robot")) {
    return "bot_check";
  }

  if (lower.includes("phone number") || lower.includes("contact number") || lower.includes("contact info") || lower.includes("how do i reach") || lower.includes("how to reach") || lower.includes("how to contact") || lower.includes("reach you") || lower.includes("your email") || lower.includes("your fax")) {
    return "contact_info";
  }
  if (/\b(?:confirm|check|verify)\b.{0,20}\b(?:my\s+)?order\b|\b(?:is|was)\s+my\s+order\s+(?:confirmed|accepted|received)\b/.test(lower)) {
    return "tracking";
  }
  if (lower.includes("speak to") || lower.includes("speak with") || lower.includes("talk to") || lower.includes("call me") || lower.includes("pharmacist") || lower.includes("connect me") || lower.includes("real person") || lower.includes("a human") || lower.includes("to a human") || lower.includes("representative")) {
    return "speak_pharmacist";
  }

  // ── Tier 1 + 2: Hybrid regex + Jaccard engine (all remaining intents) ──
  return detectIntentHybrid(text);
}

const LOCAL_MODEL_INTENTS = new Set([
  "flu_shot", "refill", "tracking", "transfer", "otc_shop", "cart", "checkout", "pickup",
  "delivery_zones", "hours", "location", "speak_pharmacist", "app", "signup",
  "delivery_cost", "insurance_accepted", "parking", "languages", "payment_methods",
]);

async function detectIntentWithLocalModel(text: string): Promise<string> {
  const deterministicIntent = detectIntent(text);
  if (!shouldConsultLocalClassifier(deterministicIntent, text, isSupportedSpanishMessage(text))) {
    return deterministicIntent;
  }
  try {
    const response = await fetch("/api/chat/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) return deterministicIntent;
    const result = await response.json() as { intent?: string; confident?: boolean };
    if (result.confident && result.intent && LOCAL_MODEL_INTENTS.has(result.intent)) {
      return result.intent;
    }
  } catch {
    // The deterministic engine remains fully functional if local inference fails.
  }
  return deterministicIntent;
}

function detectAmbiguousIntent(text: string): { question: string; options: Array<{ label: string; value: string }> } | null {
  const lower = text.toLowerCase().trim();

  const hasInboundSignal =
    lower.includes("to concordia") ||
    lower.includes("to you") ||
    lower.includes("to here") ||
    lower.includes("come to you") ||
    lower.includes("join") ||
    lower.includes("from cvs") ||
    lower.includes("from walgreens") ||
    lower.includes("from rite aid") ||
    lower.includes("from duane reade") ||
    lower.includes("from my current pharmacy") ||
    lower.includes("from another pharmacy") ||
    lower.includes("from a different pharmacy") ||
    lower.includes("bring my prescriptions") ||
    lower.includes("bring my meds");

  const hasOutboundSignal =
    lower.includes("transfer out") ||
    lower.includes("leave concordia") ||
    lower.includes("leaving concordia") ||
    lower.includes("switch away") ||
    lower.includes("away from") ||
    lower.includes("from here") ||
    lower.includes("transfer to another") ||
    lower.includes("transfer to a different") ||
    lower.includes("transfer to cvs") ||
    lower.includes("transfer to walgreens") ||
    lower.includes("transfer to rite aid") ||
    lower.includes("go somewhere else") ||
    lower.includes("going somewhere else") ||
    // Require transfer/prescription context so "is there another pharmacy nearby?" doesn't misfire
    (lower.includes("another pharmacy") && (lower.includes("transfer") || lower.includes("switch") || lower.includes("move") || lower.includes("fill") || lower.includes("prescri") || lower.includes("meds"))) ||
    (lower.includes("different pharmacy") && (lower.includes("transfer") || lower.includes("switch") || lower.includes("move") || lower.includes("fill") || lower.includes("prescri") || lower.includes("meds")));

  const isSwitchOrTransfer =
    (lower.includes("switch") && (lower.includes("pharmac") || lower.includes("prescription") || lower.includes("meds") || lower.includes("medication") || text.length < 60)) ||
    (lower.includes("transfer") && !lower.includes("transfer my prescription to concordia") && !lower.includes("transfer out") && text.length < 80) ||
    lower.includes("change pharmac") ||
    lower.includes("changing pharmac") ||
    lower.includes("thinking of switching") ||
    lower.includes("thinking about switching") ||
    lower.includes("thinking of changing") ||
    lower.includes("thinking about changing") ||
    (lower.includes("considering") && (lower.includes("switch") || lower.includes("transfer") || lower.includes("pharmacy")));

  if (isSwitchOrTransfer && !hasInboundSignal && !hasOutboundSignal) {
    return {
      question: "Happy to help! Just to make sure I send you to the right place: are you looking to bring your prescriptions **to** Concordia, or transfer them **away** from us?",
      options: [
        { label: "Bring my prescriptions TO Concordia", value: "I want to transfer my prescriptions to Concordia from my current pharmacy" },
        { label: "Transfer my prescriptions away from here", value: "I want to transfer my prescriptions away from Concordia to a different pharmacy" },
      ],
    };
  }

  return null;
}

interface MedHint { name: string; category: "otc" | "rx" }

const MED_FUZZY_MAP: Array<{ patterns: string[]; hint: MedHint }> = [
  { patterns: ["ibu", "ibuprofin", "ibuprophen", "ibuprophin", "ibupropen", "ibupofen", "ibuprofen"], hint: { name: "Ibuprofen", category: "otc" } },
  { patterns: ["asprin", "asperin", "aspirn", "aspiran", "aspirine", "asiprin", "aspirin"], hint: { name: "Aspirin", category: "otc" } },
  { patterns: ["acetaminaphen", "acetaminaphin", "acetaminophine", "actaminophen", "aceetaminophen", "acetaminophen"], hint: { name: "Acetaminophen (Tylenol)", category: "otc" } },
  { patterns: ["tylanol", "tyelenol", "tylenoll", "tilenol", "tylonol", "tilnol", "tilenoll", "tilinol", "tylnol", "tilanol", "tylenol"], hint: { name: "Tylenol", category: "otc" } },
  { patterns: ["benedryl", "benadryll", "benadril", "bennadryl", "benadrell", "benadryl"], hint: { name: "Benadryl", category: "otc" } },
  { patterns: ["claratin", "clarityn", "clarratin", "clariton", "clareton", "claritin"], hint: { name: "Claritin", category: "otc" } },
  { patterns: ["zyrteck", "zyrtek", "zeritec", "zirtec", "zyrtec"], hint: { name: "Zyrtec", category: "otc" } },
  { patterns: ["niquil", "nyquill", "niquill", "nyqill", "nyquil"], hint: { name: "NyQuil", category: "otc" } },
  { patterns: ["daiquil", "dayqill", "dayquill", "dayquil"], hint: { name: "DayQuil", category: "otc" } },
  { patterns: ["meltonin", "melitonin", "melatonyn", "melantonin", "melatoinin", "melatonin"], hint: { name: "Melatonin", category: "otc" } },
  { patterns: ["mucinecs", "mucenex", "muscinex", "mucenecs", "mucinex"], hint: { name: "Mucinex", category: "otc" } },
  { patterns: ["robitussen", "robitussn", "robitussinn", "robitussin"], hint: { name: "Robitussin", category: "otc" } },
  { patterns: ["adville", "addvil", "advill", "advil"], hint: { name: "Advil", category: "otc" } },
  { patterns: ["naproxin", "naproxen"], hint: { name: "Naproxen (Aleve)", category: "otc" } },
  { patterns: ["amoxacillin", "amoxacillan", "amoxicillan", "amoxacilan", "amoxicilin", "amoxicillin"], hint: { name: "Amoxicillin", category: "rx" } },
  { patterns: ["azithramycin", "azithromicin", "azithromysin", "azithromycen", "azitromycin", "azithromycin"], hint: { name: "Azithromycin", category: "rx" } },
  { patterns: ["lisonopril", "lisinipril", "lisonipril", "lisnopril", "lisynopril", "lisinopril"], hint: { name: "Lisinopril", category: "rx" } },
  { patterns: ["metformine", "metforman", "metfformin", "metforminn", "metformin"], hint: { name: "Metformin", category: "rx" } },
  { patterns: ["levothyroxin", "levoythyroxine", "levothyorine", "levothyroxne", "levothyroxine"], hint: { name: "Levothyroxine (Synthroid)", category: "rx" } },
  { patterns: ["sertralin", "sertralene", "sertaline", "sertreline", "sertraline"], hint: { name: "Sertraline (Zoloft)", category: "rx" } },
  { patterns: ["omeprazol", "omeprazle", "omeperazole", "omeprazole"], hint: { name: "Omeprazole (Prilosec)", category: "rx" } },
  { patterns: ["pantoprazol", "pantorazole", "pantoprazole"], hint: { name: "Pantoprazole (Protonix)", category: "rx" } },
  { patterns: ["amlodapine", "amlodipin", "amlodipene", "amlodipine"], hint: { name: "Amlodipine", category: "rx" } },
  { patterns: ["metoporol", "metoprolo", "metoprololl", "metoprolol"], hint: { name: "Metoprolol", category: "rx" } },
  { patterns: ["losarton", "lossartan", "lozartan", "losartan"], hint: { name: "Losartan", category: "rx" } },
  { patterns: ["gabapentinn", "gabapenten", "gabpentin", "gabapentin"], hint: { name: "Gabapentin", category: "rx" } },
  { patterns: ["atorvostatin", "atorvastatin"], hint: { name: "Atorvastatin (Lipitor)", category: "rx" } },
  { patterns: ["fluoxetene", "fluoxitine", "fluxetine", "fluoxetine"], hint: { name: "Fluoxetine (Prozac)", category: "rx" } },
  { patterns: ["escitaloprim", "escitalpram", "escitalopram"], hint: { name: "Escitalopram (Lexapro)", category: "rx" } },
  { patterns: ["bupropeon", "buproprion", "bupropian", "bupropion"], hint: { name: "Bupropion (Wellbutrin)", category: "rx" } },
  { patterns: ["prednisone", "prednizone", "prednezone"], hint: { name: "Prednisone", category: "rx" } },
  { patterns: ["furosomide", "furosimide", "furesemide", "furosemide"], hint: { name: "Furosemide (Lasix)", category: "rx" } },
  { patterns: ["montelucast", "montelucast", "montelucast", "montelukast"], hint: { name: "Montelukast (Singulair)", category: "rx" } },
];

function detectSingleWordMed(text: string): MedHint | null {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.split(/\s+/).length > 3) return null;
  for (const entry of MED_FUZZY_MAP) {
    if (entry.patterns.includes(trimmed)) return entry.hint;
  }
  return null;
}

const LEAD_INTENTS = new Set(["blister_pack", "transfer", "tracking", "cost", "refill", "general", "caregiver_worry", "distance", "blister_explain", "negative_pickup", "new_rx", "auto_refill", "med_sync", "prior_auth", "copay_assist", "update_insurance", "transfer_out", "weight", "diabetes", "dme", "mtm", "complaint", "wellness_pack"]);

const OTC_SHOP_MAP: Record<string, string> = {
  otc_pain: "pain",
  otc_cold: "wellness",
  otc_allergy: "wellness",
  otc_digestive: "digestive",
  otc_wellness: "wellness",
  otc_skin: "skin",
  otc_dental: "dental",
  otc_category: "wellness",
  otc_shop: "",
  grocery: "wellness",
};

const NO_AUTO_ADDRESS_INTENTS = new Set(["greeting_reply", "thanks", "hours", "location", "flu_shot", "otc_shop", "otc_category", "otc_pain", "otc_cold", "otc_allergy", "otc_digestive", "otc_wellness", "otc_skin", "otc_dental", "return_refund", "grocery", "signup", "app", "loyalty", "services", "covid", "compounding", "pickup", "negative_pickup", "emergency", "spanish", "complaint", "side_effects", "missed_dose", "food_alcohol", "disposal", "forgot_password", "update_profile", "about", "pharmacist", "languages", "parking", "after_hours", "website", "pet_meds", "blood_pressure", "insurance_accepted", "medicare", "medicaid", "no_insurance", "goodrx", "update_insurance", "order_status", "transfer_out", "fill_time", "delivery_cost", "delivery_zones", "wellness_pack", "bot_check", "drug_interaction", "cancel_order", "birth_control", "accessibility", "contact_info", "payment_methods", "lab_work", "needles", "proxy_pickup", "smoking", "generic_rx", "sms_updates", "vaccine_records", "rx_history", "medication_storage", "pill_identifier", "hipaa_privacy", "lost_rx", "formulary", "weekend_delivery", "doctor_referral", "dme", "specialty", "ltc"]);

const NEGATIVE_PICKUP_RESPONSES: Record<string, string> = {
  hate: "I hear you. Those lines can be such a headache. Why not request delivery from the pharmacy team? Staff can review your address and confirm availability and timing.",
  tired: "You shouldn't have to drag yourself to a pharmacy when you're already tired. You can request delivery, and pharmacy staff will confirm whether it's available and when it can arrive.",
  busy: "Your time is valuable! We can deliver to your office or home so you never have to pause your day. Where is the most convenient spot for you?",
  wait: "Nobody likes standing in line, especially when you're not feeling great. You can request delivery, and pharmacy staff will confirm the available service and timing.",
  default: "I completely hear you. Dealing with traffic and standing in lines is the last thing you want to do when you're not feeling well. That's exactly why we offer free door-to-door delivery. Should we just send your meds to your home instead?",
};

function getNegativePickupResponse(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("hate")) return NEGATIVE_PICKUP_RESPONSES.hate;
  if (lower.includes("tired")) return NEGATIVE_PICKUP_RESPONSES.tired;
  if (lower.includes("busy") || lower.includes("no time")) return NEGATIVE_PICKUP_RESPONSES.busy;
  if (lower.includes("wait") || lower.includes("long") || lower.includes("line")) return NEGATIVE_PICKUP_RESPONSES.wait;
  return NEGATIVE_PICKUP_RESPONSES.default;
}

const INTENT_RESPONSES: Record<string, string> = {
  negative_pickup:
    "I completely hear you. Dealing with traffic and standing in lines is the last thing you want to do when you're not feeling well. That's exactly why we offer free door-to-door delivery. Should we just send your meds to your home instead?",
  pickup:
    "Pickup works. Choose pickup during checkout, and the pharmacy will notify you when your order is ready. For a prescription pickup question, call (718) 328-2833.",
  speak_pharmacist:
    "You can speak with a Concordia pharmacist at (718) 328-2833 during business hours. If this may be an emergency, call 911.",
  clinical_information:
    "I understand you're mentioning a symptom, diagnosis, or clinical term. I can help with pharmacy services and connect you with our pharmacist, but I can't diagnose a condition or recommend treatment in chat.\n\nIf you specifically want to browse over-the-counter options, ask me for an OTC product category. For advice about what is appropriate for you, please speak with a pharmacist or your clinician at (718) 328-2833.",
  hours:
    "Concordia Pharmacy is open Monday to Friday, 9 AM to 7 PM, and Saturday, 10 AM to 4 PM. We are closed Sunday.",
  location:
    "Concordia Pharmacy is located at 898 East Tremont Ave, Bronx, NY 10460. Call (718) 328-2833 if you need directions or accessibility help.",
  flu_shot:
    "You can schedule a flu shot at Concordia Pharmacy. Use the scheduling button below to choose an available date and time; no appointment is created until you confirm it.",
  otc_shop:
    "You can browse currently available nonprescription products in our online shop. Search by product or category, then review the item before adding it to your cart.",
  otc_category:
    "We have a great selection of OTC products that can help with that! Check out our online shop for pain relief, cold & flu, vitamins, first aid, digestive health, personal care, and much more. Everything ships free with no minimum order.\n\nNot sure which product is right for you? Our pharmacist is happy to make a recommendation. Call us at (718) 328-2833. Anything else I can help with?",
  otc_pain:
    "I hear you're looking for help with pain. I can't diagnose the cause or choose a treatment for you in public chat, but I can help you browse nonprescription Pain & Joints options such as topical relief, oral pain-relief categories, muscle rubs, and joint support products.\n\nYou can browse the Pain & Joints section, or send this question to our pharmacy staff so a pharmacist can help you choose safely.",
  otc_cold:
    "Cold and flu season is rough, but we've got you covered! We carry cough syrups, decongestants, throat lozenges, nasal sprays, and more.\n\nBrowse our Wellness & Immunity section on the shop, or call us at (718) 328-2833 and we'll recommend something based on your symptoms.",
  otc_allergy:
    "Allergy season is no fun. We carry antihistamines, nasal sprays, eye drops, and more from trusted brands.\n\nHead to our shop and browse the Wellness & Immunity section, or call us at (718) 328-2833 and our pharmacist will match you to the right product.",
  otc_digestive:
    "Digestive issues are more common than people think, and there's a lot we can help with. We carry antacids, gas relief, laxatives, probiotics, and more.\n\nBrowse our Digestive Health section on the shop, or call us at (718) 328-2833 to speak with a pharmacist.",
  otc_wellness:
    "Great choice investing in your health! We carry vitamins, supplements, omega-3s, probiotics, sleep aids, and more from quality brands.\n\nBrowse our Wellness & Immunity section on the shop, or call us at (718) 328-2833 if you'd like a personalized recommendation.",
  otc_skin:
    "We carry a variety of skincare products: moisturizers, sunscreen, acne treatments, rash creams, and more.\n\nBrowse our Skin & Aesthetics section on the shop, or call us at (718) 328-2833 and our pharmacist can point you in the right direction.",
  otc_dental:
    "Good oral care is so important! We carry toothpaste, mouthwash, whitening products, floss, and more.\n\nBrowse our Dental & Oral section on the shop, or call us at (718) 328-2833 if you have questions.",
  return_refund:
    "Here's our return policy:\n\n• Unopened OTC items: returnable within 30 days with receipt\n• Perishable or refrigerated items: must be reported within 24 hours\n• Prescription medications: cannot be returned per pharmacy law\n\nFor any questions or to start a return, call us at (718) 328-2833 and we'll take care of you right away.",
  grocery:
    "We carry a selection of health-focused grocery and food items, including snacks, protein bars, beverages, and more, alongside our OTC products.\n\nHead to our shop to browse what's in stock, or call us at (718) 328-2833 and we can tell you exactly what we have available right now. Anything else I can help with?",
  bot_check:
    "I'm your ConcordiaCare Concierge, a virtual assistant for Concordia Pharmacy, not a human. But I'm connected directly to our team and can help with most questions right now.\n\nIf you'd prefer to speak with a real person, just say \"connect me\" and I'll pass you along right away. What can I help you with?",
  drug_interaction:
    "Great question to ask. drug interactions are really important to get right. Our pharmacist can review all your current medications and check for any potential interactions, free of charge.\n\nCall us at (718) 328-2833 during business hours, or stop by anytime. If you'd like, we can also schedule a full Medication Therapy Review. we go through every medication, look for interactions, and find ways to simplify your regimen.\n\nWould you like us to set that up?",
  cancel_order:
    "No problem at all! To cancel or stop an order, delivery, or scheduled refill, the quickest way is to call us at (718) 328-2833 and we'll take care of it right away.\n\nIf you have the ConcordiaCare app, you can also manage your deliveries and refill schedule there. Is there anything else I can help with?",
  birth_control:
    "We carry over-the-counter contraceptives and emergency contraception (Plan B / morning-after pill) in our store and online shop.\n\nFor prescription birth control, your doctor can e-prescribe directly to Concordia, or call us at (718) 328-2833 and we'll help coordinate everything.\n\nFor time-sensitive needs like Plan B, call us first to confirm availability. we can often have it ready very quickly. Anything else I can help with?",
  signup:
    "Join ConcordiaCare for free to manage prescriptions, request refills, track eligible orders, and earn member rewards. After five qualifying completed non-controlled full refills, members receive a one-time $20 credit toward an eligible store or OTC purchase. Cancellations, reversals, and partial fills do not qualify. The credit has no cash value and cannot be used toward prescription copays.\n\nUse the secure sign-up page to become a patient. Chat verification alone does not create an account or sign you in.",
  controlled_substance:
    "Concordia Pharmacy does not stock or dispense controlled substances. Please contact your prescriber or another licensed pharmacy for help. I can assist with Concordia's non-controlled pharmacy and store services.",
  app:
    "Current medications and prescriptions are available only after you securely sign in to ConcordiaCare. I cannot display private medication information in public chat.",
  loyalty:
    "I love talking about this! Our loyalty program rewards you for every purchase and prescription. the points add up automatically, and you can redeem them for discounts on future orders.\n\nOnce you're signed up as a patient, you start earning right away. The ConcordiaCare app makes it easy to track everything.",
  caregiver_worry:
     "It's so clear how much you care, and honestly, that love is the best medicine. We specialize in giving families that peace of mind. Does your loved one struggle with remembering the time of day to take their pills, or is it more about keeping track of the number of different medications?",
  distance:
    "Distance shouldn't be a barrier to health. and with us, it won't be. You can submit a delivery request, and pharmacy staff will verify the service area and confirm availability and timing. Where should we send the request?",
  blister_explain:
    "Great question! Think of our Blister Pack as a GPS for your health. Each dose is organized by day and time in a clear, sealed pouch. so you always know exactly what to take and when. No more sorting through bottles or worrying about missed doses.\n\nWould you like to see how it works? We can get you set up!",
  blister_pack:
    "Think of our Blister Pack as a GPS for your health. every dose is organized by day and time in a clear, sealed pouch. No more guessing what to take or when. It's labeled clearly and delivered right to your door.\n\nWould you like us to set this up for you? I just need a few details to get things started.",
  transfer:
    "Concordia can help request a prescription transfer from your current pharmacy. Use the secure transfer form or call (718) 328-2833. Do not post prescription numbers in public chat.",
  tracking:
    "To check a specific order, securely sign in to ConcordiaCare or call (718) 328-2833. I cannot display private order information in public chat.",
  cost:
    "I totally understand that concern. medication costs can be really stressful. Here's what we do: our team reviews every single prescription to find you the lowest copay. We work with all major insurance plans and always look for manufacturer coupons and generic alternatives.\n\nLet's connect you with our team to review your medications. We'll find the best options for you.",
  refill:
    "For a refill, securely sign in to ConcordiaCare and choose the eligible prescription, or call (718) 328-2833. Do not post prescription numbers or medication details in public chat.",
  greeting_reply:
    "Hi there! Welcome to Concordia Pharmacy. I'm so glad you're here. I'm your ConcordiaCare Concierge, and I'm here to help with whatever you need. whether it's about your prescriptions, delivery, our services, or just connecting you with someone from our store.\n\nWhat's on your mind today?",
  thanks:
    "That really means a lot! I'm always right here if you need anything. You can also call us anytime at (718) 328-2833. we love hearing from our patients.\n\nIs there anything else I can help with?",
  services:
    PHARMACY_SCOPE_RESPONSE,
  covid:
    "For COVID-related questions, someone from our store would be the best person to talk to. they stay up to date on everything. You can reach us at (718) 328-2833 and we'll walk you through your options.\n\nIs there anything else on your mind?",
  specialty:
    "Great question! We have a dedicated Specialty Medication Hub with over 80 specialty medications. covering oncology, rheumatology, dermatology, hepatitis, MS, and more. Our clinical pharmacists coordinate everything: prior authorizations, prescriber communication, and temperature-controlled delivery right to your door.\n\nYou can browse our full specialty database and request fulfillment directly from our site. Would you like me to point you there?",
  ltc:
    "We're proud partners with long-term care facilities across New York State! We provide custom delivery schedules, blister packaging for every resident, full regulatory compliance support, and 24/7 pharmacist access.\n\nWhether you run a nursing home, assisted living community, memory care facility, or rehabilitation center. we'd love to chat about how we can support your residents. Want me to connect you with our LTC team?",
  compounding:
    "For compounding or specialty medications, I'd love to connect you directly with someone from our store. they can discuss your specific needs in detail. You can reach us at (718) 328-2833.\n\nOr, if you'd prefer, share your info and someone will call you back. Would that be easier?",
  emergency:
    "If you or someone you're with is experiencing a medical emergency, please call 911 immediately. Do not wait.\n\nOnce you're safe, we're here to help with any follow-up. medication questions, prescription coordination, or anything else. Call us at (718) 328-2833 during business hours.\n\nIs there anything else I can do for you right now?",
  spanish:
    "Hola! Gracias por contactarnos. Hablamos español y estamos aquí para ayudarle.\n\nPuede llamarnos al (718) 328-2833 para hablar con alguien de nuestro equipo en español. También puede visitarnos en la farmacia: 898 East Tremont Ave, Bronx, NY 10460.\n\nEstamos aquí para usted. no dude en preguntar lo que necesite.",
  complaint:
    "I'm truly sorry to hear you've had a difficult experience. That's not the standard we hold ourselves to, and I want to make sure we make it right.\n\nThe best way to resolve this is to speak directly with our team. Please call us at (718) 328-2833 and ask for the pharmacist in charge, or share your name and number below and someone will reach out to you personally to address your concerns.\n\nYour feedback helps us get better. thank you for letting us know.",
  side_effects:
    "I understand how concerning that must be. Side effects can be worrying, and it's always important to take them seriously.\n\nHere's what I'd recommend:\n\n\u2022 For mild symptoms (nausea, headache, dizziness): Call our pharmacy at (718) 328-2833 and our pharmacist can review your medication and advise you.\n\u2022 For severe symptoms (difficulty breathing, severe swelling, chest pain): Call 911 immediately.\n\nNever stop or change your medication without talking to your pharmacist or doctor first. Would you like me to connect you with our team?",
  missed_dose:
    "Missed-dose instructions depend on the exact medication, dose, and timing, so I can't safely tell you whether to take or skip it in public chat. Do not take two doses together unless your prescription label or a pharmacist specifically tells you to.\n\nCheck the instructions on your prescription label and call our pharmacist at (718) 328-2833 for guidance specific to your medication. If you have severe symptoms or think you may have taken too much, call 911 or Poison Control at 1-800-222-1222.",
  food_alcohol:
    "Great question. and an important one. Some medications need to be taken with food, some on an empty stomach, and some should never be mixed with alcohol.\n\nThe safest answer is: check your prescription label or call our pharmacist at (718) 328-2833. They can give you specific guidance for each of your medications.\n\nIs there anything else I can help with?",
  disposal:
    "We make medication disposal easy and safe. You can bring any expired or unwanted medications directly to our pharmacy at 898 East Tremont Ave, Bronx, NY 10460, and we'll dispose of them properly at no charge.\n\nPlease don't flush medications down the toilet or throw them in the trash. it's harmful to the environment. We're happy to take care of it for you.\n\nIs there anything else I can help with?",
  forgot_password:
    "No worries. that happens to everyone. Here's how to get back in:\n\n\u2022 On the ConcordiaCare app: Tap \"Forgot Password\" on the login screen and follow the steps to reset via your email or phone.\n\u2022 If that doesn't work: Call us at (718) 328-2833 and we can help reset your account.\n\nIs there anything else you need help with?",
  update_profile:
    "Keeping your info up to date is really important. especially your phone number and address for deliveries and prescription notifications.\n\nYou can update your information through the ConcordiaCare app, or simply call us at (718) 328-2833 and we'll update everything in our system for you.\n\nIs there anything else I can help with?",
  prior_auth:
    "Prior authorizations can be really frustrating. but you don't have to deal with that alone. Our team handles prior auths every single day and we fight hard to get your medications covered.\n\nHere's what we do:\n\u2022 We contact your insurance company on your behalf\n\u2022 We coordinate with your prescriber for any required documentation\n\u2022 We follow up until we get an answer\n\u2022 If it's denied, we help explore alternatives and appeals\n\nLet us take the stress out of it. Would you like to share your info so our team can look into this for you?",
  copay_assist:
    "Medication costs shouldn't prevent you from getting the care you need. We have several ways to help bring those costs down:\n\n\u2022 Manufacturer copay cards and coupons\n\u2022 Patient assistance programs for qualifying patients\n\u2022 Generic alternatives when available\n\u2022 GoodRx and SingleCare discount cards\n\u2022 Insurance coordination to find the lowest price\n\nOur team reviews every prescription for savings opportunities. Would you like us to look into options for your specific medications?",
  goodrx:
    "Yes, we absolutely accept GoodRx, SingleCare, and most other prescription discount cards. Just bring your card or show us the coupon on your phone when you come in, or share the details over the phone.\n\nWe always compare the discount price against your insurance to make sure you're getting the absolute lowest cost. Would you like to know more about your options?",
  no_insurance:
    "We never want cost to be a barrier to your health. Even without insurance, we have several ways to help:\n\n\u2022 Competitive cash pricing on all prescriptions\n\u2022 GoodRx and SingleCare discount cards accepted\n\u2022 Manufacturer patient assistance programs\n\u2022 Generic alternatives whenever possible\n\u2022 Help finding insurance coverage or Medicaid eligibility\n\nOur team can review your medications and find the most affordable options. Would you like us to look into this for you?",
  update_insurance:
    "Updating your insurance is easy. Here's what you can do:\n\n\u2022 Bring your new insurance card to the pharmacy\n\u2022 Take a photo and text it to us\n\u2022 Call us at (718) 328-2833 with the new details\n\nOnce we have your updated info, we'll re-run any pending claims and make sure everything is processed correctly going forward.\n\nIs there anything else I can help with?",
  medicare:
    "Yes, we proudly accept Medicare Part D and Medicare Advantage plans. We work with all major Part D providers.\n\nIf you need help choosing a Part D plan during open enrollment, understanding your coverage, or navigating the \"donut hole,\" our team is here to help. Just call us at (718) 328-2833.\n\nWould you like to connect with our team about your Medicare coverage?",
  medicaid:
    "Absolutely! We accept Medicaid and all major Medicaid managed care plans, including HealthFirst, MetroPlus, Fidelis Care, Amerigroup, and many more.\n\nIf you have questions about your coverage or need help with eligibility, our team can guide you through it. Call us at (718) 328-2833 or share your info below.\n\nIs there anything specific about your coverage I can help with?",
  insurance_accepted:
    "We work with many insurance plans, but network participation and coverage depend on your specific plan and prescription. Please call (718) 328-2833 so our team can check securely. Don't post your member ID or insurance card in public chat.",
  weight:
    "We do carry popular weight management medications like Ozempic, Wegovy, Mounjaro, and their generics. These medications require a prescription from your doctor.\n\nWe can also help with:\n\u2022 Insurance coverage and prior authorization for weight management meds\n\u2022 Copay assistance programs\n\u2022 Delivery right to your door\n\nWould you like us to check availability or help with getting started? Our pharmacist can also answer any questions about these medications.",
  diabetes:
    "We have everything you need for diabetes management:\n\n\u2022 Insulin and oral diabetes medications\n\u2022 Test strips, lancets, and glucose monitors\n\u2022 Continuous glucose monitor (CGM) supplies\n\u2022 Diabetic socks and foot care products\n\u2022 A1C testing guidance\n\nDelivery may be requested where available; pharmacy staff confirm service and timing. We also coordinate with your doctor on refills and help find the best pricing on your supplies.\n\nWould you like to speak with our team about your diabetes care needs?",
  blood_pressure:
    "We can definitely help with blood pressure management. We carry a full range of BP medications, home monitors, and supplies.\n\nWe also offer free blood pressure checks right here in the pharmacy. just stop by anytime during business hours.\n\nIf you need help finding the right home monitor or have questions about your BP medication, call us at (718) 328-2833. Our pharmacist is happy to help.\n\nIs there anything else I can assist with?",
  pet_meds:
    "I appreciate you asking! Unfortunately, we specialize in human pharmacy services and don't carry veterinary medications.\n\nFor pet medications, I'd recommend contacting your veterinarian or a specialized veterinary pharmacy. Some human pharmacies do compound pet medications, but that's not a service we currently offer.\n\nIs there anything else I can help you with today?",
  dme:
    "We carry a selection of durable medical equipment and supplies, including:\n\n\u2022 Nebulizers and respiratory supplies\n\u2022 Blood pressure monitors\n\u2022 Glucose monitors and diabetic supplies\n\u2022 Walking aids and support products\n\nFor specific DME needs like wheelchairs, CPAP machines, or hospital beds, we can point you to trusted partners. Call us at (718) 328-2833 to discuss what you need.\n\nIs there anything else I can help with?",
  mtm:
    "We offer comprehensive Medication Therapy Management to help you get the most out of your medications. Our pharmacist will:\n\n\u2022 Review all your current medications\n\u2022 Check for potential interactions\n\u2022 Identify ways to simplify your regimen\n\u2022 Look for cost-saving alternatives\n\u2022 Coordinate with your doctors on any changes\n\nThis service is available to all our patients at no additional charge. Would you like to schedule a review? Call us at (718) 328-2833 or share your info and we'll set it up.",
  med_sync:
    "Our Medication Synchronization program is a game-changer for patients taking multiple medications. Here's how it works:\n\n\u2022 We align all your prescriptions to refill on the same day each month\n\u2022 No more multiple pharmacy trips or running out of one med before another\n\u2022 We coordinate with your doctors to adjust quantities\n\u2022 Everything arrives together in one delivery\n\nIt's completely free and makes managing your medications so much simpler. Would you like us to set this up for you?",
  new_rx:
    "I can help with that. If your doctor already sent the new prescription, Concordia can confirm receipt and begin processing it. Please don't post medication names, prescription numbers, or personal details in public chat.\n\nWould you like help with this new prescription, a refill instead, or would you prefer to speak with pharmacy staff at (718) 328-2833?",
  fill_time:
    "Great question! Here's what to expect:\n\n\u2022 Most prescriptions are ready in 15 to 30 minutes for in-store pickup\n\u2022 For delivery, Delivery timing is confirmed by pharmacy staff for each request\n\u2022 Specialty medications may take a bit longer due to insurance verification and sourcing\n\nWe'll always keep you updated on the status. You can check progress through the ConcordiaCare app or by calling (718) 328-2833.\n\nAnything else you'd like to know?",
  same_day:
    "Yes! You can request delivery for prescriptions and OTC orders. Pharmacy staff confirm availability and timing for each request\n\nSigned-in users may see eligible order updates in ConcordiaCare; live courier GPS is not currently available.\n\nNeed something delivered today? Call us at (718) 328-2833 or share your info and we'll get it moving right away.",
  delivery_zones:
    "Concordia offers local delivery for eligible prescriptions and store orders. Share the requested address only in the secure delivery step; pharmacy staff must verify the address, service area, stock, and timing before confirming.",
  delivery_cost:
    "There isn't one delivery price I can confirm in public chat. Any applicable charge, service area, and timing need to be confirmed by pharmacy staff for your request before you agree to it. Call (718) 328-2833 to ask about delivery fees.",
  auto_refill:
    "Our automatic refill program makes sure you never run out of your medications. Here's how it works:\n\n\u2022 We track when each of your prescriptions is due for a refill\n\u2022 We fill them automatically before you run low\n\u2022 We contact your doctor for renewals when needed\n\u2022 Everything is delivered to your door on a consistent schedule\n\nIt's completely free and takes one thing off your plate. Would you like us to set this up for you?",
  order_status:
    "You can check your order or prescription status in a few ways:\n\n\u2022 Through ConcordiaCare, signed-in users may see eligible order updates; live courier GPS is not currently available\n\u2022 Call us at (718) 328-2833. we can look it up immediately\n\u2022 We'll text or call you when your order is ready for pickup or out for delivery\n\nIs there a specific order you'd like me to help you check on?",
  transfer_out:
    "While we'd be sad to see you go, we absolutely can transfer your prescriptions to another pharmacy. Just let us know:\n\n\u2022 The name and address of the pharmacy you'd like to transfer to\n\u2022 Which prescriptions you'd like transferred\n\nYou can call us at (718) 328-2833 to get the transfer started. If there's anything we can do better to keep you in the Concordia family, we'd love to hear about it.\n\nIs there something we can help resolve?",
  after_hours:
    "Our regular hours are Monday through Friday, 9 AM to 7 PM, and Saturdays 10 AM to 4 PM. We're closed on Sundays.\n\nIf you need us outside those hours, you can leave a voicemail at (718) 328-2833 and we'll call you back first thing the next business day. That's a promise.\n\nFor medical emergencies, always call 911. For urgent prescription needs, our voicemail system will guide you to an emergency contact.\n\nIs there anything else I can help with?",
  parking:
    "You can look for street parking near 898 East Tremont Ave, but I can't confirm an available space or a dedicated lot. If parking is difficult, call (718) 328-2833 to ask about delivery options.",
  about:
    "Concordia Pharmacy has been proudly serving New York communities since around 2015. We're an independent, family-oriented pharmacy based in the Bronx, and we believe pharmacy care should feel personal.\n\nWhat makes us different:\n\u2022 Delivery requests reviewed and confirmed by pharmacy staff\n\u2022 Blister pack medication organization\n\u2022 Specialty medication expertise\n\u2022 Automatic refill management\n\u2022 A dedicated care team that knows your name\n\nWe're not a chain. We're your neighbors. And we treat every patient like family. What would you like to know more about?",
  pharmacist:
    "Our pharmacy team includes licensed, experienced pharmacists who are passionate about patient care. They're available during store hours to answer your questions about medications, interactions, side effects, or anything health-related.\n\nYou can speak with a pharmacist by calling (718) 328-2833 or visiting us at 898 East Tremont Ave, Bronx, NY 10460.\n\nWould you like to connect with our pharmacist?",
  languages:
    "We can help in English or Spanish. For another language, please call (718) 328-2833 so staff can discuss what assistance is available.",
  website:
    "You can find everything about Concordia at concordianyc.com, including our services, specialty medication database, OTC shop, and more.\n\nFor the full patient experience, including prescription tracking and delivery status updates, loyalty rewards, and messaging your care team, download the ConcordiaCare app.\n\nIs there something specific you're looking for on our site?",
  wellness_pack:
    "Welcome to the Concordia family! New patients receive our Wellness Welcome Pack, which includes:\n\n\u2022 500 loyalty points to use toward future purchases\n\u2022 A complimentary vitamin pack\n\u2022 Eligibility to request delivery, subject to staff confirmation\n\u2022 Access to the ConcordiaCare app\n\nPoints are activated once your first prescription is filled with us. It's our way of saying thank you for trusting us with your care. Would you like to get started?",
  medication_storage:
    "How you store your medication matters. here are the general rules:\n\n\u2022 Most medications: store at room temperature (59\u201377\u00b0F), away from heat, humidity, and direct sunlight\n\u2022 Bathroom medicine cabinets are actually a bad choice. too much humidity\n\u2022 Insulin, some eye drops, and some liquids: must be refrigerated. check your label\n\u2022 Never freeze medications unless the label specifically says to\n\u2022 Keep all medications out of reach of children\n\nNot sure about a specific medication? Call us at (718) 328-2833. our pharmacist can give you specific guidance.",
  pill_identifier:
    "For your safety, never take an unidentified pill or medication.\n\nHere's how to identify it:\n\n\u2022 Call us at (718) 328-2833. our pharmacist can often identify pills by their imprint, shape, and color\n\u2022 Use the Drugs.com Pill Identifier at drugs.com/pill_identification.html. it's free and very accurate\n\u2022 If you think someone may have taken an unknown substance, call Poison Control at 1-800-222-1222\n\nWould you like to speak with one of our pharmacists directly?",
  hipaa_privacy:
    "Your privacy and the security of your health information are our highest priorities.\n\nAs a HIPAA-covered entity, we are legally required to protect your Protected Health Information (PHI). Here's what that means for you:\n\n\u2022 We never sell your information to third parties\n\u2022 We only share your information with your direct care team or as permitted by law\n\u2022 You have the right to access, amend, and restrict use of your records\n\u2022 Our full Notice of Privacy Practices is available in-store or on our website\n\nQuestions about your privacy rights? Call us at (718) 328-2833 or ask at the pharmacy counter.",
  lost_rx:
    "If a non-controlled medication was lost or stolen, call Concordia Pharmacy at (718) 328-2833 so the pharmacy team can review the prescription and explain the available next steps. Concordia does not stock or dispense controlled substances.",
  formulary:
    "Whether your medication is covered and at what cost depends on your specific insurance plan's formulary. the list of covered drugs.\n\nHere's what we do for every patient:\n\u2022 We verify your insurance and run the claim before you pay anything\n\u2022 We check if a generic or preferred alternative is available at a lower tier\n\u2022 If your drug isn't covered, we help you file a formulary exception or prior authorization\n\u2022 We also check manufacturer coupons and patient assistance programs\n\nWant us to check your specific medication and plan? Call us at (718) 328-2833 with your insurance card and medication name.",
  weekend_delivery:
    "Here's our delivery schedule:\n\n\u2022 Monday\u2013Friday: Delivery timing confirmed by staff for each request\n\u2022 Saturday: Delivery may be available; staff confirm timing\n\u2022 Sunday: No delivery. we're closed Sundays\n\u2022 Holidays: Delivery may be limited. call us to confirm\n\nDelivery availability and any applicable fees are confirmed by staff.\n\nNeed something delivered this weekend? Call us at (718) 328-2833 and we'll make sure you're taken care of.",
  doctor_referral:
    "We'd love to help! Through the ConcordiaCare app, our Care Navigator feature can match you with a local doctor based on your specialty needs, insurance, language preference, and location.\n\nWe also work closely with a network of primary care physicians and specialists throughout the Bronx and NYC area. so if you're looking for a particular type of doctor, let us know and we'll point you in the right direction.\n\nCall us at (718) 328-2833 and ask about our Care Navigator service, or download the ConcordiaCare app to get started.",
  proxy_pickup:
    "Someone else may pick up an eligible non-controlled prescription when permitted. They should bring photo ID and the patient's name and date of birth. Call (718) 328-2833 before pickup if you have questions. Concordia does not stock or dispense controlled substances.",
  smoking:
    "Quitting smoking is one of the best things you can do for your health. and we're here to help every step of the way. We carry:\n\n\u2022 Nicotine patches (multiple strengths)\n\u2022 Nicotine gum and lozenges\n\u2022 Nicorette and store-brand alternatives\n\nFor prescription cessation support like Chantix (varenicline) or Wellbutrin (bupropion), your doctor can send us the prescription and we'll fill it quickly.\n\nOur pharmacist can also help you pick the right approach for your situation. Would you like to speak with them?",
  generic_rx:
    "Great question. generics contain the same active ingredient, dosage, and strength as brand-name medications, and they're just as effective. They can save you a significant amount of money.\n\nWe always check for generic alternatives when filling your prescriptions. If your doctor specifies brand-name only, we'll let you know and explore other ways to reduce your cost.\n\nCurious about a specific medication? Call us at (718) 328-2833 and we can tell you right away whether a generic is available and how much it would cost. Anything else I can help with?",
  sms_updates:
    "Yes! We send text message updates for:\n\n\u2022 Prescription ready for pickup\n\u2022 Delivery dispatched. with delivery updates when available\n\u2022 Refill reminders so you never run low\n\u2022 Appointment confirmations\n\nYou're automatically enrolled for texts when you sign up as a patient. If you're already a patient and not getting them, call us at (718) 328-2833 and we'll make sure your number is on file.\n\nIs there anything else I can help with?",
  vaccine_records:
    "For your vaccination records, here are your best options:\n\n\u2022 New York State immunization records. request them through the NYSIIS portal at health.ny.gov\n\u2022 Vaccines received at our pharmacy. call us at (718) 328-2833 and we can provide documentation of any shots we administered\n\u2022 Full vaccination history. your primary care doctor's office is the most complete source\n\nIs there a specific vaccine record you need? I can point you in the right direction.",
  rx_history:
    "Your prescription history is available in a few ways:\n\n\u2022 ConcordiaCare app. your full medication history and refill records are right there\n\u2022 Call us at (718) 328-2833. we can look up your history and prepare a printed record\n\u2022 Heading to a doctor's visit? Just let us know and we'll put together a complete medication list for you\n\nIs there anything specific you need?",
  accessibility:
    "Great news. our pharmacy at 898 East Tremont Ave is wheelchair accessible with a step-free entrance and easy access throughout. We want every patient to feel comfortable visiting us.\n\nIf getting here is ever difficult, you can request delivery where available; pharmacy staff confirm service and timing. Many of our patients appreciate the convenience.\n\nIs there anything else I can help with, or would you like to submit a delivery request?",
  contact_info:
    "Here's how to reach us:\n\n\u2022 Phone: (718) 328-2833\n\u2022 Address: 898 East Tremont Ave, Bronx, NY 10460\n\u2022 Hours: Monday\u2013Friday 9 AM\u20137 PM | Saturday 10 AM\u20134 PM\n\u2022 Website: concordianyc.com\n\nYou can also message us anytime through the ConcordiaCare app and we'll respond during business hours. Is there something specific we can help you with?",
  payment_methods:
    "Payment options depend on the order. Available online payment methods appear at checkout; for in-store payment or insurance copays, call (718) 328-2833 to confirm with pharmacy staff. Don't share card or insurance details in public chat.",
  lab_work:
    "We're a full-service pharmacy, but we don't perform lab draws or diagnostic testing. For blood work or lab tests, your doctor's office or a local LabCorp or Quest Diagnostics location would be the best option.\n\nOnce your results come in and your doctor adjusts your medications, we're here to fill any new or updated prescriptions quickly. often same-day. Can I help with anything else?",
  needles:
    "Yes, we carry insulin syringes, pen needles, and related supplies. In New York, syringes may be purchased without a prescription at a licensed pharmacy. we have you covered.\n\nWe also carry sharps containers for safe disposal. If you need to dispose of used sharps, bring them in and we'll handle it properly at no charge.\n\nCall us at (718) 328-2833 or stop by at 898 East Tremont Ave. Is there anything else I can help with?",
  general:
    "Tell me what you're looking for. I can help you find a shop product, get help with a prescription, start a secure transfer, schedule a flu shot, or call the pharmacy. For questions I can't answer safely here, I can connect you with staff. Please don't post private medical or payment details in this chat.",
};

const INTENT_RESPONSE_VARIANTS: Partial<Record<string, string[]>> = {
  general: [
    "I want to make sure I help you with exactly the right thing! Could you share a bit more about what you're looking for?",
    "I'm here and ready to help! What's on your mind. prescriptions, delivery, OTC products, or something else?",
    "Happy to help! Just let me know a little more about what you need and I'll point you in the right direction.",
    "I didn't quite catch that. no worries! Tell me what you're looking for and I'll get you sorted.",
  ],
  hours: [
    "We're open Monday to Friday, 9 AM to 7 PM, and Saturdays, 10 AM to 4 PM. Closed Sundays.\n\nNeed us outside those hours? Leave a voicemail at (718) 328-2833 and we'll call you back first thing. That's a promise.",
    "Our pharmacy hours are Monday through Friday, 9 AM to 7 PM, and Saturdays from 10 AM to 4 PM. We're closed on Sundays.\n\nFor after-hours urgent needs, call (718) 328-2833 and follow the prompts.",
    "Great question! We're here for you Monday to Friday, 9 AM to 7 PM, and Saturdays, 10 AM to 4 PM.\n\nIf you ever need us after hours, leave us a message at (718) 328-2833. We always call back.",
  ],
  refill: [
    "Need a refill? Easy! Here's how:\n\n• Through the ConcordiaCare app. tap 'Request Refill' anytime\n• Call us at (718) 328-2833 and we'll take care of it\n• We can also set you up on auto-refill so you never run low again\n\nWant us to get that set up for you?",
    "Refills are one of our specialties! You can request yours through the ConcordiaCare app, by calling (718) 328-2833, or by simply telling me your medication name and we'll pass the request to our team.\n\nWould you like to set up automatic refills so this never happens again?",
    "Running low? We'll get that sorted right away. You can call us at (718) 328-2833 or use the ConcordiaCare app.\n\nWant me to connect you with our care team to get the refill started. and maybe set up auto-refills while we're at it?",
  ],
  order_status: [
    "You can check your order status in a few ways:\n\n• ConcordiaCare app. Signed-in users may see eligible order updates\n• Call us at (718) 328-2833. we can look it up instantly\n• We'll text you when your order is out for delivery\n\nIs there a specific order you need help tracking down?",
    "The fastest way to track your order is the ConcordiaCare app. Signed-in users may see eligible order updates. You can also call us at (718) 328-2833 and we'll look it up on the spot.\n\nIs there something specific going on with your delivery?",
    "Happy to help you track that down! Check the ConcordiaCare app for eligible order updates, or give us a call at (718) 328-2833. We can also text you an update right now if you share your name.\n\nAnything specific I can check for you?",
  ],
  cost: [
    "Great question! Here's what affects your cost:\n\n• With insurance: you pay your copay. we verify coverage before you pay anything\n• Without insurance: we offer competitive cash pricing, GoodRx, and patient assistance programs\n• OTC products: prices are listed in our online shop\n\nWant us to look up the cost for a specific medication?",
    "We always look for the lowest price on your behalf. With insurance, you pay your copay. Without insurance, we check GoodRx, manufacturer coupons, and assistance programs.\n\nFor a specific medication or order, call us at (718) 328-2833 and we'll give you an exact number.",
    "Pricing depends on your insurance and the specific medication. We run every claim to find you the best price. and if it's still too high, we look for assistance programs.\n\nCall us at (718) 328-2833 with your medication name and insurance card and we'll give you a quote in minutes.",
  ],
  transfer: [
    "Switching to Concordia is easy and completely free! Here's how:\n\n• Tell us your current pharmacy name and your medications\n• We contact them directly and handle the whole transfer\n• Most transfers complete within 24 hours\n\nYou can request delivery where available. Want to get started?",
    "We'd love to have you! Transferring your prescriptions is simple. just give us your current pharmacy's name, your medication list, and your date of birth. We do the rest.\n\nCall us at (718) 328-2833 or share your info below and someone from our team will handle it personally.",
    "Transfers are one of the things we do best. Just let us know where you're currently filling your prescriptions and which medications to transfer. we'll take care of everything, usually within a day.\n\nWould you like to get started?",
  ],
  delivery_cost: [
    "Pharmacy staff confirm delivery availability and any applicable fee before you agree to a request. Call (718) 328-2833 to ask what delivery would cost for you.",
    "Delivery availability and any applicable fees are confirmed by pharmacy staff for each request. Your medications can be delivered where available with staff-confirmed delivery timing.\n\nWould you like to get set up?",
    "Pharmacy staff confirm delivery availability and any applicable fees for each request. Live courier GPS is not currently available; pharmacy staff confirm delivery timing.\n\nWant to switch to delivery?",
  ],
};

function pickVariant(intent: string): string | null {
  const variants = INTENT_RESPONSE_VARIANTS[intent];
  if (!variants || variants.length === 0) return null;
  return variants[Math.floor(Math.random() * variants.length)];
}

function getIntentResponse(intent: string): string {
  return pickVariant(intent) ?? INTENT_RESPONSES[intent] ?? INTENT_RESPONSES["general"];
}

const SPANISH_EMERGENCY_RESPONSE =
  "Si usted o alguien con usted tiene una emergencia médica, llame al 911 inmediatamente. No espere.\n\nCuando esté a salvo, puede llamar a Concordia Pharmacy al (718) 328-2833 para recibir ayuda con preguntas o coordinación de medicamentos.";

const SPANISH_INTENT_RESPONSES: Record<string, string> = {
  spanish: "Claro. puedo ayudarle en español. ¿Necesita ayuda con una receta, entrega, seguro, productos sin receta o hablar con el farmacéutico?",
  unreadable: "No entendí ese mensaje. Intente escribirlo de otra manera o dígame si necesita ayuda con una receta, entrega, seguro o producto sin receta.",
  services: "Ofrecemos recetas, transferencias, resurtidos, entrega, vacunas, empaques organizados, productos sin receta y apoyo del farmacéutico. ¿Qué servicio necesita?",
  signup: "Puede registrarse como paciente con la opción “Ser paciente”. El registro de la aplicación es independiente de esta conversación.",
  controlled_substance: "Concordia Pharmacy no almacena ni dispensa sustancias controladas. Comuníquese con su médico u otra farmacia autorizada. Puedo ayudarle con los servicios no controlados de Concordia.",
  refill: "Podemos ayudar con un resurtido por la aplicación ConcordiaCare o por teléfono al (718) 328-2833. No comparta números de receta aquí.",
  new_rx: "Su médico puede enviar una receta nueva directamente a la farmacia. Llame al (718) 328-2833 para confirmar el proceso sin compartir datos clínicos aquí.",
  transfer: "Nuestro equipo puede coordinar la transferencia de sus recetas. Llame al (718) 328-2833 o use la opción de transferencia para comenzar de forma segura.",
  tracking: "Las personas que hayan iniciado sesión pueden consultar actualizaciones de pedidos elegibles en ConcordiaCare. El GPS en vivo del repartidor no está disponible actualmente. También puede llamar al (718) 328-2833.",
  order_status: "Puede revisar si su pedido está listo en ConcordiaCare o llamar al (718) 328-2833. No comparta aquí su número de receta.",
  delivery_cost: "Puede solicitar una entrega donde esté disponible. El personal confirmará la zona, cualquier cargo aplicable y el horario de cada solicitud.",
  delivery_zones: "Concordia ofrece entrega local para recetas y pedidos elegibles. Escriba la dirección solamente en el paso seguro de entrega; el personal debe confirmar la dirección, la zona, el inventario y el horario.",
  hours: "Abrimos de lunes a viernes de 9 AM a 7 PM y los sábados de 10 AM a 4 PM. Cerramos los domingos.",
  location: "Estamos en 898 East Tremont Ave, Bronx, NY 10460. También ofrecemos entrega local.",
  contact_info: "Puede llamar a Concordia Pharmacy al (718) 328-2833. Estamos en 898 East Tremont Ave, Bronx, NY 10460.",
  insurance_accepted: "Trabajamos con muchos planes. Para confirmar su plan específico de forma segura, llame al (718) 328-2833; no comparta su identificación del seguro aquí.",
  prior_auth: "Nuestro equipo puede ayudar a coordinar una autorización previa con su médico y seguro. Llame al (718) 328-2833 para ayuda específica.",
  no_insurance: "Podemos revisar precios en efectivo, genéricos y descuentos disponibles. Llame al (718) 328-2833 para una cotización específica.",
  otc_pain: "Si está buscando específicamente una opción sin receta para dolor, puede explorar nuestra categoría de dolor. Lea la etiqueta y consulte al farmacéutico para saber qué es apropiado para usted.",
  otc_cold: "Si pidió específicamente una opción sin receta, puede explorar productos para tos y resfriado. Lea la etiqueta y consulte al farmacéutico, especialmente si toma otros medicamentos.",
  otc_allergy: "Si pidió específicamente una opción sin receta, puede explorar productos para alergia. Lea la etiqueta y consulte al farmacéutico para elegir de forma segura.",
  otc_wellness: "Puede explorar vitaminas y suplementos sin receta. Consulte al farmacéutico antes de combinarlos con medicamentos.",
  flu_shot: "Ofrecemos vacunas en la farmacia. Puede programar una cita o llamar al (718) 328-2833.",
  blister_pack: "Ofrecemos empaques organizados por día y hora para apoyar la adherencia. Llame al (718) 328-2833 para conocer el proceso.",
  blister_explain: "Los empaques organizan las dosis por día y hora. El equipo de farmacia confirma el régimen antes de prepararlos.",
  caregiver_worry: "Podemos apoyar a cuidadores con entrega, coordinación y empaques organizados. Para información específica de otra persona, llame a la farmacia y complete la autorización correspondiente.",
  ltc: "Apoyamos centros de atención a largo plazo. Llame al (718) 328-2833 para hablar sobre servicios para su centro.",
  hipaa_privacy: "Protegemos la información médica y no pedimos identificadores sensibles en el chat público. Para ayuda específica de una cuenta, llame a la farmacia.",
  update_profile: "Los cambios de perfil deben hacerse de forma segura en ConcordiaCare o llamando al (718) 328-2833. No escriba su teléfono, dirección ni otros datos aquí.",
  speak_pharmacist: "Puede hablar con nuestro farmacéutico llamando al (718) 328-2833. No comparta detalles clínicos sensibles en el chat público.",
  cancel_order: "Para cancelar una entrega o pedido de forma segura, llame al (718) 328-2833. No comparta números de receta aquí.",
  missed_dose: "No cambie ni duplique una dosis basándose en el chat. Consulte la etiqueta y llame al farmacéutico o a su profesional clínico para instrucciones específicas.",
  drug_interaction: "No puedo determinar en el chat si una combinación es segura. Consulte al farmacéutico al (718) 328-2833 antes de combinar medicamentos.",
  vaccine_records: "Para registros de vacunas aplicadas en Concordia, llame al (718) 328-2833. Su médico o el registro estatal puede tener el historial completo.",
  clinical_information: "Entiendo que menciona un síntoma, diagnóstico o término clínico. No puedo diagnosticar ni recomendar tratamiento en el chat. Si desea específicamente productos sin receta, pídame una categoría; para saber qué es apropiado para usted, consulte al farmacéutico o a su profesional clínico.",
  thanks: "Con gusto. ¿Necesita ayuda con algo más?",
  general: "Quiero ayudarle correctamente. ¿Puede decirme si necesita ayuda con una receta, entrega, seguro, productos sin receta o el farmacéutico?",
};

function getLocalizedIntentResponse(intent: string, text: string, language?: ConversationLanguage): string {
  const turnLanguage = language ?? detectConversationLanguage(text);
  if (intent === "emergency" && turnLanguage === "es") {
    return SPANISH_EMERGENCY_RESPONSE;
  }
  if (turnLanguage === "mixed") {
    const english = getIntentResponse(intent);
    const spanish = intent === "emergency"
      ? SPANISH_EMERGENCY_RESPONSE
      : (SPANISH_INTENT_RESPONSES[intent] ?? SPANISH_INTENT_RESPONSES.spanish);
    return `${english}\n\n**Español:**\n${spanish}`;
  }
  if (turnLanguage === "es") {
    return SPANISH_INTENT_RESPONSES[intent] ?? SPANISH_INTENT_RESPONSES.spanish;
  }
  if (intent === "otc_pain") {
    const symptom = extractOtcPainSymptom(text);
    return symptom
      ? `I hear you—${symptom} can make it really tough to get around.\n\nWhile I can't diagnose the cause or prescribe treatment, we carry over-the-counter pain relief options such as topical creams and patches, oral pain-relief categories, muscle rubs, and joint support products.\n\nWould you like to browse the Pain & Joints section, or send this question to our pharmacy staff so a pharmacist can help you choose safely?`
      : getIntentResponse(intent);
  }
  return getIntentResponse(intent);
}

function localizedPair(language: ConversationLanguage, english: string, spanish: string): string {
  if (language === "es") return spanish;
  if (language === "mixed") return `${english}\n\n**Español:**\n${spanish}`;
  return english;
}

const NON_MEMBER_PRESCRIPTION_INTENTS = new Set([
  "refill",
  "new_rx",
  "transfer",
  "medication_clarification",
]);

function getNonMemberPrescriptionButtons(language: ConversationLanguage) {
  const spanish = language === "es";
  const mixed = language === "mixed";
  return [
    {
      label: spanish ? "Transferir recetas a Concordia" : mixed ? "Transfer Prescriptions / Transferir recetas" : "Transfer Prescriptions to Concordia",
      value: "shop:/#transfer-section",
      icon: Repeat,
    },
    {
      label: spanish ? "Llamar a Concordia" : mixed ? "Call Concordia / Llamar" : "Call Concordia",
      value: "action:call",
      icon: Phone,
    },
  ];
}

function getNonMemberPrescriptionMessage(language: ConversationLanguage): string {
  return localizedPair(
    language,
    "I don't have you recognized as a Concordia member in this chat. We can help transfer your prescriptions from your current pharmacy to Concordia, or you can call us at (718) 328-2833.",
    "No aparece como miembro de Concordia en este chat. Podemos ayudarle a transferir sus recetas desde su farmacia actual a Concordia, o puede llamarnos al (718) 328-2833.",
  );
}

function getGeneralFallbackButtons(role: UserRole): { label: string; value: string; icon: React.ComponentType<any> }[] {
  if (role === "caregiver") {
    return [
      { label: "Find a shop product", value: "shop:/shop", icon: ShoppingBag },
      { label: "Medication help", value: "action:medication-help", icon: Pill },
      { label: "Set up delivery for them", value: "I want to set up delivery for my loved one", icon: Truck },
      { label: "Start secure transfer", value: "shop:/?transfer=form#transfer-section", icon: Repeat },
      { label: "Schedule flu shot", value: "shop:/schedule-flu-shot", icon: Clock },
      { label: "Call the pharmacy", value: "action:call", icon: Phone },
    ];
  }
  if (role === "professional") {
    return [
      { label: "Find a shop product", value: "shop:/shop", icon: ShoppingBag },
      { label: "Medication help", value: "action:medication-help", icon: Pill },
      { label: "Start secure transfer", value: "shop:/?transfer=form#transfer-section", icon: Repeat },
      { label: "Schedule flu shot", value: "shop:/schedule-flu-shot", icon: Clock },
      { label: "LTC partnership", value: "I want to learn about long-term care partnership", icon: Building2 },
      { label: "Call the pharmacy", value: "action:call", icon: Phone },
    ];
  }
  return [
    { label: "Find a shop product", value: "shop:/shop", icon: ShoppingBag },
    { label: "Medication help", value: "action:medication-help", icon: Pill },
    { label: "Start secure transfer", value: "shop:/?transfer=form#transfer-section", icon: Repeat },
    { label: "Schedule flu shot", value: "shop:/schedule-flu-shot", icon: Clock },
    { label: "Call the pharmacy", value: "action:call", icon: Phone },
    { label: "Send this question to staff", value: "action:callback", icon: PhoneCall },
  ];
}

const SAFETY_NET_MESSAGE = "It was great chatting with you! I've shared our notes with the team. If you think of anything else, just type it here. I'm not going anywhere.\n\nWould you like me to send our contact info to your phone so you have it? You can always reach us at (718) 328-2833.";

const STALL_TIMEOUT_MS = 120000;

function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isStoreOpen(): boolean {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const totalMinutes = hour * 60 + minute;

  if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday)) {
    return totalMinutes >= 9 * 60 && totalMinutes < 19 * 60;
  }
  if (weekday === "Sat") {
    return totalMinutes >= 10 * 60 && totalMinutes < 16 * 60;
  }
  return false;
}

function fireChatEvent(eventType: string, intent?: string) {
  const pagePath = window.location.pathname;
  fetch("/api/chat/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, intent, pagePath }),
  }).catch(() => {});
}

export function ChatWidget() {
  const [location, setLocation] = useLocation();
  // Drafts are intentionally not hydrated into component state. A
  // sessionStorage draft has no trustworthy owner before auth hydration, so
  // restoring it could expose one person's context to the next visitor.
  const [savedDraft] = useState<ConciergeDraft | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [step, setStep] = useState<ConversationStep>(savedDraft?.step ?? "greeting");
  const [userRole, setUserRole] = useState<UserRole>(savedDraft?.userRole ?? null);
  const [userChallenge, setUserChallenge] = useState("");
  const [detectedIntent, setDetectedIntent] = useState("");
  const [pendingClarification, setPendingClarification] = useState<PendingClarification | null>(null);
  const [detectedSentiment, setDetectedSentiment] = useState("neutral");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryAddressSelection, setDeliveryAddressSelection] = useState<VerifiedAddressSelection | null>(null);
  const [apartmentUnit, setApartmentUnit] = useState("");
  const [pickupWindow, setPickupWindow] = useState("");
  const [requestedItems, setRequestedItems] = useState<Array<{ productId: string; name: string }>>([]);
  const [pendingRequestedItems, setPendingRequestedItems] = useState<string[]>([]);
  const [pendingFluShotRequest, setPendingFluShotRequest] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [chatFirstName, setChatFirstName] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [callRequested, setCallRequested] = useState(savedDraft?.callRequested ?? false);
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup" | null>(savedDraft?.deliveryType ?? null);
  const idempotencyKeyRef = useRef<string>(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `concierge-${Date.now()}-${Math.random()}`);
  const [gibberishCount, setGibberishCount] = useState(0);
  const [safetyNetShown, setSafetyNetShown] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [addedToCartIds, setAddedToCartIds] = useState<Set<string>>(new Set());
  const [restockTarget, setRestockTarget] = useState<{ category?: string; productId?: string; label: string } | null>(null);
  const [restockEmail, setRestockEmail] = useState("");
  const [restockPhone, setRestockPhone] = useState("");
  const [restockName, setRestockName] = useState("");
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const storeOpen = isStoreOpen();
  const {
    isAuthenticated,
    user,
    patientAuthReady,
    isCaregiver,
    actingPatientId,
    attendantSession,
  } = useAuth();
  const [identity, setIdentity] = useState<{ recognized: boolean; firstName?: string; source: "clerk" | "directory" | null } | null>(null);
  const isKnownMember = isAuthenticated || identity?.recognized === true;
  const [identityPanel, setIdentityPanel] = useState<"menu" | "form" | "otp" | null>(null);
  const [identityLanguage, setIdentityLanguage] = useState<"en" | "es">("en");
  const [conversationLanguage, setConversationLanguage] = useState<ConversationLanguage>("en");
  const [identityFirstName, setIdentityFirstName] = useState("");
  const [identityLastName, setIdentityLastName] = useState("");
  const [identityDob, setIdentityDob] = useState("");
  const [identityCode, setIdentityCode] = useState("");
  const [identityChallengeId, setIdentityChallengeId] = useState("");
  const [identityMessage, setIdentityMessage] = useState("");
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityError, setIdentityError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [resendNow, setResendNow] = useState(() => Date.now());
  const guestCart = useGuestCart();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartTimerRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // Every close/reset/context transition advances this token. Delayed UI work
  // must belong to the conversation that scheduled it.
  const conversationGenerationRef = useRef(0);
  const contextRef = useRef<string | null>(null);
  const skipDraftSaveRef = useRef(false);
  const identityInitializedRef = useRef(false);
  const identityRequestRef = useRef<{ firstName: string; lastName: string; dateOfBirth: string } | null>(null);

  const cancelConversationTimers = useCallback(() => {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    stallTimerRef.current = null;
    promptTimerRef.current = null;
    typingTimerRef.current = null;
    cartTimerRefs.current.forEach((timer) => clearTimeout(timer));
    cartTimerRefs.current.clear();
  }, []);

  useEffect(() => {
    if (!resendAt || resendAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setResendNow(now);
      if (now >= resendAt) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  const selectedPatient = isCaregiver
    ? attendantSession?.patients?.find((patient) => patient.patientId === actingPatientId)
    : null;
  const signedInPatientName = isCaregiver
    ? selectedPatient?.firstName || ""
    : (user as { firstName?: string } | null)?.firstName || "";

  const clearIdentityFields = useCallback(() => {
    setIdentityFirstName("");
    setIdentityLastName("");
    setIdentityDob("");
    setIdentityCode("");
    setIdentityChallengeId("");
    setIdentityMessage("");
    setIdentityError("");
    setResendAt(0);
  }, []);

  const clearConversationState = useCallback(() => {
    conversationGenerationRef.current += 1;
    cancelConversationTimers();
    identityRequestRef.current = null;
    identityInitializedRef.current = false;
    setMessages([]);
    setStep("greeting");
    setUserRole(null);
    setUserChallenge("");
    setDetectedIntent("");
    setPendingClarification(null);
    setDetectedSentiment("neutral");
    setDeliveryAddress("");
    setDeliveryAddressSelection(null);
    setApartmentUnit("");
    setPickupWindow("");
    setRequestedItems([]);
    setPendingRequestedItems([]);
    setPendingFluShotRequest("");
    setContactPhone("");
    setContactEmail("");
    setContactName("");
    setChatFirstName(null);
    setFreeText("");
    setIsSubmitting(false);
    setCallRequested(false);
    setDeliveryType(null);
    idempotencyKeyRef.current = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `concierge-${Date.now()}-${Math.random()}`;
    setGibberishCount(0);
    setSafetyNetShown(false);
    setIsTyping(false);
    setUnreadCount(0);
    setAddedToCartIds(new Set());
    setRestockTarget(null);
    setRestockEmail("");
    setRestockPhone("");
    setRestockName("");
    setRestockSubmitting(false);
    setIdentity(null);
    setIdentityPanel(null);
    clearIdentityFields();
  }, [cancelConversationTimers, clearIdentityFields]);

  // A Clerk/local-user transition (including caregiver patient switching) is a
  // hard privacy boundary. Never carry a prior person's draft or transcript
  // into the new context.
  const userContextKey = isAuthenticated
    ? `${isCaregiver ? "caregiver" : "patient"}:${(isCaregiver ? actingPatientId : (user as { id?: string } | null)?.id) || "unknown"}`
    : "guest";
  useEffect(() => {
    if (contextRef.current === null) {
      contextRef.current = userContextKey;
      return;
    }
    if (contextRef.current === userContextKey) return;
    contextRef.current = userContextKey;
    skipDraftSaveRef.current = true;
    sessionStorage.removeItem(CONCIERGE_DRAFT_KEY);
    clearConversationState();
    void apiRequest("DELETE", "/api/chat/identity").catch(() => {});
  }, [userContextKey, clearConversationState]);

  const fetchIdentity = useCallback(async () => {
    try {
      const response = await apiRequest("GET", "/api/chat/identity");
      const result = await response.json();
      setIdentity(result);
      return result;
    } catch {
      setIdentity({ recognized: false, source: null });
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen || identityInitializedRef.current || messages.length > 0 || !identity?.recognized || !identity.firstName) return;
    identityInitializedRef.current = true;
    setUserRole("patient");
    addMessage("assistant", `Welcome back, ${identity.firstName}. How can we help with your pharmacy needs today?`, [
      { label: "Let's chat here", value: "chat", icon: MessageCircle },
      { label: "Request a call", value: "call", icon: PhoneCall },
    ]);
  }, [isOpen, identity, messages.length]);

  useEffect(() => {
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    const draft: ConciergeDraft = {
      version: CONCIERGE_DRAFT_VERSION, expiresAt: Date.now() + CONCIERGE_DRAFT_TTL_MS,
      step: resumableStep(step, userRole !== null),
      userRole,
      deliveryType,
      callRequested,
    };
    sessionStorage.setItem(CONCIERGE_DRAFT_KEY, JSON.stringify(draft));
  }, [step, userRole, deliveryType, callRequested]);

  const addCartConfirmMessage = useCallback(() => {
    const generation = conversationGenerationRef.current;
    setIsTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (generation !== conversationGenerationRef.current) return;
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          role: "assistant" as const,
          content: "Added to cart! You can keep browsing or head to your cart whenever you're ready.",
        },
      ]);
      setUnreadCount((n) => n + 1);
    }, 650);
  }, []);

  const markAddedToCart = useCallback((productId: string) => {
    const generation = conversationGenerationRef.current;
    setAddedToCartIds((prev) => new Set(prev).add(productId));
    const timer = setTimeout(() => {
      cartTimerRefs.current.delete(timer);
      if (generation !== conversationGenerationRef.current) return;
      setAddedToCartIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }, 3000);
    cartTimerRefs.current.add(timer);
  }, []);

  const addToCartMutation = useMutation({
    mutationFn: async (productId: string) => {
      await apiRequest("POST", "/api/cart", { productId, quantity: 1 });
    },
    onSuccess: (_, productId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      markAddedToCart(productId);
      addCartConfirmMessage();
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          role: "assistant" as const,
          content: "Sorry, I couldn't add that to your cart right now. Please try again or visit the shop page.",
        },
      ]);
    },
  });

  const handleChatAddToCart = useCallback((productId: string) => {
    if (isAuthenticated) {
      addToCartMutation.mutate(productId);
    } else {
      guestCart.addItem(productId, 1);
      markAddedToCart(productId);
      addCartConfirmMessage();
    }
  }, [isAuthenticated, addToCartMutation, guestCart, markAddedToCart, addCartConfirmMessage]);

  const isAdminRoute = location.startsWith("/admin");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch live product catalog once on mount. populates module-level
  // _liveProducts so detectIntent can match against real stock names.
  useEffect(() => {
    if (_liveProducts.length > 0) return;
    fetch("/api/products/website")
      .then(r => r.ok ? r.json() : [])
      .then((products: ProductCacheItem[]) => {
        _liveProducts = products.filter(p => !p.requiresPrescription);
        _liveProductsLastFetched = Date.now();
      })
      .catch(() => {});
  }, []);

  // Re-fetch product catalog when the widget opens, throttled to once per 5 minutes,
  // so the chatbot reflects stock changes without requiring a page reload.
  useEffect(() => {
    if (!isOpen) return;
    if (Date.now() - _liveProductsLastFetched < PRODUCT_CACHE_TTL_MS) return;
    fetch("/api/products/website")
      .then(r => r.ok ? r.json() : [])
      .then((products: ProductCacheItem[]) => {
        _liveProducts = products.filter(p => !p.requiresPrescription);
        _liveProductsLastFetched = Date.now();
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    const el = scrollAreaRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, step]);

  const cancelPromptTimer = useCallback(() => {
    if (promptTimerRef.current) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
  }, []);

  const resetStallTimer = useCallback(() => {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    cancelPromptTimer();
    stallTimerRef.current = setTimeout(() => {
      if (step !== "submitted" && step !== "greeting" && !safetyNetShown) {
        setMessages((prev) => [...prev, { id: generateId(), role: "assistant", content: SAFETY_NET_MESSAGE }]);
        setSafetyNetShown(true);
      }
    }, STALL_TIMEOUT_MS);
  }, [step, safetyNetShown, cancelPromptTimer]);

  useEffect(() => {
    if (isOpen && step !== "greeting" && step !== "submitted") {
      resetStallTimer();
    }
    return () => {
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    };
  }, [isOpen, step, messages.length, resetStallTimer]);

  const addMessage = useCallback(
    (role: "assistant" | "user", content: string, buttons?: ChatMessage["buttons"], productCards?: ChatMessage["productCards"]) => {
      if (role === "assistant") {
        const generation = conversationGenerationRef.current;
        setIsTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          if (generation !== conversationGenerationRef.current) return;
          setIsTyping(false);
          setMessages((prev) => [...prev, { id: generateId(), role, content, buttons, productCards }]);
          setUnreadCount((n) => n + 1);
        }, 650);
      } else {
        setMessages((prev) => [...prev, { id: generateId(), role, content, buttons }]);
      }
    },
    []
  );

  const initializeConversation = async () => {
    const generation = conversationGenerationRef.current;
    if (identityInitializedRef.current || messages.length > 0) return;
    if (step !== "greeting") {
      identityInitializedRef.current = true;
      addMessage("assistant", "Welcome back. I saved your place without storing your message history or personal health details. You can continue below or start over.");
      return;
    }
    // Hydrated app identity wins over the chat-only directory identity.
    if (patientAuthReady && isAuthenticated && signedInPatientName) {
      identityInitializedRef.current = true;
      setUserRole(isCaregiver ? "caregiver" : "patient");
      const greeting = isCaregiver
        ? `You're viewing care for ${signedInPatientName} today. I'm here to help with their pharmacy needs.`
        : `Hi ${signedInPatientName}. I'm here to help with your pharmacy needs.`;
      addMessage("assistant", `${greeting} What would you like to take care of today?`, [
        { label: "Let's chat here", value: "chat", icon: MessageCircle },
        { label: "Request a call", value: "call", icon: PhoneCall },
      ]);
      return;
    }
    identityInitializedRef.current = true;
    const recognized = await fetchIdentity();
      // handleOpen starts this request immediately after setIsOpen(true), so
      // this callback still sees the previous render's isOpen=false value.
      // The generation token is the authoritative close/reset guard.
      if (generation !== conversationGenerationRef.current) return;
    if (recognized?.recognized && recognized.firstName) {
      setUserRole("patient");
      addMessage("assistant", `Welcome back, ${recognized.firstName}. How can we help with your pharmacy needs today?`, [
        { label: "Let's chat here", value: "chat", icon: MessageCircle },
        { label: "Request a call", value: "call", icon: PhoneCall },
      ]);
      return;
    }
    const greeting = getNextGreeting();
    addMessage("assistant", `${greeting}\n\nI can help with pharmacy questions as a guest. If you need account-specific help, you can verify securely without putting personal details in the conversation.`, [
      { label: "Verify me securely", value: "identity", icon: Shield },
      { label: "Sign in to ConcordiaCare", value: "signin", icon: Smartphone },
      { label: "Continue as guest", value: "guest", icon: MessageCircle },
      { label: "Talk to the pharmacy", value: "pharmacy", icon: PhoneCall },
    ]);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
    void initializeConversation();
  };

  const handleGreetingChoice = (value: string) => {
    if (value === "identity") {
      setIdentityPanel("form");
      setIdentityError("");
      return;
    }
    if (value === "signin") {
      setLocation("/login");
      setIsOpen(false);
      return;
    }
    if (value === "pharmacy") {
      window.location.href = "tel:+17183282833";
      return;
    }
    if (value === "guest") {
      addMessage("user", "Continue as guest");
      setUserRole("patient");
      addMessage("assistant", "Of course. You can chat with us as a guest. What can I help you with today?", [
        { label: "Shop OTC products", value: "I want to shop for OTC products", icon: Package },
        { label: "Refill a prescription", value: "I need to refill my prescription", icon: Repeat },
        { label: "Speak to a pharmacist", value: "I want to speak to a pharmacist", icon: PhoneCall },
      ]);
      setStep("pain_point");
      return;
    }
    handleChatOrCall(value);
  };

  const submitIdentityRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identityFirstName.trim() || !identityLastName.trim() || !identityDob || identityBusy) return;
    setIdentityBusy(true);
    setIdentityError("");
    try {
      identityRequestRef.current = { firstName: identityFirstName.trim(), lastName: identityLastName.trim(), dateOfBirth: identityDob };
      const response = await apiRequest("POST", "/api/chat/identity/request", {
        firstName: identityFirstName.trim(),
        lastName: identityLastName.trim(),
        dateOfBirth: identityDob,
        locale: identityLanguage,
      });
      const result = await response.json();
      setIdentityChallengeId(result.challengeId);
      setIdentityMessage(identityLanguage === "es"
        ? "Si los datos coinciden con una cuenta con correo electrónico, enviamos un código."
        : "If the details match an account with email, a code was sent.");
      setIdentityPanel("otp");
      setResendAt(Date.now() + 30000);
      setIdentityFirstName("");
      setIdentityLastName("");
      setIdentityDob("");
    } catch {
      setIdentityError(identityLanguage === "es" ? "No pudimos iniciar la verificación. Inténtelo de nuevo o llame a la farmacia." : "We couldn't start verification. Please try again or call the pharmacy.");
      clearIdentityFields();
    } finally {
      setIdentityBusy(false);
    }
  };

  const verifyIdentity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identityChallengeId || identityCode.length !== 6 || identityBusy) return;
    setIdentityBusy(true);
    setIdentityError("");
    try {
      const response = await apiRequest("POST", "/api/chat/identity/verify", { challengeId: identityChallengeId, code: identityCode });
      const result = await response.json();
      setIdentity({ recognized: true, firstName: result.firstName, source: "directory" });
      setIdentityPanel(null);
      identityRequestRef.current = null;
      clearIdentityFields();
      setUserRole("patient");
      addMessage("user", identityLanguage === "es" ? "Verificación segura" : "Secure verification");
      addMessage("assistant", identityLanguage === "es"
        ? `Qué bueno tenerle aquí, ${result.firstName}. ¿En qué podemos ayudarle hoy?`
        : `It's good to have you here, ${result.firstName}. What can we help you with today?`, [
          { label: identityLanguage === "es" ? "Hablar aquí" : "Let's chat here", value: "chat", icon: MessageCircle },
          { label: identityLanguage === "es" ? "Solicitar una llamada" : "Request a call", value: "call", icon: PhoneCall },
        ]);
    } catch {
      setIdentityError(identityLanguage === "es"
        ? "Ese código no funcionó. Por seguridad, no podemos confirmar más detalles. Puede intentar de nuevo, comenzar de nuevo o llamar a la farmacia."
        : "That code didn't work. For your privacy, we can't confirm anything more here. You can try again, start over, or call the pharmacy.");
      setIdentityCode("");
    } finally {
      setIdentityBusy(false);
    }
  };

  const resendIdentity = async () => {
    if (!identityRequestRef.current || Date.now() < resendAt || identityBusy) return;
    setIdentityBusy(true);
    setIdentityError("");
    try {
      const response = await apiRequest("POST", "/api/chat/identity/request", { ...identityRequestRef.current, locale: identityLanguage });
      const result = await response.json();
      setIdentityChallengeId(result.challengeId);
      setIdentityMessage(identityLanguage === "es"
        ? "Si los datos coinciden con una cuenta con correo electrónico, enviamos un código."
        : "If the details match an account with email, a code was sent.");
      setResendAt(Date.now() + 30000);
    } catch {
      setIdentityError(identityLanguage === "es" ? "No pudimos reenviar el código. Inténtelo de nuevo." : "We couldn't resend the code. Please try again.");
    } finally {
      setIdentityBusy(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    skipDraftSaveRef.current = true;
    sessionStorage.removeItem(CONCIERGE_DRAFT_KEY);
    clearConversationState();
    void apiRequest("DELETE", "/api/chat/identity").catch(() => {});
  };

  const handleReset = () => {
    void apiRequest("DELETE", "/api/chat/identity").catch(() => {});
    skipDraftSaveRef.current = true;
    sessionStorage.removeItem(CONCIERGE_DRAFT_KEY);
    clearConversationState();
    setConversationLanguage("en");
    setIdentityLanguage("en");
    const greeting = getNextGreeting();
    addMessage(
      "assistant",
      `${greeting}\n\nI can help with pharmacy questions as a guest. If you need account-specific help, you can verify securely without putting personal details in the conversation.`,
      [
        { label: "Verify me securely", value: "identity", icon: Shield },
        { label: "Sign in to ConcordiaCare", value: "signin", icon: Smartphone },
        { label: "Continue as guest", value: "guest", icon: MessageCircle },
        { label: "Talk to the pharmacy", value: "pharmacy", icon: PhoneCall },
      ]
    );
  };

  const clearPendingRequestState = () => {
    cancelPromptTimer();
    setPendingClarification(null);
    setDeliveryAddress("");
    setDeliveryAddressSelection(null);
    setApartmentUnit("");
    setPickupWindow("");
    setRequestedItems([]);
    setPendingRequestedItems([]);
    setContactPhone("");
    setContactEmail("");
    setContactName("");
    setCallRequested(false);
    setDeliveryType(null);
    setDetectedIntent("");
    setDetectedSentiment("neutral");
    setStep("free_chat");
  };

  const handleStoreCollectionTurn = (text: string, turnLanguage: ConversationLanguage): boolean => {
    const existingItems = detectedIntent === "store_item_collection" ? pendingRequestedItems : [];
    const storeTurn = resolveStoreCollectionTurn(text, existingItems);
    if (!storeTurn) return false;

    setGibberishCount(0);
    if (storeTurn.kind === "complete") {
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "Got it. Staff will confirm the exact products and availability. Would you prefer delivery or pickup?",
          "Entendido. El personal confirmará los productos exactos y su disponibilidad. ¿Prefiere entrega o recoger en la farmacia?",
        ),
      );
      setStep("address_capture");
      return true;
    }

    if (storeTurn.kind === "clarify_preference") {
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          `What kind of **${storeTurn.preference}** product do you need, such as a drink or snack? Staff will confirm the exact item and availability.`,
          `¿Qué tipo de producto **${storeTurn.preference}** necesita, por ejemplo una bebida o un refrigerio? El personal confirmará el artículo exacto y su disponibilidad.`,
        ),
      );
      return true;
    }

    setDetectedIntent("store_item_collection");
    setPendingRequestedItems(storeTurn.items);
    if (storeTurn.kind === "update") {
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          `Updated **${storeTurn.previousItem}** to **${storeTurn.item}**. Add another item, or say **done** when the list is complete.`,
          `Actualicé **${storeTurn.previousItem}** a **${storeTurn.item}**. Agregue otro artículo o diga **listo** cuando termine.`,
        ),
      );
      return true;
    }

    addMessage(
      "assistant",
      localizedPair(
        turnLanguage,
        `Added **${storeTurn.item}** to your pending store request. Add another item, include a preference such as **sugar-free**, or say **done**. Staff will confirm the exact product and availability.`,
        `Agregué **${storeTurn.item}** a su solicitud pendiente. Agregue otro artículo, incluya una preferencia como **sin azúcar**, o diga **listo**. El personal confirmará el producto exacto y su disponibilidad.`,
      ),
    );
    return true;
  };

  const handleRoleSelect = (role: string) => {
    const selected = ROLE_OPTIONS.find((r) => r.value === role);
    if (!selected) return;
    setUserRole(role as UserRole);
    addMessage("user", selected.label);
    addMessage(
      "assistant",
      ROLE_GREETINGS[role],
      CHAT_OR_CALL_OPTIONS.map((o) => ({ label: o.label, value: o.value, icon: o.icon }))
    );
    setStep("chat_or_call");
  };

  const handleChatOrCall = (choice: string) => {
    if (choice === "call") {
      addMessage("user", "Request a Call");
      setCallRequested(true);
      addMessage(
        "assistant",
        "Absolutely! I'd love to have someone from our store give you a call. They're warm, knowledgeable, and genuinely care about helping you.\n\nFirst, tell us whether this request is for pickup or delivery so staff have the full context. Then we'll securely collect your contact details."
      );
      setStep("address_capture");
    } else {
      addMessage("user", "Let's Chat Here");
      if (userRole === "caregiver") {
        addMessage(
          "assistant",
          "What's been the hardest part of managing their medications? I'm here to help make things easier.",
          [
            { label: "Organize their meds", value: "I want to organize their medications", icon: Package },
            { label: "Set up delivery", value: "I want to set up delivery for them", icon: Truck },
            { label: "Transfer their prescriptions", value: "I want to transfer their prescriptions", icon: Repeat },
            { label: "Speak to a pharmacist", value: "I want to speak to a pharmacist", icon: PhoneCall },
          ]
        );
      } else if (userRole === "professional") {
        addMessage(
          "assistant",
          "How can we support your practice or your patients today?",
          [
            { label: "Transfer a patient", value: "I want to transfer a patient", icon: Repeat },
            { label: "Long-term care partnership", value: "I want to learn about LTC partnership", icon: Building2 },
            { label: "Speak to a pharmacist", value: "I want to speak to a pharmacist", icon: PhoneCall },
          ]
        );
      } else {
        addMessage(
          "assistant",
          "Tell me. what's been the biggest challenge for you lately?",
          [
            { label: "Shop OTC products", value: "I want to shop for OTC products", icon: Package },
            { label: "Refill a prescription", value: "I need to refill my prescription", icon: Repeat },
            { label: "Track my order", value: "where is my order", icon: Truck },
            { label: "New prescription", value: "I have a new prescription from my doctor", icon: Pill },
            { label: "Hours & location", value: "what are your hours and location", icon: Clock },
          ]
        );
      }
      setStep("pain_point");
    }
  };

  const buildResponse = (text: string, intentResponse: string, role: UserRole): string => {
    const emotion = detectEmotion(text);
    const competitor = extractCompetitor(text);
    const keywordCat = detectKeywordCategory(text);
    let parts: string[] = [];

    if (isTalkTalk(text)) {
      const themes = summarizeTalkTalk(text);
      parts.push(`I really appreciate you sharing all of that with me. It sounds like you're dealing with ${themes}. and I want you to know, I heard every word.`);
    }

    if (emotion && EMOTION_PREFIXES[emotion]) {
      parts.push(EMOTION_PREFIXES[emotion]);
    }

    if (competitor) {
      parts.push(`I'm sorry about your experience with ${competitor}. You deserve personal, caring service. and that's exactly what we do differently here.`);
      parts.push(KEYWORD_VERIFICATION["competitor"](competitor));
    } else if (keywordCat && KEYWORD_VERIFICATION[keywordCat]) {
      parts.push(KEYWORD_VERIFICATION[keywordCat]());
    }

    parts.push(intentResponse);
    return parts.join("\n\n");
  };

  const handleGibberishInput = (text: string, clearField: () => void, turnLanguage: ConversationLanguage = conversationLanguage) => {
    const newCount = gibberishCount + 1;
    setGibberishCount(newCount);
    setDetectedIntent("gibberish");
    setDetectedSentiment("tech_difficulty");
    const isSpanishTurn = turnLanguage === "es";
    addMessage(
      "assistant",
      localizedPair(
        turnLanguage,
        newCount >= 2
          ? "I still didn't understand that, but that's okay. Please try a few different words or choose what you need below:"
          : "I didn't quite catch that. Tell me whether you need prescription or transfer help, an over-the-counter product, or a pharmacist:",
        newCount >= 2
          ? "Todavía no entendí el mensaje. No hay problema. Intente escribirlo con otras palabras o elija lo que necesita:"
          : "No entendí bien. Dígame si necesita ayuda con una receta o transferencia, un producto sin receta o un farmacéutico:",
      ),
      [
        { label: isSpanishTurn ? "Receta o transferencia" : "Prescription or transfer", value: "transfer_prescriptions", icon: Repeat },
        { label: isSpanishTurn ? "Producto sin receta" : "Over-the-counter product", value: "otc_question", icon: Package },
        { label: isSpanishTurn ? "Hablar con un farmacéutico" : "Talk to a pharmacist", value: "talk_human", icon: PhoneCall },
      ]
    );
    setStep("gibberish_help");
    clearField();
  };

  const handleGibberishChoice = (choice: string) => {
    resetStallTimer();
    setGibberishCount(0);
    if (choice === "switch_delivery") {
      addMessage("user", "I'd like delivery");
      setDeliveryType("delivery");
      addMessage(
        "assistant",
         "We can submit a delivery request. Pharmacy staff will verify the address and confirm availability and timing; live courier GPS is not currently available.\n\nWhere should we deliver? Start typing and select your address from the verified suggestions."
      );
      setStep("address_capture");
    } else if (choice === "organize_meds") {
      addMessage("user", "Help me organize my medications");
      setDetectedIntent("blister_pack");
      addMessage("assistant", INTENT_RESPONSES["blister_pack"]);
      setStep("triage_response");
      cancelPromptTimer();
      promptTimerRef.current = setTimeout(() => {
        addMessage(
          "assistant",
          "By the way, would you prefer delivery or pickup? Pharmacy staff confirm delivery availability and timing for each request."
        );
        setStep("address_capture");
      }, 1200);
    } else if (choice === "transfer_prescriptions") {
      addMessage("user", "I need help transferring a prescription from my old pharmacy to Concordia");
      setDetectedIntent("transfer");
      addMessage(
        "assistant",
        "I can help move your prescriptions from another pharmacy to Concordia. Use the secure transfer form so staff can review the current pharmacy and confirm the request.",
        [{ label: "Start secure transfer", value: "shop:/?transfer=form#transfer-section", icon: Repeat }],
      );
      setStep("triage_response");
    } else if (choice === "otc_question") {
      addMessage("user", "I have a question about an over-the-counter product");
      addMessage("assistant", "What symptom or product are you asking about? I can help you find an OTC category or connect you with a pharmacist. I won't diagnose or choose a prescription for you.");
      setStep("pain_point");
    } else if (choice === "talk_human" || choice === "call_me") {
      fireChatEvent("call_click", "speak_pharmacist");
      addMessage("user", "I'd like to talk to someone");
      setCallRequested(true);
      addMessage(
        "assistant",
        storeOpen
          ? INTENT_RESPONSES["speak_pharmacist"]
          : "We're currently closed. Our hours are Monday to Friday, 9 AM to 7 PM, and Saturdays, 10 AM to 4 PM. You can leave a callback request below, and pharmacy staff will review it when the store reopens."
      );
       setStep("address_capture");
    }
  };

  const respondToPrescriptionReadiness = (language: ConversationLanguage) => {
    setPickupWindow("");
    setDeliveryType(null);
    setDetectedIntent("order_status");
    addMessage("assistant", localizedPair(
      language,
      "I can't tell whether your prescription is ready from this chat. A name typed here doesn't verify your identity. Please call (718) 328-2833 before coming in, or sign in to check any available account updates. Don't share prescription numbers here.",
      "No puedo confirmar en este chat si su receta está lista. Escribir un nombre aquí no verifica su identidad. Llame al (718) 328-2833 antes de venir o inicie sesión para ver las actualizaciones disponibles. No comparta números de receta aquí.",
    ), [
      { label: language === "en" ? "Call the pharmacy" : "Llamar a la farmacia", value: "action:call", icon: Phone },
      { label: language === "en" ? "Sign in" : "Iniciar sesión", value: "shop:/login", icon: User },
    ]);
    setStep("triage_response");
  };

  const handlePainPointSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userChallenge.trim()) return;
    const text = userChallenge.trim();
    const turnLanguage = detectConversationLanguage(text, conversationLanguage);
    setConversationLanguage(turnLanguage);
    if (turnLanguage !== "mixed") setIdentityLanguage(turnLanguage);
    resetStallTimer();
    const offeredFirstName = extractVoluntaryFirstName(text);
    const conversationalName = offeredFirstName ?? chatFirstName ?? identity?.firstName ?? signedInPatientName;

    if (detectPII(text)) {
      const spanish = turnLanguage !== "en";
      addMessage("user", "Sensitive details removed");
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "For your privacy and security, please don't share personal information like your full name, date of birth, insurance or member IDs, or prescription numbers here in chat.\n\nGive us a call at (718) 328-2833 so we can help with account-specific information securely.",
          "Por su privacidad y seguridad, no comparta aquí información personal como su nombre completo, fecha de nacimiento, identificación del seguro o número de receta.\n\nLlámenos al (718) 328-2833 para que podamos ayudarle de forma segura con información específica de su cuenta.",
        )
      );
      setUserChallenge("");
      return;
    }

    const pickupItemsFromChallenge = extractPendingPickupItems(text);
    if (pickupItemsFromChallenge.length > 0) {
      setPendingRequestedItems((current) => Array.from(new Set([
        ...current,
        ...pickupItemsFromChallenge,
      ])));
    }

    if (offeredFirstName) setChatFirstName(offeredFirstName);

    addMessage("user", text);
    if (isPrescriptionReadinessRequest(text)) {
      setUserChallenge("");
      respondToPrescriptionReadiness(turnLanguage);
      return;
    }
    const followUp = resolvePendingClarification(pendingClarification, text);
    if (followUp) setPendingClarification(null);
    const routingText = followUp?.canonicalText ?? text;

    if (isOnlyNameIntroduction(text) && offeredFirstName) {
      setGibberishCount(0);
      addMessage("assistant", localizedPair(turnLanguage, `Nice to meet you, ${offeredFirstName}. How can I help you today?`, `Mucho gusto, ${offeredFirstName}. ¿Cómo puedo ayudarle hoy?`));
      setUserChallenge("");
      return;
    }

    if (isConversationCancellation(text)) {
      clearPendingRequestState();
      addMessage("assistant", localizedPair(turnLanguage, "Understood. I cleared the pending chat request. Nothing was submitted. What would you like help with instead?", "Entendido. Cancelé la solicitud pendiente del chat. No se envió nada. ¿Con qué desea ayuda ahora?"));
      setUserChallenge("");
      return;
    }

    if (
      detectedIntent === "flu_shot" &&
      (isAppointmentDateFragment(text) || /\bschedul\w*\b.*\bshot\b/i.test(text))
    ) {
      setGibberishCount(0);
      addMessage(
        "assistant",
        `Got it. ${text}. Use the scheduling page to choose the exact available time for your flu shot.`,
        [{ label: "Schedule Flu Shot", value: "shop:/schedule-flu-shot", icon: Clock }],
      );
      setStep("triage_response");
      return;
    }

    if (detectedIntent === "flu_shot" && isFluSchedulingAssistanceFollowUp(text)) {
      setGibberishCount(0);
      addMessage(
        "assistant",
        `I understand. I can't create or confirm the appointment inside public chat, but the pharmacy can help you schedule it.${pendingFluShotRequest ? ` I'll keep your request, "${pendingFluShotRequest}," in context.` : ""} The requested time is not reserved until staff confirms availability.`,
        [
          { label: "Call Concordia", value: "action:call", icon: PhoneCall },
          { label: "Try Scheduler Again", value: "shop:/schedule-flu-shot", icon: Clock },
        ],
      );
      setStep("triage_response");
      return;
    }

    if (isEnglishLanguagePreference(text)) {
      setGibberishCount(0);
      setConversationLanguage("en");
      addMessage("assistant", "Absolutely. I'll keep everything in English. What would you like help with today?");
      setUserChallenge("");
      return;
    }

    if (/^(?:help|help me|i need help|can you help)$/i.test(text)) {
      setGibberishCount(0);
      addMessage("assistant", localizedPair(turnLanguage, "Of course. What kind of help do you need?", "Claro. ¿Qué tipo de ayuda necesita?"), [
        { label: "Prescription help", value: "I need help with a prescription", icon: Pill },
        { label: "Delivery", value: "I need help with delivery", icon: Truck },
        { label: "OTC products", value: "I need help finding an OTC product", icon: Package },
        { label: "Talk to the pharmacy", value: "I want to speak to a pharmacist", icon: PhoneCall },
      ]);
      setUserChallenge("");
      return;
    }

    if (isSmallTalkCheckIn(text)) {
      setGibberishCount(0);
      const activeIntentLabel = detectedIntent
        ? INTENT_LABEL[detectedIntent] ?? detectedIntent.replaceAll("_", " ")
        : null;
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          activeIntentLabel
            ? `I'm doing well, thanks for asking${conversationalName ? `, ${conversationalName}` : ""}! We were working on your ${activeIntentLabel}. What would you like to do next?`
            : `I'm doing well, thanks for asking${conversationalName ? `, ${conversationalName}` : ""}!${offeredFirstName ? " Nice to meet you." : ""} How can I help you today?`,
          activeIntentLabel
            ? `Estoy bien, gracias por preguntar${conversationalName ? `, ${conversationalName}` : ""}. Estábamos trabajando en su solicitud de ${activeIntentLabel}. ¿Qué desea hacer ahora?`
            : `Estoy bien, gracias por preguntar${conversationalName ? `, ${conversationalName}` : ""}.${offeredFirstName ? " Mucho gusto." : ""} ¿Cómo puedo ayudarle hoy?`,
        ),
      );
      setUserChallenge("");
      return;
    }

    if (isGenericMedicationAndGroceryRequest(text)) {
      setGibberishCount(0);
      setDetectedIntent("medication_and_grocery_clarification");
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "I can help with both the medication and the grocery items. Is the medication a new prescription or a refill, and which grocery items do you need? Please reply without prescription numbers or other private medical details.",
          "Puedo ayudarle con el medicamento y los artículos de tienda. ¿El medicamento es una receta nueva o un resurtido, y qué artículos necesita? Responda sin números de receta ni otros datos médicos privados.",
        ),
      );
      setUserChallenge("");
      return;
    }

    if (!followUp && isMedicationHelpRequest(routingText)) {
      setGibberishCount(0);
      setDetectedIntent("medication_clarification");
      if (!isKnownMember) {
        addMessage("assistant", getNonMemberPrescriptionMessage(turnLanguage), getNonMemberPrescriptionButtons(turnLanguage));
        setStep("triage_response");
        return;
      }
      addMessage("assistant", localizedPair(turnLanguage, "I can help with your medication. Is this a new prescription or a refill?", "Puedo ayudarle con su medicamento. ¿Es una receta nueva o un resurtido?"), [
        { label: "Refill a prescription", value: "I need to refill a prescription", icon: Repeat },
        { label: "Fill a new prescription", value: "I need to fill a new prescription", icon: Pill },
        { label: "Side effect or interaction", value: "I have a medication side effect or interaction question", icon: Info },
        { label: "Talk to pharmacy staff", value: "I want to speak to a pharmacist", icon: PhoneCall },
      ]);
      setPendingClarification("medication_kind");
      setStep("triage_response");
      return;
    }

    if (handleStoreCollectionTurn(text, turnLanguage)) {
      setUserChallenge("");
      return;
    }

    if (isGibberish(text)) {
      handleGibberishInput(text, () => setUserChallenge(""), turnLanguage);
      return;
    }

    setGibberishCount(0);

    if (isVagueMessage(text)) {
      const activeIntentLabel = detectedIntent
        ? INTENT_LABEL[detectedIntent] ?? detectedIntent.replaceAll("_", " ")
        : null;
      addMessage("assistant", getVagueConversationResponse(pendingClarification, activeIntentLabel, turnLanguage));
      setUserChallenge("");
      return;
    }
    setUserChallenge(text);

    const ambiguous = detectAmbiguousIntent(routingText);
    if (ambiguous) {
      addMessage("assistant", ambiguous.question, ambiguous.options.map(o => ({ label: o.label, value: o.value })));
      setPendingClarification("transfer_direction");
      setUserChallenge("");
      return;
    }

    // Compound transfer + shop requests must remain two separate safe
    // workflows. Do not collect prescription details in public chat or imply
    // that either request is bundled, in stock, delivered, or fulfilled.
    if (detectCompoundIntent(routingText) === "transfer_and_shop") {
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "These are two separate requests. Use the secure transfer form for staff to review the prescription transfer, and browse or search the shop separately for store items. Please do not share DOBs, prescription numbers, or drug names in chat; staff will confirm each request separately.",
          "Son dos solicitudes separadas. Use el formulario seguro de transferencia para que el personal revise la transferencia, y explore o busque la tienda por separado para artículos. No comparta fechas de nacimiento, números de receta ni nombres de medicamentos en el chat; el personal confirmará cada solicitud por separado.",
        ),
        [
          { label: turnLanguage === "en" ? "Start secure transfer" : "Iniciar transferencia segura", value: "shop:/?transfer=form#transfer-section", icon: Repeat },
          { label: turnLanguage === "en" ? "Browse/search shop" : "Explorar/buscar tienda", value: "shop:/shop", icon: ShoppingBag },
        ],
      );
      setDetectedIntent("transfer_and_shop");
      setStep("triage_response");
      return;
    }

    // ── Mixed basket: pharmacy intent + OTC items in one message ─────────
    const mixedQuery = extractMixedQuery(routingText);
    if (mixedQuery) {
      const intentLabel = INTENT_LABEL[mixedQuery.intent] ?? "pharmacy request";
      setRequestedItems(mixedQuery.products.map((product) => ({ productId: product.id, name: product.name })));
      setPendingRequestedItems((current) => Array.from(new Set([
        ...current,
        ...mixedQuery.unmatchedItems,
        ...pickupItemsFromChallenge,
      ])));
      const productButtons = mixedQuery.products.map(p => ({
        label: p.name,
        value: `shop:/shop?product=${p.id}`,
        icon: ShoppingBag,
      }));
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          `${mixedQuery.products.length ? `I found **${mixedQuery.products.map((product) => product.name).join(", ")}** in Concordia's live catalog and they currently show as available. I'll include ${mixedQuery.products.length === 1 ? "it" : "them"} with your **${intentLabel}** for staff to confirm.` : `I can help coordinate your **${intentLabel}**.`}${mixedQuery.unmatchedItems.length ? `\n\nI couldn't confirm **${mixedQuery.unmatchedItems.join(", ")}** in the live catalog, so I haven't marked ${mixedQuery.unmatchedItems.length === 1 ? "it" : "them"} as available. I'll keep your full request together so staff can confirm availability or alternatives.` : ""}\n\nWould you prefer delivery or pickup?`,
          `${mixedQuery.products.length ? `Encontré **${mixedQuery.products.map((product) => product.name).join(", ")}** en el catálogo en vivo de Concordia y actualmente aparecen disponibles. Los incluiré con su solicitud de receta para que el personal los confirme.` : `Puedo ayudar a coordinar su **${intentLabel}**.`}${mixedQuery.unmatchedItems.length ? `\n\nNo pude confirmar **${mixedQuery.unmatchedItems.join(", ")}** en el catálogo en vivo, así que no los marqué como disponibles. Mantendré su solicitud completa para que el personal confirme la disponibilidad o alternativas.` : ""}\n\n¿Prefiere entrega o recoger en la farmacia?`,
        ),
        productButtons
      );
      setDetectedIntent(mixedQuery.intent);
      setUserChallenge("");
      setStep("address_capture");
      return;
    }

    // Live catalog match takes priority over MED_FUZZY_MAP so real stock
    // names / misspellings get a catalog-aware response, not a generic one.
    if (!fuzzyMatchProduct(routingText)) {
      const medHint = detectSingleWordMed(routingText);
      if (medHint) {
        if (medHint.category === "otc") {
          addMessage(
            "assistant",
            `Looks like you're asking about **${medHint.name}**! What can I help you with?`,
            [
              { label: "Buy it from our shop", value: `I want to buy ${medHint.name}`, icon: Package },
              { label: "Drug interactions", value: `drug interactions with ${medHint.name}`, icon: Pill },
              { label: "Speak to a pharmacist", value: "I want to speak to a pharmacist", icon: PhoneCall },
            ]
          );
        } else {
          addMessage(
            "assistant",
            `Looks like you're asking about **${medHint.name}**! What can I help you with?`,
            [
              { label: "Fill this prescription", value: `I need to fill my ${medHint.name} prescription`, icon: Pill },
              { label: "Refill / renew", value: `I need to refill ${medHint.name}`, icon: Repeat },
              { label: "Drug interactions", value: `drug interactions with ${medHint.name}`, icon: Info },
              { label: "Speak to a pharmacist", value: "I want to speak to a pharmacist", icon: PhoneCall },
            ]
          );
        }
        setUserChallenge("");
        return;
      }
    }

    const intent = await detectIntentWithLocalModel(routingText);
    const previousIntent = detectedIntent;
    if (intent !== "general") setDetectedIntent(intent);
    const sentiment = detectSentiment(text);
    setDetectedSentiment(sentiment);

    if (intent === "negative_pickup") {
      setDetectedSentiment("frustrated");
      const empathyResponse = getNegativePickupResponse(text);
      addMessage("assistant", empathyResponse, [
        { label: "Switch to Delivery", value: "switch_delivery", icon: Truck },
        { label: "Tell me about Delivery", value: "tell_delivery", icon: Info },
      ]);
      setStep("delivery_pitch");
      return;
    }

    if (intent === "pickup") {
      const comparingOptions = /\bdelivery\b/i.test(text) && /\bpick\s*up|pickup\b/i.test(text);
      setDeliveryType(comparingOptions ? null : "pickup");
      setCallRequested(false);
      addMessage(
        "assistant",
        comparingOptions
          ? localizedPair(turnLanguage, "Both are available as requests. Choose pickup below, or enter the requested delivery address. Pharmacy staff will confirm availability and timing.", "Puede solicitar cualquiera de las dos opciones. Elija recoger en la farmacia o escriba la dirección solicitada para entrega. El personal confirmará la disponibilidad y el horario.")
          : localizedPair(turnLanguage, "Pickup works. What pickup window would you like to request? Pharmacy staff will confirm the final time.", "Puede recogerlo. ¿Qué horario desea solicitar? El personal de la farmacia confirmará la hora final."),
      );
      setStep(comparingOptions ? "address_capture" : "pickup_time");
      return;
    }

    if (intent === "delivery" || intent === "delivery_zones") {
      setDeliveryType("delivery");
      setDeliveryAddress("");
      setDeliveryAddressSelection(null);
      setApartmentUnit("");
      setPickupWindow("");
      setCallRequested(false);
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "I can help with a delivery request. Choose pickup below if you prefer, or enter the requested delivery address. Pharmacy staff will verify the address, service area, stock, and timing before anything is confirmed.",
          "Puedo ayudarle con una solicitud de entrega. Elija recoger en la farmacia si lo prefiere, o ingrese la dirección de entrega solicitada. El personal verificará la dirección, la zona, el inventario y el horario antes de confirmar.",
        ),
      );
      setStep("address_capture");
      return;
    }

    if (intent === "appointment") {
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "I can help. What kind of appointment do you need? Flu-shot times can be booked online. For another pharmacy consultation, I can send a callback request to our staff.",
          "Puedo ayudarle. ¿Qué tipo de cita necesita? Puede reservar una vacuna contra la gripe en línea. Para otra consulta de farmacia, puedo enviar una solicitud de llamada a nuestro personal.",
        ),
        [
          { label: turnLanguage === "en" ? "Schedule a flu shot" : "Programar vacuna contra la gripe", value: "shop:/schedule-flu-shot", icon: Clock },
          { label: turnLanguage === "en" ? "Request a staff callback" : "Solicitar llamada del personal", value: "action:callback", icon: PhoneCall },
        ],
      );
      setStep("triage_response");
      return;
    }

    if (intent === "transfer") {
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "I can help move your prescriptions from another pharmacy to Concordia. Use the secure transfer form so the request goes directly into the pharmacy's transfer queue. You can enter the current pharmacy and medication count there without posting prescription numbers in public chat. Staff will confirm the transfer after reviewing it.",
          "Puedo ayudarle a transferir sus recetas de otra farmacia a Concordia. Use el formulario seguro para que la solicitud vaya directamente a la cola de transferencias de la farmacia. Puede ingresar allí la farmacia actual y la cantidad de medicamentos sin publicar números de receta en el chat público. El personal confirmará la transferencia después de revisarla.",
        ),
        [
          { label: turnLanguage === "en" ? "Start secure transfer" : "Iniciar transferencia segura", value: "shop:/?transfer=form#transfer-section", icon: Repeat },
          { label: turnLanguage === "en" ? "Call Concordia" : "Llamar a Concordia", value: "action:call", icon: Phone },
        ],
      );
      setStep("triage_response");
      return;
    }

    if (intent === "speak_pharmacist") {
      fireChatEvent("rx_redirect", "speak_pharmacist");
      addMessage(
        "assistant",
        storeOpen
          ? INTENT_RESPONSES["speak_pharmacist"]
          : "We're currently closed. Our hours are Monday to Friday, 9 AM to 7 PM, and Saturdays, 10 AM to 4 PM. You can leave a callback request below, and pharmacy staff will review it when the store reopens."
      );
      setCallRequested(true);
      setDeliveryType(null);
       setStep("address_capture");
      return;
    }

    if (intent === "general") {
      const capabilityResponse = getCapabilityScopeResponse(text);
      if (capabilityResponse) {
        addMessage("assistant", capabilityResponse, getGeneralFallbackButtons(userRole));
        setStep("triage_response");
        return;
      }
      fireChatEvent("fallback", "general");
      const searchTerm = isExplicitShopSearch(text) ? extractSearchTerm(text) : null;
      const matchingProducts = searchTerm
        ? _liveProducts.filter(p => {
            const q = searchTerm.toLowerCase();
            return (p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) && !p.requiresPrescription;
          }).slice(0, 3)
        : [];
      const fallbackButtons = matchingProducts.length === 0 && !searchTerm
        ? getGeneralFallbackButtons(userRole)
        : searchTerm && matchingProducts.length === 0
          ? [
              { label: `Search our shop for "${searchTerm}"`, value: `shop:/shop?search=${encodeURIComponent(searchTerm)}`, icon: ShoppingBag },
              { label: "Send this question to staff", value: "action:callback", icon: PhoneCall },
            ]
          : undefined;
      const response = previousIntent || pendingClarification
        ? getContextRecoveryResponse(
            pendingClarification,
            previousIntent ? INTENT_LABEL[previousIntent] ?? previousIntent.replaceAll("_", " ") : null,
            turnLanguage,
            text,
          )
        : buildResponse(text, getIntentResponse("general"), userRole);
      addMessage("assistant", response, fallbackButtons, matchingProducts.length > 0 ? matchingProducts : undefined);
      setStep("triage_response");
      return;
    }

    // ── Live product match ─────────────────────────────────────────────
    if (intent.startsWith("live_product:")) {
      const productId = intent.slice("live_product:".length);
      const product = _liveProducts.find(p => p.id === productId);
      if (product) {
        const inStock = product.inStock && (product.stockQuantity ?? 0) > 0;
        const shopSlug = normalizeCategoryToShopSlug(product.category);
        const shopPath = shopSlug && shopSlug !== "all" ? `/shop?category=${shopSlug}` : "/shop";
        if (!inStock) {
          const alternatives = findRelatedInStock(product);
          let msg = `**${product.name}** is currently out of stock. I'm sorry about that!`;
          const buttons: { label: string; value: string; icon?: React.ComponentType<any> }[] = [];
          if (alternatives.length > 1) {
            msg += ` Here are some similar items that are in stock:`;
          } else if (alternatives.length === 1) {
            msg += ` We do have a similar item in stock. take a look!`;
            buttons.push({ label: "Browse Shop", value: `shop:/shop?product=${alternatives[0].id}`, icon: ShoppingBag });
          } else {
            msg += ` Feel free to browse our full shop. we're always restocking!`;
            buttons.push({ label: "Browse Shop", value: `shop:${shopPath}`, icon: ShoppingBag });
          }
          buttons.push({ label: "Notify me when back", value: `action:restock-notify-product:${product.id}:${product.category ?? ""}`, icon: BellRing });
          if (!isKnownMember) {
            buttons.push({ label: "Become a Patient", value: "action:signup", icon: User });
          }
          addMessage("assistant", msg, buttons, alternatives.length > 1 ? alternatives : undefined);
          setStep("triage_response");
          return;
        }
        const msg = isKnownMember
          ? `We carry **${product.name}**. it's in stock and ready to order!`
          : `We carry **${product.name}**. it's in stock and available in our online shop. Delivery availability and timing are confirmed by pharmacy staff.`;
        const buttons = isKnownMember
          ? [
              { label: "Open ConcordiaCare App", value: `action:app:${product.id}`, icon: Smartphone },
            ]
          : [
              { label: "Become a Patient", value: "action:signup", icon: User },
            ];
        addMessage("assistant", msg, buttons, [product]);
        setStep("triage_response");
        return;
      }
    }

    // ── Delivery tracking. auth-aware ─────────────────────────────────
    if (intent === "tracking") {
      const msg = isKnownMember
        ? localizedPair(turnLanguage, "Open ConcordiaCare to check eligible order updates. If a delivery is late, missing, or incorrect, call (718) 328-2833.", "Abra ConcordiaCare para consultar las actualizaciones de pedidos elegibles. Si una entrega está retrasada, perdida o incorrecta, llame al (718) 328-2833.")
        : localizedPair(turnLanguage, "I can't access guest order details in public chat. Call (718) 328-2833 so the pharmacy can securely check the order.", "No puedo acceder a los detalles de pedidos de invitados en el chat público. Llame al (718) 328-2833 para que la farmacia pueda revisar el pedido de forma segura.");
      const buttons = isKnownMember
        ? [{ label: turnLanguage === "en" ? "Check in ConcordiaCare" : "Consultar en ConcordiaCare", value: "action:app", icon: Smartphone }]
        : [
            { label: turnLanguage === "en" ? "Call Concordia" : "Llamar a Concordia", value: "action:call", icon: Phone },
          ];
      addMessage("assistant", msg, buttons);
      setStep("triage_response");
      return;
    }

    // ── OTC shop category intents ───────────────────────────────────────
    if (intent === "cart" || intent === "checkout") {
      const destination = intent === "cart" ? "/cart" : (isAuthenticated ? "/checkout" : "/express-checkout");
      addMessage(
        "assistant",
        intent === "cart"
          ? "Your cart is ready to review. You can adjust quantities or remove items before continuing."
          : "I’ll open secure checkout so you can review the order, choose delivery or pickup, and confirm payment yourself.",
        [{ label: intent === "cart" ? "Review Cart" : "Open Secure Checkout", value: `shop:${destination}`, icon: intent === "cart" ? ShoppingCart : CreditCard }],
      );
      setStep("triage_response");
      return;
    }

    if (intent in OTC_SHOP_MAP) {
      const category = OTC_SHOP_MAP[intent];
      const shopPath = category ? `/shop?category=${category}` : "/shop";
      const spanishOtc = isSpanishText(text);
      const response = buildResponse(text, getLocalizedIntentResponse(intent, text, turnLanguage), userRole);
      const browseLabel = spanishOtc ? "Ver productos" : "Browse Shop";
      const callLabel = spanishOtc ? "Llamar ahora" : "Call Us Now";
      const notifyLabel = spanishOtc ? "Avísenme cuando esté disponible" : "Notify me when back";
      const staffButton = intent === "otc_pain"
        ? [{ label: spanishOtc ? "Enviar pregunta al personal" : "Send question to staff", value: "action:callback", icon: PhoneCall }]
        : [];
      if (category) {
        const productsInCategory = _liveProducts.filter(
          p => normalizeCategoryToShopSlug(p.category) === category && !p.requiresPrescription
        );
        const inStockInCategory = productsInCategory.filter(p => p.inStock && (p.stockQuantity ?? 0) > 0);
        if (inStockInCategory.length === 0) {
          if (productsInCategory.length === 0) {
            // Item not in our catalog. don't claim "out of stock", just guide to shop
            addMessage("assistant", response, [
              { label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag },
              { label: callLabel, value: "action:call", icon: Phone },
              ...staffButton,
            ]);
            setStep("triage_response");
            return;
          }
          const alternatives = findAdjacentCategoryInStock(category);
          if (alternatives.length > 0) {
            const msg = response + (spanishOtc ? "\n\nEsa sección no tiene inventario en este momento. También puede considerar:" : "\n\nWe're freshening up that section. nothing in stock at the moment. You might also like:");
             addMessage("assistant", msg, [{ label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag }, ...staffButton], alternatives);
            setStep("triage_response");
            return;
          } else {
            const msg = response + (spanishOtc ? "\n\nEsa sección está temporalmente agotada. Reponemos inventario regularmente; puede llamarnos para consultar disponibilidad." : "\n\nIt looks like that section is temporarily out of stock. we restock regularly, so check back soon! In the meantime, feel free to call us and we can let you know exactly when it's back.");
            addMessage("assistant", msg, [
              { label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag },
              { label: notifyLabel, value: `action:restock-notify:${category}`, icon: BellRing },
              { label: callLabel, value: "action:call", icon: Phone },
              ...staffButton,
            ]);
            setStep("triage_response");
            return;
          }
        } else {
          const topProducts = [...productsInCategory]
            .sort((a, b) => {
              const aStock = a.inStock && (a.stockQuantity ?? 0) > 0 ? 0 : 1;
              const bStock = b.inStock && (b.stockQuantity ?? 0) > 0 ? 0 : 1;
              if (aStock !== bStock) return aStock - bStock;
              return a.name.localeCompare(b.name);
            })
            .slice(0, 3);
          addMessage("assistant", response, [
            { label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag },
            ...staffButton,
          ], topProducts);
          setStep("triage_response");
          return;
        }
      }
      addMessage("assistant", response, [
        { label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag },
        ...staffButton,
      ]);
      setStep("triage_response");
      return;
    }

    const localizedResponse = getLocalizedIntentResponse(intent, text, turnLanguage);
    const response = intent === "emergency" ? localizedResponse : buildResponse(text, localizedResponse, userRole);
    if (intent === "app") {
      addMessage("assistant", response, [
        { label: "Open ConcordiaCare App", value: "action:app", icon: Smartphone },
      ]);
      setStep("triage_response");
      return;
    }
    if (intent === "flu_shot") {
      const spanishFluShot = isSpanishText(text);
      setPendingFluShotRequest(text);
      addMessage("assistant", response, [
        {
          label: spanishFluShot ? "Programar vacuna contra la gripe" : "Schedule Flu Shot",
          value: "shop:/schedule-flu-shot",
          icon: Clock,
        },
      ]);
      setStep("triage_response");
      return;
    }
    if (intent === "signup") {
      if (isKnownMember) {
        addMessage("assistant", "You're already recognized as a Concordia member. Sign in to ConcordiaCare to manage prescriptions, orders, and rewards.", [
          { label: "Open ConcordiaCare App", value: "action:app", icon: Smartphone },
        ]);
        setStep("triage_response");
        return;
      }
      addMessage("assistant", response, [
        { label: "Become a Patient", value: "action:signup", icon: User },
      ]);
      setStep("triage_response");
      return;
    }
    if (!isKnownMember && NON_MEMBER_PRESCRIPTION_INTENTS.has(intent)) {
      addMessage(
        "assistant",
        `${response}\n\n${getNonMemberPrescriptionMessage(turnLanguage)}`,
        getNonMemberPrescriptionButtons(turnLanguage),
      );
      setStep("triage_response");
      return;
    }
    if (intent === "new_rx") {
      addMessage("assistant", response, [
        { label: "Help with this new prescription", value: "I need help with the new prescription my doctor sent", icon: Pill },
        { label: "Refill instead", value: "I need to refill a prescription", icon: Repeat },
        { label: "Talk to pharmacy staff", value: "I want to speak to a pharmacist", icon: PhoneCall },
      ]);
      setStep("triage_response");
      return;
    }
    addMessage("assistant", response);
    setStep("triage_response");

    if (!NO_AUTO_ADDRESS_INTENTS.has(intent)) {
      cancelPromptTimer();
      promptTimerRef.current = setTimeout(() => {
        addMessage(
          "assistant",
          "By the way, would you prefer delivery or pickup? Pharmacy staff confirm delivery availability and timing for each request."
        );
        setStep("address_capture");
      }, 1200);
    }
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryAddress.trim()) return;
    const text = deliveryAddress.trim();
    const lower = text.toLowerCase();
    resetStallTimer();

    if (lower.includes("pickup") || lower.includes("pick up") || lower.includes("come in") || lower.includes("walk in") || lower.includes("in person") || lower.includes("in store") || lower.includes("recoger") || lower.includes("recojo") || lower.includes("en la farmacia")) {
      setDeliveryType("pickup");
      setDeliveryAddress("");
      setDeliveryAddressSelection(null);
      addMessage("user", "I'll pick up in person");
      addMessage(
        "assistant",
        localizedPair(conversationLanguage, "Pickup works. What pickup window would you like to request? Pharmacy staff will confirm the final time.", "Puede recogerlo. ¿Qué horario desea solicitar? El personal de la farmacia confirmará la hora final.")
      );
      setStep("pickup_time");
      return;
    } else {
      if (!deliveryAddressSelection) {
        addMessage(
          "assistant",
          localizedPair(conversationLanguage, "Please select your delivery address from the verified map suggestions. Manual address text cannot be submitted.", "Seleccione su dirección de entrega de las sugerencias verificadas del mapa. No se puede enviar una dirección escrita manualmente."),
        );
        return;
      }
      addMessage("user", "Delivery address selected securely");
      setDeliveryType("delivery");
      addMessage(
        "assistant",
        localizedPair(conversationLanguage, "Thanks. Pharmacy staff will verify the requested delivery address and confirm availability before anything is finalized.\n\nPlease provide your contact details securely so the team can follow up.", "Gracias. El personal verificará la dirección solicitada y confirmará la disponibilidad antes de finalizar cualquier detalle.\n\nProporcione sus datos de contacto de forma segura para que el equipo pueda comunicarse.")
      );
    }
    setStep("lead_capture");
  };

  const handleDeliveryPitchChoice = (choice: string) => {
    resetStallTimer();
    if (choice === "switch_delivery") {
      addMessage("user", "I'd like delivery instead");
      setDeliveryType("delivery");
      setDeliveryAddress("");
      setDeliveryAddressSelection(null);
      setApartmentUnit("");
      setDetectedIntent("negative_pickup");
      addMessage(
        "assistant",
        "We can submit a delivery request. Pharmacy staff will verify the address and confirm availability and timing; live courier GPS is not currently available.\n\nWhere should we deliver? Start typing and select your address from the verified suggestions."
      );
      setStep("address_capture");
    } else {
      addMessage("user", "Tell me more about delivery");
      addMessage(
        "assistant",
         "Here's how delivery works:\n\n\u2022 Delivery is available only where pharmacy staff confirm service\n\u2022 Staff confirm availability and timing for each request\n\u2022 There is no live courier GPS tracking at this time\n\u2022 Medications are carefully packaged and handled\n\nWould you like to submit a delivery request? Select your address from the verified suggestions and the team can follow up."
      );
      setDeliveryType("delivery");
      setDeliveryAddress("");
      setDeliveryAddressSelection(null);
      setApartmentUnit("");
      setStep("address_capture");
    }
  };

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactPhone.trim() || !contactName.trim() || isSubmitting) return;
    if (deliveryType === "pickup" && !pickupWindow.trim()) return;
    if (deliveryType === "delivery" && (!deliveryAddress.trim() || !deliveryAddressSelection)) return;
    addMessage("user", "Contact details provided securely");
    addMessage("assistant", localizedPair(
      conversationLanguage,
      "Please review your request below. Nothing will be sent until you choose “Confirm and send pending request.”",
      "Revise su solicitud a continuación. No se enviará nada hasta que elija «Confirmar y enviar solicitud pendiente».",
    ));
    setStep("review");
  };

  const handleFinalConfirm = async () => {
    if (isSubmitting || !contactPhone.trim() || !contactName.trim()) return;
    if (deliveryType === "pickup" && !pickupWindow.trim()) {
      setStep("pickup_time");
      return;
    }
    if (deliveryType === "delivery" && (!deliveryAddress.trim() || !deliveryAddressSelection)) {
      setStep("address_capture");
      return;
    }
    setIsSubmitting(true);
    try {
      const handoff = buildConciergeHandoff({
        intent: detectedIntent || "general",
        deliveryType,
        hasVerifiedDeliveryAddress: Boolean(deliveryType === "delivery" && deliveryAddressSelection),
        hasPickupWindow: Boolean(deliveryType === "pickup" && pickupWindow.trim()),
        catalogItemCount: requestedItems.length,
        pendingItemCount: pendingRequestedItems.length,
      });
      const response = await apiRequest("POST", "/api/concierge/lead", {
        confirmed: true,
        idempotencyKey: idempotencyKeyRef.current,
        contactName: contactName.trim(),
        phone: contactPhone.trim(),
        email: contactEmail.trim() || undefined,
        role: userRole ?? "guest",
        intent: detectedIntent || "general",
        sentiment: detectedSentiment,
        deliveryAddress: deliveryType === "delivery" ? deliveryAddress.trim() : undefined,
        deliveryAddressSelection: deliveryType === "delivery" ? deliveryAddressSelection : undefined,
        apartmentUnit: deliveryType === "delivery" ? apartmentUnit.trim() || undefined : undefined,
        deliveryType: deliveryType || "pickup",
        pickupWindow: deliveryType === "pickup" ? pickupWindow.trim() : undefined,
        requestedItems,
        pendingItems: pendingRequestedItems.length > 0 ? pendingRequestedItems : undefined,
        callRequested,
        handoff,
      });
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || (result as { success?: unknown }).success !== true || !(typeof (result as { leadId?: unknown }).leadId === "string" || typeof (result as { leadId?: unknown }).leadId === "number") || !String((result as { leadId: string | number }).leadId).trim()) {
        throw new Error("The request could not be confirmed.");
      }
      const leadId = String((result as { leadId: string | number }).leadId);
      setContactName("");
      setContactPhone("");
      setContactEmail("");
      setDeliveryAddress("");
      setDeliveryAddressSelection(null);
      setApartmentUnit("");
      setPickupWindow("");
      setRequestedItems([]);
      setPendingRequestedItems([]);
      addMessage("assistant", callRequested
        ? "Your call request was submitted and is pending review by our care team. Please call (718) 328-2833 if you need immediate assistance."
        : `Request #${leadId} was submitted for staff review. Stock, ${deliveryType === "pickup" ? "pickup time" : "delivery details"}, and prescription processing are not confirmed until pharmacy staff approve it. We'll use your contact information for updates.`);
      setStep("submitted");
    } catch (err) {
      addMessage(
        "assistant",
        "Oh no. It looks like something went wrong on our end. I'm really sorry about that. Would you mind trying again? You can also call us directly at (718) 328-2833 and we'll take care of everything."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestockNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget || restockSubmitting) return;
    if (!restockEmail.trim() && !restockPhone.trim()) return;
    setRestockSubmitting(true);
    try {
      const res = await fetch("/api/restock-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: restockTarget.category || undefined,
          productId: restockTarget.productId || undefined,
          name: restockName.trim() || undefined,
          email: restockEmail.trim() || undefined,
          phone: restockPhone.trim() || undefined,
        }),
      });
      if (res.ok) {
        addMessage("assistant", `You're on the list! We'll send you a message as soon as ${restockTarget.label} ${restockTarget.productId ? "is" : "are"} back in stock. Is there anything else I can help with?`);
        setRestockTarget(null);
        setRestockEmail("");
        setRestockPhone("");
        setRestockName("");
        setStep("free_chat");
      } else {
        addMessage("assistant", "Sorry, I couldn't save your notification request. Please try again or call us at (718) 328-2833.");
        setStep("triage_response");
      }
    } catch {
      addMessage("assistant", "Something went wrong. Please try again or call us at (718) 328-2833.");
      setStep("triage_response");
    } finally {
      setRestockSubmitting(false);
    }
  };

  const handleFreeTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!freeText.trim()) return;
    const text = freeText.trim();
    const turnLanguage = detectConversationLanguage(text, conversationLanguage);
    setConversationLanguage(turnLanguage);
    if (turnLanguage !== "mixed") setIdentityLanguage(turnLanguage);
    setFreeText("");
    resetStallTimer();
    const offeredFirstName = extractVoluntaryFirstName(text);
    const conversationalName = offeredFirstName ?? chatFirstName ?? identity?.firstName ?? signedInPatientName;

    if (detectPII(text)) {
      const spanish = turnLanguage !== "en";
      addMessage("user", "Sensitive details removed");
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "For your privacy and security, please don't share personal information like your full name, date of birth, insurance or member IDs, or prescription numbers here in chat.\n\nGive us a call at (718) 328-2833 so we can help with account-specific information securely.",
          "Por su privacidad y seguridad, no comparta aquí información personal como su nombre completo, fecha de nacimiento, identificación del seguro o número de receta.\n\nLlámenos al (718) 328-2833 para que podamos ayudarle de forma segura con información específica de su cuenta.",
        )
      );
      return;
    }

    if (isPrescriptionReadinessRequest(text)) {
      addMessage("user", text);
      respondToPrescriptionReadiness(turnLanguage);
      return;
    }

    const requestedPickupWindow = getPickupWindowFromFreeText(text, step, deliveryType);
    if (requestedPickupWindow) {
      addMessage("user", text);
      if (isPastPickupWindow(requestedPickupWindow)) {
        addMessage("assistant", localizedPair(
          turnLanguage,
          "That time has already passed in New York. If you mean later today, please give a future pickup window, or choose tomorrow or next available. Nothing has been confirmed.",
          "Esa hora ya pasó en Nueva York. Si se refiere a más tarde hoy, indique un horario futuro para recoger, o elija mañana o el próximo disponible. Nada está confirmado.",
        ));
        return;
      }
      setPickupWindow(requestedPickupWindow);
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "Thanks. This is a requested window, not a confirmed appointment. Please provide your contact details securely so staff can confirm it.",
          "Gracias. Este es un horario solicitado, no una cita confirmada. Proporcione sus datos de contacto de forma segura para que el personal pueda confirmarlo.",
        ),
      );
      setStep("lead_capture");
      return;
    }

    const pickupItemsFromMessage = extractPendingPickupItems(text);
    if (pickupItemsFromMessage.length > 0) {
      setPendingRequestedItems((current) => Array.from(new Set([
        ...current,
        ...pickupItemsFromMessage,
      ])));
    }

    if (offeredFirstName) setChatFirstName(offeredFirstName);

    addMessage("user", text);
    const followUp = resolvePendingClarification(pendingClarification, text);
    if (followUp) setPendingClarification(null);
    const routingText = followUp?.canonicalText ?? text;

    if (isOnlyNameIntroduction(text) && offeredFirstName) {
      setGibberishCount(0);
      addMessage("assistant", localizedPair(turnLanguage, `Nice to meet you, ${offeredFirstName}. How can I help you today?`, `Mucho gusto, ${offeredFirstName}. ¿Cómo puedo ayudarle hoy?`));
      return;
    }

    if (isConversationCancellation(text)) {
      clearPendingRequestState();
      addMessage("assistant", localizedPair(turnLanguage, "Understood. I cleared the pending chat request. Nothing was submitted. What would you like help with instead?", "Entendido. Cancelé la solicitud pendiente del chat. No se envió nada. ¿Con qué desea ayuda ahora?"));
      return;
    }

    if (
      detectedIntent === "flu_shot" &&
      (isAppointmentDateFragment(text) || /\bschedul\w*\b.*\bshot\b/i.test(text))
    ) {
      setGibberishCount(0);
      addMessage(
        "assistant",
        `Got it. ${text}. Use the scheduling page to choose the exact available time for your flu shot.`,
        [{ label: "Schedule Flu Shot", value: "shop:/schedule-flu-shot", icon: Clock }],
      );
      setStep("triage_response");
      return;
    }

    if (detectedIntent === "flu_shot" && isFluSchedulingAssistanceFollowUp(text)) {
      setGibberishCount(0);
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          `I understand. I can't create or confirm the appointment inside public chat, but the pharmacy can help you schedule it.${pendingFluShotRequest ? ` I'll keep your request, "${pendingFluShotRequest}," in context.` : ""} The requested time is not reserved until staff confirms availability.`,
          `Entiendo. No puedo crear ni confirmar la cita dentro del chat público, pero la farmacia puede ayudarle a programarla.${pendingFluShotRequest ? ` Mantendré su solicitud, "${pendingFluShotRequest}," en contexto.` : ""} El horario solicitado no está reservado hasta que el personal confirme la disponibilidad.`,
        ),
        [
          { label: turnLanguage === "en" ? "Call Concordia" : "Llamar a Concordia", value: "action:call", icon: PhoneCall },
          { label: turnLanguage === "en" ? "Try Scheduler Again" : "Intentar el programador otra vez", value: "shop:/schedule-flu-shot", icon: Clock },
        ],
      );
      setStep("triage_response");
      return;
    }

    if (isEnglishLanguagePreference(text)) {
      setGibberishCount(0);
      setConversationLanguage("en");
      addMessage("assistant", "Absolutely. I'll keep everything in English. What would you like help with today?");
      return;
    }

    if (/^(?:help|help me|i need help|can you help)$/i.test(text)) {
      setGibberishCount(0);
      addMessage("assistant", localizedPair(turnLanguage, "Of course. What kind of help do you need?", "Claro. ¿Qué tipo de ayuda necesita?"), [
        { label: "Prescription help", value: "I need help with a prescription", icon: Pill },
        { label: "Delivery", value: "I need help with delivery", icon: Truck },
        { label: "OTC products", value: "I need help finding an OTC product", icon: Package },
        { label: "Talk to the pharmacy", value: "I want to speak to a pharmacist", icon: PhoneCall },
      ]);
      return;
    }

    if (isSmallTalkCheckIn(text)) {
      setGibberishCount(0);
      const activeIntentLabel = detectedIntent
        ? INTENT_LABEL[detectedIntent] ?? detectedIntent.replaceAll("_", " ")
        : null;
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          activeIntentLabel
            ? `I'm doing well, thanks for asking${conversationalName ? `, ${conversationalName}` : ""}! We were working on your ${activeIntentLabel}. What would you like to do next?`
            : `I'm doing well, thanks for asking${conversationalName ? `, ${conversationalName}` : ""}!${offeredFirstName ? " Nice to meet you." : ""} How can I help you today?`,
          activeIntentLabel
            ? `Estoy bien, gracias por preguntar${conversationalName ? `, ${conversationalName}` : ""}. Estábamos trabajando en su solicitud de ${activeIntentLabel}. ¿Qué desea hacer ahora?`
            : `Estoy bien, gracias por preguntar${conversationalName ? `, ${conversationalName}` : ""}.${offeredFirstName ? " Mucho gusto." : ""} ¿Cómo puedo ayudarle hoy?`,
        ),
      );
      return;
    }

    if (isGenericMedicationAndGroceryRequest(text)) {
      setGibberishCount(0);
      setDetectedIntent("medication_and_grocery_clarification");
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "I can help with both the medication and the grocery items. Is the medication a new prescription or a refill, and which grocery items do you need? Please reply without prescription numbers or other private medical details.",
          "Puedo ayudarle con el medicamento y los artículos de tienda. ¿El medicamento es una receta nueva o un resurtido, y qué artículos necesita? Responda sin números de receta ni otros datos médicos privados.",
        ),
      );
      return;
    }

    if (!followUp && isMedicationHelpRequest(routingText)) {
      setGibberishCount(0);
      setDetectedIntent("medication_clarification");
      if (!isKnownMember) {
        addMessage("assistant", getNonMemberPrescriptionMessage(turnLanguage), getNonMemberPrescriptionButtons(turnLanguage));
        setStep("triage_response");
        return;
      }
      addMessage("assistant", localizedPair(turnLanguage, "I can help with your medication. Is this a new prescription or a refill?", "Puedo ayudarle con su medicamento. ¿Es una receta nueva o un resurtido?"), [
        { label: "Refill a prescription", value: "I need to refill a prescription", icon: Repeat },
        { label: "Fill a new prescription", value: "I need to fill a new prescription", icon: Pill },
        { label: "Side effect or interaction", value: "I have a medication side effect or interaction question", icon: Info },
        { label: "Talk to pharmacy staff", value: "I want to speak to a pharmacist", icon: PhoneCall },
      ]);
      setPendingClarification("medication_kind");
      setStep("triage_response");
      return;
    }

    if (handleStoreCollectionTurn(text, turnLanguage)) {
      return;
    }

    if (isGibberish(text)) {
      handleGibberishInput(text, () => {}, turnLanguage);
      return;
    }

    setGibberishCount(0);

    if (isVagueMessage(text)) {
      const activeIntentLabel = detectedIntent
        ? INTENT_LABEL[detectedIntent] ?? detectedIntent.replaceAll("_", " ")
        : null;
      addMessage("assistant", getVagueConversationResponse(pendingClarification, activeIntentLabel, turnLanguage));
      return;
    }
    setUserChallenge(text);

    const ambiguousFree = detectAmbiguousIntent(routingText);
    if (ambiguousFree) {
      addMessage("assistant", ambiguousFree.question, ambiguousFree.options.map(o => ({ label: o.label, value: o.value })));
      setPendingClarification("transfer_direction");
      return;
    }

    // ── Mixed basket: pharmacy intent + OTC items in one message ─────────
    const mixedQueryFree = extractMixedQuery(routingText);
    if (mixedQueryFree) {
      const intentLabel = INTENT_LABEL[mixedQueryFree.intent] ?? "pharmacy request";
      setRequestedItems(mixedQueryFree.products.map((product) => ({ productId: product.id, name: product.name })));
      setPendingRequestedItems((current) => Array.from(new Set([
        ...current,
        ...mixedQueryFree.unmatchedItems,
        ...pickupItemsFromMessage,
      ])));
      const productButtons = mixedQueryFree.products.map(p => ({
        label: p.name,
        value: `shop:/shop?product=${p.id}`,
        icon: ShoppingBag,
      }));
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          `${mixedQueryFree.products.length ? `I found **${mixedQueryFree.products.map((product) => product.name).join(", ")}** in Concordia's live catalog and they currently show as available. I'll include ${mixedQueryFree.products.length === 1 ? "it" : "them"} with your **${intentLabel}** for staff to confirm.` : `I can help coordinate your **${intentLabel}**.`}${mixedQueryFree.unmatchedItems.length ? `\n\nI couldn't confirm **${mixedQueryFree.unmatchedItems.join(", ")}** in the live catalog, so I haven't marked ${mixedQueryFree.unmatchedItems.length === 1 ? "it" : "them"} as available. I'll keep your full request together so staff can confirm availability or alternatives.` : ""}\n\nWould you prefer delivery or pickup?`,
          `${mixedQueryFree.products.length ? `Encontré **${mixedQueryFree.products.map((product) => product.name).join(", ")}** en el catálogo en vivo de Concordia y actualmente aparecen disponibles. Los incluiré con su solicitud de receta para que el personal los confirme.` : `Puedo ayudar a coordinar su **${intentLabel}**.`}${mixedQueryFree.unmatchedItems.length ? `\n\nNo pude confirmar **${mixedQueryFree.unmatchedItems.join(", ")}** en el catálogo en vivo, así que no los marqué como disponibles. Mantendré su solicitud completa para que el personal confirme la disponibilidad o alternativas.` : ""}\n\n¿Prefiere entrega o recoger en la farmacia?`,
        ),
        productButtons
      );
      setDetectedIntent(mixedQueryFree.intent);
      setStep("address_capture");
      return;
    }

    // Live catalog match takes priority over MED_FUZZY_MAP.
    if (!fuzzyMatchProduct(routingText)) {
      const medHint = detectSingleWordMed(routingText);
      if (medHint) {
        if (medHint.category === "otc") {
          addMessage(
            "assistant",
            `Looks like you're asking about **${medHint.name}**! What can I help you with?`,
            [
              { label: "Buy it from our shop", value: `I want to buy ${medHint.name}`, icon: Package },
              { label: "Drug interactions", value: `drug interactions with ${medHint.name}`, icon: Pill },
              { label: "Speak to a pharmacist", value: "I want to speak to a pharmacist", icon: PhoneCall },
            ]
          );
        } else {
          addMessage(
            "assistant",
            `Looks like you're asking about **${medHint.name}**! What can I help you with?`,
            [
              { label: "Fill this prescription", value: `I need to fill my ${medHint.name} prescription`, icon: Pill },
              { label: "Refill / renew", value: `I need to refill ${medHint.name}`, icon: Repeat },
              { label: "Drug interactions", value: `drug interactions with ${medHint.name}`, icon: Info },
              { label: "Speak to a pharmacist", value: "I want to speak to a pharmacist", icon: PhoneCall },
            ]
          );
        }
        return;
      }
    }

    const intent = await detectIntentWithLocalModel(routingText);
    const previousIntent = detectedIntent;
    if (intent !== "general") setDetectedIntent(intent);
    const sentiment = detectSentiment(text);
    if (sentiment !== "neutral") setDetectedSentiment(sentiment);

    if (intent === "general") {
      const capabilityResponse = getCapabilityScopeResponse(text);
      if (capabilityResponse) {
        addMessage("assistant", capabilityResponse, getGeneralFallbackButtons(userRole));
        setStep("triage_response");
        return;
      }
    }

    if (intent === "negative_pickup") {
      setDetectedIntent("negative_pickup");
      setDetectedSentiment("frustrated");
      const empathyResponse = getNegativePickupResponse(text);
      addMessage("assistant", empathyResponse, [
        { label: "Switch to Delivery", value: "switch_delivery", icon: Truck },
        { label: "Tell me about Delivery", value: "tell_delivery", icon: Info },
      ]);
      if (step !== "submitted") {
        setStep("delivery_pitch");
      }
      return;
    }

    if (intent === "pickup") {
      const comparingOptions = /\bdelivery\b/i.test(text) && /\bpick\s*up|pickup\b/i.test(text);
      setDeliveryType(comparingOptions ? null : "pickup");
      setCallRequested(false);
      setDetectedIntent("pickup");
      addMessage(
        "assistant",
        comparingOptions
          ? localizedPair(turnLanguage, "Both are available as requests. Choose pickup below, or enter the requested delivery address. Pharmacy staff will confirm availability and timing.", "Puede solicitar cualquiera de las dos opciones. Elija recoger en la farmacia o escriba la dirección solicitada para entrega. El personal confirmará la disponibilidad y el horario.")
          : localizedPair(turnLanguage, "Pickup works. What pickup window would you like to request? Pharmacy staff will confirm the final time.", "Puede recogerlo. ¿Qué horario desea solicitar? El personal de la farmacia confirmará la hora final."),
      );
      if (step !== "submitted") {
        setStep(comparingOptions ? "address_capture" : "pickup_time");
      }
      return;
    }

    if (intent === "delivery" || intent === "delivery_zones") {
      setDeliveryType("delivery");
      setDeliveryAddress("");
      setPickupWindow("");
      setCallRequested(false);
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "I can help with a delivery request. Choose pickup below if you prefer, or enter the requested delivery address. Pharmacy staff will verify the address, service area, stock, and timing before anything is confirmed.",
          "Puedo ayudarle con una solicitud de entrega. Elija recoger en la farmacia si lo prefiere, o ingrese la dirección de entrega solicitada. El personal verificará la dirección, la zona, el inventario y el horario antes de confirmar.",
        ),
      );
      setStep("address_capture");
      return;
    }

    if (intent === "appointment") {
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "I can help. What kind of appointment do you need? Flu-shot times can be booked online. For another pharmacy consultation, I can send a callback request to our staff.",
          "Puedo ayudarle. ¿Qué tipo de cita necesita? Puede reservar una vacuna contra la gripe en línea. Para otra consulta de farmacia, puedo enviar una solicitud de llamada a nuestro personal.",
        ),
        [
          { label: turnLanguage === "en" ? "Schedule a flu shot" : "Programar vacuna contra la gripe", value: "shop:/schedule-flu-shot", icon: Clock },
          { label: turnLanguage === "en" ? "Request a staff callback" : "Solicitar llamada del personal", value: "action:callback", icon: PhoneCall },
        ],
      );
      setStep("triage_response");
      return;
    }

    if (intent === "transfer") {
      addMessage(
        "assistant",
        localizedPair(
          turnLanguage,
          "I can help move your prescriptions from another pharmacy to Concordia. Use the secure transfer form so the request goes directly into the pharmacy's transfer queue. You can enter the current pharmacy and medication count there without posting prescription numbers in public chat. Staff will confirm the transfer after reviewing it.",
          "Puedo ayudarle a transferir sus recetas de otra farmacia a Concordia. Use el formulario seguro para que la solicitud vaya directamente a la cola de transferencias de la farmacia. Puede ingresar allí la farmacia actual y la cantidad de medicamentos sin publicar números de receta en el chat público. El personal confirmará la transferencia después de revisarla.",
        ),
        [
          { label: turnLanguage === "en" ? "Start secure transfer" : "Iniciar transferencia segura", value: "shop:/?transfer=form#transfer-section", icon: Repeat },
          { label: turnLanguage === "en" ? "Call Concordia" : "Llamar a Concordia", value: "action:call", icon: Phone },
        ],
      );
      setStep("triage_response");
      return;
    }

    // ── Live product match ─────────────────────────────────────────────────
    if (intent.startsWith("live_product:")) {
      const productId = intent.slice("live_product:".length);
      const product = _liveProducts.find(p => p.id === productId);
      if (product) {
        const inStock = product.inStock && (product.stockQuantity ?? 0) > 0;
        const shopSlug = normalizeCategoryToShopSlug(product.category);
        const shopPath = shopSlug && shopSlug !== "all" ? `/shop?category=${shopSlug}` : "/shop";
        if (!inStock) {
          const alternatives = findRelatedInStock(product);
          let msg = `**${product.name}** is currently out of stock. I'm sorry about that!`;
          const buttons: { label: string; value: string; icon?: React.ComponentType<any> }[] = [];
          if (alternatives.length > 1) {
            msg += ` Here are some similar items that are in stock:`;
          } else if (alternatives.length === 1) {
            msg += ` We do have a similar item in stock. Take a look!`;
            buttons.push({ label: "Browse Shop", value: `shop:/shop?product=${alternatives[0].id}`, icon: ShoppingBag });
          } else {
            msg += ` Feel free to browse our full shop. We're always restocking!`;
            buttons.push({ label: "Browse Shop", value: `shop:${shopPath}`, icon: ShoppingBag });
          }
          buttons.push({ label: "Notify me when back", value: `action:restock-notify-product:${product.id}:${product.category ?? ""}`, icon: BellRing });
          if (!isKnownMember) {
            buttons.push({ label: "Become a Patient", value: "action:signup", icon: User });
          }
          addMessage("assistant", msg, buttons, alternatives.length > 1 ? alternatives : undefined);
          setStep("triage_response");
          return;
        }
        const msg = isKnownMember
          ? `We carry **${product.name}**. It's in stock and ready to order!`
          : `We carry **${product.name}**. It's in stock and available in our online shop. Delivery availability and timing are confirmed by pharmacy staff.`;
        const buttons = isKnownMember
          ? [
              { label: "Open ConcordiaCare App", value: `action:app:${product.id}`, icon: Smartphone },
            ]
          : [
              { label: "Become a Patient", value: "action:signup", icon: User },
            ];
        addMessage("assistant", msg, buttons, [product]);
        setStep("triage_response");
        return;
      }
    }

    // ── Delivery tracking. auth-aware response ────────────────────────────
    if (intent === "tracking") {
      const msg = isKnownMember
        ? localizedPair(turnLanguage, "Open ConcordiaCare to check eligible order updates. If a delivery is late, missing, or incorrect, call (718) 328-2833.", "Abra ConcordiaCare para consultar las actualizaciones de pedidos elegibles. Si una entrega está retrasada, perdida o incorrecta, llame al (718) 328-2833.")
        : localizedPair(turnLanguage, "I can't access guest order details in public chat. Call (718) 328-2833 so the pharmacy can securely check the order.", "No puedo acceder a los detalles de pedidos de invitados en el chat público. Llame al (718) 328-2833 para que la farmacia pueda revisar el pedido de forma segura.");
      const buttons = isKnownMember
        ? [{ label: turnLanguage === "en" ? "Check in ConcordiaCare" : "Consultar en ConcordiaCare", value: "action:app", icon: Smartphone }]
        : [
            { label: turnLanguage === "en" ? "Call Concordia" : "Llamar a Concordia", value: "action:call", icon: Phone },
          ];
      addMessage("assistant", msg, buttons);
      setStep("triage_response");
      return;
    }

    if (intent === "cart" || intent === "checkout") {
      const destination = intent === "cart" ? "/cart" : (isAuthenticated ? "/checkout" : "/express-checkout");
      addMessage(
        "assistant",
        intent === "cart"
          ? "Your cart is ready to review. You can adjust quantities or remove items before continuing."
          : "I’ll open secure checkout so you can review the order, choose delivery or pickup, and confirm payment yourself.",
        [{ label: intent === "cart" ? "Review Cart" : "Open Secure Checkout", value: `shop:${destination}`, icon: intent === "cart" ? ShoppingCart : CreditCard }],
      );
      setStep("triage_response");
      return;
    }

    const localizedResponse = getLocalizedIntentResponse(intent, text, turnLanguage);
    const response = intent === "emergency" ? localizedResponse : buildResponse(text, localizedResponse, userRole);

    if (intent === "speak_pharmacist") {
      addMessage("assistant", response);
      if (step !== "submitted") {
        setCallRequested(true);
        setStep("address_capture");
      }
      return;
    }

    if (intent === "flu_shot") {
      const spanishFluShot = isSpanishText(text);
      setPendingFluShotRequest(text);
      addMessage("assistant", response, [
        {
          label: spanishFluShot ? "Programar vacuna contra la gripe" : "Schedule Flu Shot",
          value: "shop:/schedule-flu-shot",
          icon: Clock,
        },
      ]);
      setStep("triage_response");
      return;
    }

    if (intent === "signup") {
      if (isKnownMember) {
        addMessage("assistant", "You're already recognized as a Concordia member. Sign in to ConcordiaCare to manage prescriptions, orders, and rewards.", [
          { label: "Open ConcordiaCare App", value: "action:app", icon: Smartphone },
        ]);
        setStep("triage_response");
        return;
      }
      addMessage("assistant", response, [
        { label: "Become a Patient", value: "action:signup", icon: User },
      ]);
      return;
    }

    if (intent === "app") {
      addMessage("assistant", response, [
        { label: "Open ConcordiaCare App", value: "action:app", icon: Smartphone },
      ]);
      setStep("triage_response");
      return;
    }

    if (intent === "otc_shop") {
      addMessage("assistant", response);
      return;
    }

    if (!isKnownMember && NON_MEMBER_PRESCRIPTION_INTENTS.has(intent)) {
      addMessage(
        "assistant",
        `${response}\n\n${getNonMemberPrescriptionMessage(turnLanguage)}`,
        getNonMemberPrescriptionButtons(turnLanguage),
      );
      setStep("triage_response");
      return;
    }

    if (intent in OTC_SHOP_MAP) {
      const category = OTC_SHOP_MAP[intent];
      const shopPath = category ? `/shop?category=${category}` : "/shop";
      const spanishOtc = isSpanishText(text);
      const browseLabel = spanishOtc ? "Ver productos" : "Browse Shop";
      const callLabel = spanishOtc ? "Llamar ahora" : "Call Us Now";
      const notifyLabel = spanishOtc ? "Avísenme cuando esté disponible" : "Notify me when back";
      const staffButton = intent === "otc_pain"
        ? [{ label: spanishOtc ? "Enviar pregunta al personal" : "Send question to staff", value: "action:callback", icon: PhoneCall }]
        : [];
      if (category) {
        const productsInCategory = _liveProducts.filter(
          p => normalizeCategoryToShopSlug(p.category) === category && !p.requiresPrescription
        );
        const inStockInCategory = productsInCategory.filter(p => p.inStock && (p.stockQuantity ?? 0) > 0);
        if (inStockInCategory.length === 0) {
          if (productsInCategory.length === 0) {
            // Item not in our catalog. don't claim "out of stock", just guide to shop
            addMessage("assistant", response, [
              { label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag },
              { label: callLabel, value: "action:call", icon: Phone },
              ...staffButton,
            ]);
            setStep("triage_response");
            return;
          }
          const alternatives = findAdjacentCategoryInStock(category);
          if (alternatives.length > 0) {
            const msg = response + (spanishOtc ? "\n\nEsa sección no tiene inventario en este momento. También puede considerar:" : "\n\nWe're freshening up that section. nothing in stock at the moment. You might also like:");
            addMessage("assistant", msg, [{ label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag }, ...staffButton], alternatives);
            setStep("triage_response");
            return;
          } else {
            const msg = response + (spanishOtc ? "\n\nEsa sección está temporalmente agotada. Reponemos inventario regularmente; puede llamarnos para consultar disponibilidad." : "\n\nIt looks like that section is temporarily out of stock. we restock regularly, so check back soon! In the meantime, feel free to call us and we can let you know exactly when it's back.");
            addMessage("assistant", msg, [
              { label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag },
              { label: notifyLabel, value: `action:restock-notify:${category}`, icon: BellRing },
              { label: callLabel, value: "action:call", icon: Phone },
              ...staffButton,
            ]);
            setStep("triage_response");
            return;
          }
        } else {
          const topProducts = [...productsInCategory]
            .sort((a, b) => {
              const aStock = a.inStock && (a.stockQuantity ?? 0) > 0 ? 0 : 1;
              const bStock = b.inStock && (b.stockQuantity ?? 0) > 0 ? 0 : 1;
              if (aStock !== bStock) return aStock - bStock;
              return a.name.localeCompare(b.name);
            })
            .slice(0, 3);
          addMessage("assistant", response, [
            { label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag },
              ...staffButton,
          ], topProducts);
          setStep("triage_response");
          return;
        }
      }
      addMessage("assistant", response, [
        { label: browseLabel, value: `shop:${shopPath}`, icon: ShoppingBag },
        ...(intent === "otc_pain"
          ? [{ label: spanishOtc ? "Enviar pregunta al personal" : "Send question to staff", value: "action:callback", icon: PhoneCall }]
          : []),
      ]);
      setStep("triage_response");
      return;
    }

    if (LEAD_INTENTS.has(intent) && step !== "submitted") {
      addMessage("assistant", response);
      if (!deliveryAddress && !deliveryType && step !== "lead_capture") {
        cancelPromptTimer();
        promptTimerRef.current = setTimeout(() => {
          addMessage("assistant", "If you'd like, I can connect you with our care team to get things started. Would you prefer delivery or pickup?");
          setStep("address_capture");
        }, 1000);
      } else if (!contactName && step !== "lead_capture") {
        setStep("lead_capture");
      }
      return;
    }

    if (intent === "general") {
      const searchTerm = isExplicitShopSearch(text) ? extractSearchTerm(text) : null;
      const matchingProducts = searchTerm
        ? _liveProducts.filter(p => {
            const q = searchTerm.toLowerCase();
            return (p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) && !p.requiresPrescription;
          }).slice(0, 3)
        : [];
      const fallbackButtons = matchingProducts.length === 0 && !searchTerm
        ? getGeneralFallbackButtons(userRole)
        : searchTerm && matchingProducts.length === 0
          ? [
              { label: `Search our shop for "${searchTerm}"`, value: `shop:/shop?search=${encodeURIComponent(searchTerm)}`, icon: ShoppingBag },
              { label: "Send this question to staff", value: "action:callback", icon: PhoneCall },
            ]
          : undefined;
      const generalResponse = previousIntent || pendingClarification
        ? getContextRecoveryResponse(
            pendingClarification,
            previousIntent ? INTENT_LABEL[previousIntent] ?? previousIntent.replaceAll("_", " ") : null,
            turnLanguage,
            text,
          )
        : buildResponse(text, getIntentResponse("general"), userRole);
      addMessage("assistant", generalResponse, fallbackButtons, matchingProducts.length > 0 ? matchingProducts : undefined);
      setStep("triage_response");
      return;
    }

    addMessage("assistant", response);
  };

  if (!mounted || isAdminRoute) return null;

  const chatContent = (
    <>
      <style>{`
        @keyframes chatFadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-4px); opacity: 1; }
        }
        .chat-msg-enter { animation: chatFadeUp 0.22s ease both; }
        .typing-dot-1 { animation: typingDot 1.2s ease-in-out infinite; animation-delay: 0ms; }
        .typing-dot-2 { animation: typingDot 1.2s ease-in-out infinite; animation-delay: 180ms; }
        .typing-dot-3 { animation: typingDot 1.2s ease-in-out infinite; animation-delay: 360ms; }
      `}</style>

      <div
        id="chat-widget-container"
        style={{
          position: "fixed",
          bottom: "calc(16px + var(--cookie-banner-offset, 0px) + env(safe-area-inset-bottom, 0px))",
          right: "12px",
        zIndex: 99998,
        }}
      >
        {!isOpen ? (
          <div className="relative">
            <button
              type="button"
              onClick={handleOpen}
              className="relative flex items-center gap-2.5 rounded-full shadow-lg text-white transition-all px-5"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary) / 0.9) 0%, hsl(var(--primary) / 0.6) 100%)",
                height: "52px",
              }}
              data-testid="button-open-chat"
            >
              <img src={concordiaCIcon} alt="Concordia" className="h-6 w-6 shrink-0 object-contain" loading="lazy" decoding="async" width="24" height="24" />
              <span className="text-sm font-medium whitespace-nowrap">How can I help?</span>
            </button>
            {unreadCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white/20"
                data-testid="badge-unread"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
        ) : (
          <Card
            className="flex flex-col shadow-2xl border border-white/10"
            style={{
              width: "calc(100vw - 32px)",
              maxWidth: "420px",
              height: "600px",
              maxHeight: "calc(100dvh - var(--cookie-banner-offset, 0px) - 32px)",
              background: "linear-gradient(180deg, hsl(222 47% 11%) 0%, hsl(217 40% 14%) 100%)",
            }}
          >
            {/* Header */}
            <CardHeader
              className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-white/10 pb-3 pt-3 px-4"
              style={{ background: "rgba(15, 23, 42, 0.95)" }}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 overflow-hidden">
                    <img src={concordiaCIcon} alt="Concordia" className="h-6 w-6 object-contain" loading="lazy" decoding="async" width="24" height="24" />
                  </div>
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-slate-900" />
                </div>
                <div>
                  <CardTitle className="text-sm text-white leading-tight" data-testid="text-chat-title">Care Concierge</CardTitle>
                  <p className="text-xs text-emerald-400/80 flex items-center gap-1 leading-tight mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                    Online · Concordia Pharmacy
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <a
                  href="tel:+17183282833"
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md text-slate-400 hover:text-emerald-400 transition-colors"
                  title="Call us: (718) 328-2833"
                  data-testid="link-call-pharmacy"
                >
                  <PhoneCall className="h-4 w-4" />
                </a>
                {step !== "greeting" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleReset}
                    className="text-xs text-slate-400"
                    data-testid="button-restart-chat"
                  >
                    Start Over
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={conversationLanguage === "en" ? "Close chat" : "Cerrar chat"}
                  onClick={handleClose}
                  className="text-slate-400"
                  data-testid="button-close-chat"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col p-0 overflow-hidden">
              <div ref={scrollAreaRef} className="flex-1 p-4 overflow-y-auto" data-lenis-prevent>
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`chat-msg-enter flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      data-testid={`chat-message-${msg.role}`}
                    >
                      {msg.role === "assistant" && <AssistantAvatar />}
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "rounded-tr-sm bg-primary text-white"
                            : "rounded-tl-sm bg-slate-800/80 text-slate-200 border border-white/5"
                        }`}
                      >
                        <p className="whitespace-pre-line text-sm leading-relaxed">{msg.content}</p>
                        {msg.buttons && step === "greeting" && (
                          <div className="mt-3 space-y-2">
                            {msg.buttons.map((btn) => (
                              <ChoiceButton
                                key={btn.value}
                                btn={btn}
                                onClick={() => {
                                  if (["identity", "signin", "guest", "pharmacy", "chat", "call"].includes(btn.value)) {
                                    handleGreetingChoice(btn.value);
                                  } else {
                                    handleRoleSelect(btn.value);
                                  }
                                }}
                                testPrefix="button-role"
                              />
                            ))}
                          </div>
                        )}
                        {msg.buttons && step === "chat_or_call" && (
                          <div className="mt-3 space-y-2">
                            {msg.buttons.map((btn) => (
                              <ChoiceButton
                                key={btn.value}
                                btn={btn}
                                onClick={() => handleChatOrCall(btn.value)}
                                testPrefix="button-chat-or-call"
                              />
                            ))}
                          </div>
                        )}
                        {msg.buttons && step === "delivery_pitch" && (
                          <div className="mt-3 space-y-2">
                            {msg.buttons.map((btn) => (
                              <ChoiceButton
                                key={btn.value}
                                btn={btn}
                                onClick={() => handleDeliveryPitchChoice(btn.value)}
                                testPrefix="button-delivery"
                              />
                            ))}
                          </div>
                        )}
                        {msg.buttons && (step === "gibberish_help" || step === "lead_capture") && (
                          <div className="mt-3 space-y-2">
                            {msg.buttons.map((btn) => (
                              <ChoiceButton
                                key={btn.value}
                                btn={btn}
                                onClick={() => handleGibberishChoice(btn.value)}
                                testPrefix="button-help"
                                accentColor="amber"
                              />
                            ))}
                          </div>
                        )}
                        {msg.buttons && step === "triage_response" && msg.role === "assistant" && msg.buttons.some((b) => b.value.startsWith("shop:") || b.value.startsWith("action:")) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {msg.buttons.filter((b) => b.value.startsWith("shop:") || b.value.startsWith("action:")).map((btn) => {
                              const Icon = btn.icon;
                              const isApp = btn.value.startsWith("action:app");
                              const isSignup = btn.value === "action:signup";
                              const isCall = btn.value === "action:call";
                              return (
                                <button
                                  key={btn.value}
                                  type="button"
                                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium transition-all ${
                                    isApp
                                      ? "border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 hover:border-emerald-500/60 hover:text-white"
                                      : isCall
                                      ? "border-amber-500/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 hover:border-amber-500/60 hover:text-white"
                                      : "border-primary/30 bg-primary/20 text-primary/70 hover:bg-primary/30 hover:border-primary/50 hover:text-white"
                                  }`}
                                  data-testid={`button-action-${btn.value.replace(/[^a-z]/g, "-")}`}
                                  onClick={() => {
                                    if (btn.value.startsWith("shop:")) {
                                      const destination = btn.value.replace("shop:", "");
                                      setLocation(destination);
                                      setIsOpen(false);
                                      if (destination.includes("transfer=form")) {
                                        window.setTimeout(() => {
                                          window.dispatchEvent(new Event("concordia:open-transfer"));
                                        }, 0);
                                      }
                                    } else if (btn.value.startsWith("action:app")) {
                                      // Extract optional product ID encoded as action:app:<uuid>
                                      const parts = btn.value.split(":");
                                      const productId = parts.length > 2 ? parts.slice(2).join(":") : null;
                                      const deepLink = productId
                                        ? `concordianyc://product/${productId}`
                                        : "concordianyc://";
                                      const storeUrl = "https://apps.apple.com/us/app/concordiacare/id6741450205";
                                      // Try deep link first; if app isn't installed the scheme
                                      // silently fails and the fallback timer opens the App Store.
                                      const fallbackTimer = setTimeout(() => {
                                        window.open(storeUrl, "_blank");
                                      }, 1500);
                                      const clearTimer = () => clearTimeout(fallbackTimer);
                                      window.addEventListener("blur", clearTimer, { once: true });
                                      document.addEventListener("visibilitychange", () => {
                                        if (document.hidden) clearTimer();
                                      }, { once: true });
                                      // Use a hidden anchor click. doesn't navigate the page
                                      const a = document.createElement("a");
                                      a.href = deepLink;
                                      a.style.display = "none";
                                      document.body.appendChild(a);
                                      a.click();
                                      setTimeout(() => document.body.removeChild(a), 200);
                                    } else if (btn.value.startsWith("action:restock-notify")) {
                                      let category: string | undefined;
                                      let productId: string | undefined;
                                      let label = "this item";
                                      if (btn.value.startsWith("action:restock-notify-product:")) {
                                        const parts = btn.value.replace("action:restock-notify-product:", "").split(":");
                                        productId = parts[0];
                                        category = parts[1] || undefined;
                                        label = "this product";
                                      } else {
                                        category = btn.value.replace("action:restock-notify:", "");
                                        label = category
                                          ? `${category.charAt(0).toUpperCase() + category.slice(1)} products`
                                          : "this category";
                                      }
                                      setRestockTarget({ category, productId, label });
                                      setRestockEmail("");
                                      setRestockPhone("");
                                      setRestockName("");
                                      addMessage("user", "Notify me when back in stock");
                                      addMessage("assistant", `I'll make sure you're the first to know when ${label} ${productId ? "is" : "are"} back in stock! Just drop your email or phone number below and we'll send you an alert as soon as it's available.`);
                                      setStep("restock_notify");
                                    } else if (btn.value === "action:medication-help") {
                                      addMessage("user", btn.label);
                                      setDetectedIntent("medication_clarification");
                                      if (!isKnownMember) {
                                        addMessage("assistant", getNonMemberPrescriptionMessage(conversationLanguage), getNonMemberPrescriptionButtons(conversationLanguage));
                                      } else {
                                        addMessage("assistant", localizedPair(conversationLanguage, "Is this a new prescription, a refill, or a medication safety question? Please don't post medical details here.", "¿Es una receta nueva, un resurtido o una pregunta sobre la seguridad de un medicamento? No comparta detalles médicos aquí."), [
                                          { label: "Refill", value: "I need to refill a prescription", icon: Repeat },
                                          { label: "New prescription", value: "I need to fill a new prescription", icon: Pill },
                                          { label: "Medication safety", value: "I have a medication side effect or interaction question", icon: Info },
                                        ]);
                                        setPendingClarification("medication_kind");
                                      }
                                      setStep("triage_response");
                                    } else if (btn.value === "action:callback") {
                                      setCallRequested(true);
                                      addMessage("user", conversationLanguage === "en" ? "I'd like a staff callback" : "Quisiera una llamada del personal");
                                       addMessage("assistant", localizedPair(conversationLanguage, "First choose pickup or delivery so staff have the full context. Then provide your contact details securely; the request will remain pending until a staff member responds.", "Primero elija recoger o entregar para que el personal tenga todo el contexto. Después proporcione sus datos de contacto de forma segura; la solicitud permanecerá pendiente hasta que responda un miembro del personal."));
                                       setStep("address_capture");
                                    } else if (isSignup) {
                                      setLocation("/signup");
                                      setIsOpen(false);
                                    } else if (isCall) {
                                      window.open("tel:+17183282833");
                                    }
                                  }}
                                >
                                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                                  {btn.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {msg.productCards && msg.productCards.length > 0 && msg.role === "assistant" && (
                          <div className="mt-3 space-y-2" data-testid="chat-product-cards">
                            {msg.productCards.map((p) => (
                              <InlineProductCard
                                key={p.id}
                                product={p}
                                onNavigate={(path) => {
                                  setLocation(path);
                                  setIsOpen(false);
                                }}
                                onAddToCart={handleChatAddToCart}
                                addedToCart={addedToCartIds.has(p.id)}
                              />
                            ))}
                          </div>
                        )}
                        {msg.buttons && step === "pain_point" && msg.role === "assistant" && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {msg.buttons.map((btn) => {
                              const Icon = btn.icon;
                              return (
                                <button
                                  key={btn.value}
                                  type="button"
                                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-slate-700/40 px-3 py-1.5 text-xs text-slate-300 transition-all hover:bg-slate-700/70 hover:border-primary/40 hover:text-white"
                                  data-testid={`button-main-menu-${btn.label.toLowerCase().replace(/\s/g, "-")}`}
                                  onClick={() => {
                                    setPendingClarification(null);
                                    if (btn.value === "I want to shop for OTC products") {
                                      addMessage("user", btn.label);
                                      setLocation("/shop");
                                      setIsOpen(false);
                                    } else {
                                      setUserChallenge(btn.value);
                                      addMessage("user", btn.label);
                                      const intent = detectIntent(btn.value);
                                      setDetectedIntent(intent);
                                      setDetectedSentiment(detectSentiment(btn.value));
                                      addMessage("assistant", buildResponse(btn.value, INTENT_RESPONSES[intent], userRole));
                                      setStep("triage_response");
                                      cancelPromptTimer();
                                    }
                                  }}
                                >
                                  {Icon && <Icon className="h-3 w-3 text-primary shrink-0" />}
                                  {btn.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {msg.buttons && step !== "greeting" && step !== "pain_point" && msg.role === "assistant" && msg === messages[messages.length - 1] && msg.buttons.some(b => !b.value.startsWith("shop:") && !b.value.startsWith("action:")) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {msg.buttons.filter(b => !b.value.startsWith("shop:") && !b.value.startsWith("action:")).map((btn) => (
                              <button
                                key={btn.value}
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-slate-200 transition-all hover:bg-primary/20 hover:border-primary/50 hover:text-white"
                                data-testid={`button-clarify-${btn.label.toLowerCase().replace(/\s+/g, "-")}`}
                                onClick={() => {
                                  setPendingClarification(null);
                                  addMessage("user", btn.label);
                                  const intent = detectIntent(btn.value);
                                  setDetectedIntent(intent);
                                  setDetectedSentiment(detectSentiment(btn.value));
                                  addMessage("assistant", buildResponse(btn.value, INTENT_RESPONSES[intent], userRole));
                                  setStep("triage_response");
                                  cancelPromptTimer();
                                }}
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {isTyping && (
                    <div className="chat-msg-enter flex gap-2 justify-start" data-testid="chat-typing-indicator">
                      <AssistantAvatar />
                      <div className="rounded-2xl rounded-tl-sm bg-slate-800/80 border border-white/5 px-4 py-3.5 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 typing-dot-1 inline-block" />
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 typing-dot-2 inline-block" />
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 typing-dot-3 inline-block" />
                      </div>
                    </div>
                  )}

                  {step === "submitted" && (
                    <div className="chat-msg-enter flex justify-center pt-2">
                      <div className="flex flex-col items-center gap-3 rounded-xl border border-green-500/20 bg-green-950/20 p-5 text-center max-w-[85%]">
                        <CheckCircle className="h-8 w-8 text-green-400" />
                        <p className="text-sm font-semibold text-green-300" data-testid="text-request-received">
                          Request Received
                        </p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Your request is pending review by our care team. For account-specific help, call (718) 328-2833.
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-300 mt-1">
                          <Phone className="h-3 w-3" />
                          <span>Questions? Call (718) 328-2833</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {identityPanel && (
                <section className="border-t border-white/10 bg-slate-900/90 px-3 py-3" aria-label={identityLanguage === "es" ? "Verificación segura" : "Secure verification"}>
                  <div className="mb-2 flex items-start gap-2">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <div>
                      <p className="text-sm font-semibold text-white">{identityLanguage === "es" ? "Verificación segura" : "Secure verification"}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                        {identityLanguage === "es"
                          ? "Sus datos se usan solo para esta verificación y nunca se agregan a la conversación."
                          : "Your details are used only for this verification and never added to the conversation."}
                      </p>
                    </div>
                  </div>
                  {identityPanel === "form" ? (
                    <form onSubmit={submitIdentityRequest} className="space-y-2">
                      <div className="flex justify-end gap-1" role="group" aria-label="Language">
                        <button type="button" onClick={() => setIdentityLanguage("en")} className={`rounded px-2 py-1 text-[10px] ${identityLanguage === "en" ? "bg-primary/20 text-primary" : "text-slate-400"}`}>English</button>
                        <button type="button" onClick={() => setIdentityLanguage("es")} className={`rounded px-2 py-1 text-[10px] ${identityLanguage === "es" ? "bg-primary/20 text-primary" : "text-slate-400"}`}>Español</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input aria-label={identityLanguage === "es" ? "Nombre" : "First name"} value={identityFirstName} onChange={(e) => { setIdentityFirstName(e.target.value); if (isSpanishText(e.target.value)) setIdentityLanguage("es"); }} placeholder={identityLanguage === "es" ? "Nombre" : "First name"} autoComplete="given-name" className="bg-slate-800/70 text-white placeholder:text-slate-400" />
                        <Input aria-label={identityLanguage === "es" ? "Apellido" : "Last name"} value={identityLastName} onChange={(e) => setIdentityLastName(e.target.value)} placeholder={identityLanguage === "es" ? "Apellido" : "Last name"} autoComplete="family-name" className="bg-slate-800/70 text-white placeholder:text-slate-400" />
                      </div>
                      <Input aria-label={identityLanguage === "es" ? "Fecha de nacimiento" : "Date of birth"} type="date" value={identityDob} onChange={(e) => setIdentityDob(e.target.value)} autoComplete="bday" className="bg-slate-800/70 text-white" />
                      <p className="text-[11px] text-slate-400">
                        {identityLanguage === "es" ? "Si los datos coinciden con una cuenta con correo electrónico, enviaremos un código." : "If the details match an account with email, we'll send a code."}
                      </p>
                      {identityError && <p role="alert" className="text-xs text-amber-300">{identityError}</p>}
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1" disabled={identityBusy || !identityFirstName.trim() || !identityLastName.trim() || !identityDob}>
                          {identityBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
                          {identityLanguage === "es" ? "Enviar código" : "Send secure code"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => { setIdentityPanel(null); clearIdentityFields(); }} className="text-slate-400">
                          {identityLanguage === "es" ? "Cancelar" : "Cancel"}
                        </Button>
                      </div>
                      <div className="flex justify-between pt-1 text-[11px]">
                        <button type="button" className="text-slate-400 underline-offset-2 hover:text-white hover:underline" onClick={() => setLocation("/login")}>{identityLanguage === "es" ? "Iniciar sesión" : "Sign in instead"}</button>
                        <a className="text-slate-400 underline-offset-2 hover:text-white hover:underline" href="tel:+17183282833">{identityLanguage === "es" ? "Llamar a la farmacia" : "Call the pharmacy"}</a>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={verifyIdentity} className="space-y-2">
                      <p className="text-xs leading-relaxed text-slate-300">{identityMessage}</p>
                      <Input aria-label={identityLanguage === "es" ? "Código de seis dígitos" : "Six-digit code"} value={identityCode} onChange={(e) => setIdentityCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className="bg-slate-800/70 text-center text-lg tracking-[0.35em] text-white placeholder:text-slate-500" />
                      {identityError && <p role="alert" className="text-xs text-amber-300">{identityError}</p>}
                      <Button type="submit" className="w-full" disabled={identityBusy || identityCode.length !== 6}>
                        {identityBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                        {identityLanguage === "es" ? "Verificar" : "Verify"}
                      </Button>
                      <div className="flex items-center justify-between text-[11px]">
                        <button type="button" onClick={handleReset} className="text-slate-400 hover:text-white">{identityLanguage === "es" ? "Comenzar de nuevo" : "Start over"}</button>
                        <button type="button" disabled={identityBusy || resendNow < resendAt} onClick={resendIdentity} className="text-slate-400 disabled:opacity-50">
                          {resendNow < resendAt
                            ? `${identityLanguage === "es" ? "Reenviar en" : "Resend in"} ${Math.ceil((resendAt - resendNow) / 1000)}s`
                            : (identityLanguage === "es" ? "Reenviar código" : "Resend code")}
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              )}

              {step === "pain_point" && !identityPanel && (
                <div className="border-t border-white/10 px-3 pt-2.5 pb-3 space-y-2">
                  <p className="text-xs text-slate-300 font-medium uppercase tracking-wide">Quick topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "Forgetting doses", value: "I keep forgetting to take my medications", icon: Package },
                      { label: "Switch pharmacy", value: "I want to switch from my current pharmacy", icon: Repeat },
                      { label: "Delivery request", value: "I need medication delivery to my home", icon: Truck },
                      { label: "Insurance help", value: "I need help with my insurance coverage and copays", icon: Shield },
                      { label: "New prescription", value: "My doctor sent in a new prescription", icon: Pill },
                      { label: "Specialty meds", value: "I need help with specialty medications", icon: Pill },
                      { label: "Cost savings", value: "My medications are too expensive, I need help with cost", icon: CreditCard },
                      { label: "Refill setup", value: "I want to set up automatic refills so I never run out", icon: Clock },
                      { label: "LTC partnership", value: "I manage a long-term care facility and need pharmacy services", icon: Building2 },
                    ].map((q) => (
                      <button
                        key={q.value}
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-700/40 px-3 py-2.5 text-xs text-slate-300 transition-all hover:bg-slate-700/70 hover:border-white/20 hover:text-white"
                        onClick={() => {
                          setUserChallenge(q.value);
                          addMessage("user", q.value);
                          const intent = detectIntent(q.value);
                          setDetectedIntent(intent);
                          setDetectedSentiment(detectSentiment(q.value));
                          addMessage("assistant", buildResponse(q.value, INTENT_RESPONSES[intent], userRole));
                          setStep("triage_response");
                          cancelPromptTimer();
                          promptTimerRef.current = setTimeout(() => {
                            addMessage(
                              "assistant",
                              "By the way, would you prefer a delivery request or pickup? Pharmacy staff confirm delivery availability and timing for each request."
                            );
                            setStep("address_capture");
                          }, 1200);
                        }}
                        data-testid={`button-quick-${q.label.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        <q.icon className="h-3 w-3 text-primary shrink-0" />
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "address_capture" && (
                <div className="border-t border-white/10 px-3 pt-2.5 pb-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <MapPin className="h-3 w-3 text-primary" />
                    {conversationLanguage === "en" ? "Delivery or in-store pickup?" : conversationLanguage === "es" ? "¿Entrega o recoger en la farmacia?" : "Delivery or pickup? / ¿Entrega o recoger?"}
                  </div>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-700/40 px-3 py-1.5 text-xs text-slate-300 transition-all hover:bg-slate-700/70 hover:text-white"
                      onClick={() => {
                        setDeliveryType("pickup");
                        setDeliveryAddress("");
                        setDeliveryAddressSelection(null);
                        setApartmentUnit("");
                        setPickupWindow("");
                        addMessage("user", conversationLanguage === "en" ? "I'll pick up in person" : "Recogeré en la farmacia");
                        resetStallTimer();
                        addMessage(
                          "assistant",
                          localizedPair(conversationLanguage, "Pickup works. What pickup window would you like to request? Pharmacy staff will confirm the final time.", "Puede recogerlo. ¿Qué horario desea solicitar? El personal de la farmacia confirmará la hora final.")
                        );
                        setStep("pickup_time");
                      }}
                      data-testid="button-pickup-option"
                    >
                      <Package className="h-3 w-3 text-primary" />
                      {conversationLanguage === "en" ? "I'll pick up" : "Recogeré"}
                    </button>
                  </div>
                   <form onSubmit={handleAddressSubmit} className="space-y-2">
                     <AddressAutocompleteInput
                       id="chat-delivery-address"
                       value={deliveryAddress}
                       onChange={setDeliveryAddress}
                       onVerificationChange={setDeliveryAddressSelection}
                       placeholder={conversationLanguage === "en" ? "Select your delivery address..." : "Seleccione su dirección de entrega..."}
                       required
                       dataTestId="input-delivery-address"
                     />
                     <Input
                       aria-label={conversationLanguage === "en" ? "Apartment or unit (optional)" : "Apartamento o unidad (opcional)"}
                       value={apartmentUnit}
                       onChange={(e) => setApartmentUnit(e.target.value)}
                       placeholder={conversationLanguage === "en" ? "Apartment or unit (optional)" : "Apartamento o unidad (opcional)"}
                       className="text-sm bg-slate-800/50 border-white/10 text-white placeholder:text-slate-300 focus-visible:ring-primary/30"
                       data-testid="input-delivery-unit"
                     />
                    <Button
                      type="submit"
                       size="sm"
                      aria-label={conversationLanguage === "en" ? "Submit delivery address" : "Enviar dirección de entrega"}
                       disabled={!deliveryAddress.trim() || !deliveryAddressSelection}
                       className="w-full"
                      data-testid="button-submit-address"
                    >
                       <Send aria-hidden="true" className="h-4 w-4 mr-2" />
                       {conversationLanguage === "en" ? "Continue" : "Continuar"}
                    </Button>
                  </form>
                </div>
              )}

              {step === "pickup_time" && (
                <div className="border-t border-white/10 px-3 pt-2.5 pb-3 space-y-2">
                  <p className="text-xs text-slate-300 font-medium">{conversationLanguage === "en" ? "Requested pickup window" : "Horario solicitado para recoger"}</p>
                  <div className="grid grid-cols-1 gap-2">
                    {(conversationLanguage === "en"
                      ? ["Next available", "Today after 4 PM", "Tomorrow morning"]
                      : ["Próximo disponible", "Hoy después de las 4 PM", "Mañana por la mañana"]
                    ).filter(window => !isPastPickupWindow(window)).map((window) => (
                      <button
                        key={window}
                        type="button"
                        className="rounded-lg border border-white/10 bg-slate-700/40 px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-slate-700/70"
                        onClick={() => {
                          if (isPastPickupWindow(window)) {
                            addMessage("assistant", localizedPair(conversationLanguage, "That time has already passed in New York. Please choose a future pickup window. Nothing has been confirmed.", "Esa hora ya pasó en Nueva York. Elija un horario futuro para recoger. Nada está confirmado."));
                            return;
                          }
                          setPickupWindow(window);
                          addMessage("user", conversationLanguage === "en" ? `Requested pickup: ${window}` : `Horario solicitado: ${window}`);
                          addMessage("assistant", localizedPair(conversationLanguage, "Thanks. This is a requested window, not a confirmed appointment. Please provide your contact details securely so staff can confirm it.", "Gracias. Este es un horario solicitado, no una cita confirmada. Proporcione sus datos de contacto de forma segura para que el personal pueda confirmarlo."));
                          setStep("lead_capture");
                        }}
                        data-testid={`button-pickup-window-${window.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {window}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "review" && (
                <div className="border-t border-white/10 px-3 pt-2.5 pb-3 space-y-3" data-testid="concierge-review">
                  <div className="rounded-lg border border-amber-400/40 bg-amber-950/30 p-3">
                    <p className="text-sm font-semibold text-amber-200">Pending — Staff confirmation required</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
                      This sends a request for review only. Stock, prescription processing, service area, and timing are not confirmed.
                    </p>
                  </div>
                  <div className="space-y-2 text-xs text-slate-200">
                    <div><span className="text-slate-400">Requester / patient:</span> {selectedPatient ? `Caregiver request for ${selectedPatient.firstName || ""} ${selectedPatient.lastName || ""}`.trim() : patientAuthReady && user ? `Signed-in patient ${(user as { firstName?: string; lastName?: string }).firstName || ""} ${(user as { firstName?: string; lastName?: string }).lastName || ""}`.trim() : "Guest requester / not linked to a patient account"}</div>
                    <div><span className="text-slate-400">Catalog items:</span> {requestedItems.length ? requestedItems.map((item) => item.name).join(", ") : "None matched"}</div>
                    <div><span className="text-slate-400">Pending item text:</span> {pendingRequestedItems.length ? pendingRequestedItems.join(", ") : "None"}</div>
                    <div><span className="text-slate-400">Pharmacy service / medication intent:</span> {userChallenge.trim() || detectedIntent || "Pharmacy assistance"}</div>
                    <div><span className="text-slate-400">Fulfillment:</span> {deliveryType === "pickup" ? `Pickup — requested window: ${pickupWindow}` : `Delivery — ${deliveryAddress}${apartmentUnit.trim() ? `, ${apartmentUnit.trim()}` : ""}`}</div>
                    <div><span className="text-slate-400">Contact channel:</span> {contactPhone.trim() ? "Phone provided" : ""}{contactEmail.trim() ? " and email provided" : ""}; values kept out of chat transcript</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setStep(deliveryType === "pickup" ? "pickup_time" : "address_capture"); }} data-testid="button-edit-fulfillment">Edit fulfillment</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setStep("lead_capture")} data-testid="button-edit-contact">Edit contact</Button>
                  </div>
                  <Button type="button" className="w-full" onClick={handleFinalConfirm} disabled={isSubmitting} data-testid="button-confirm-send-pending">
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Confirm and send pending request
                  </Button>
                </div>
              )}

              {step === "lead_capture" && (
                <form onSubmit={handleLeadSubmit} className="border-t border-white/10 px-3 pt-2.5 pb-3 space-y-2">
                  <p className="text-xs text-slate-300 font-medium uppercase tracking-wide">
                    {callRequested
                      ? storeOpen
                        ? "So we can call you:"
                        : "We'll call you when we open:"
                      : "So we can reach you:"}
                  </p>
                  <div className="space-y-2">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                      <Input
                        aria-label="Your name"
                        aria-describedby="chat-contact-privacy-instructions"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Your name"
                        className="pl-9 text-sm bg-slate-800/50 border-white/10 text-white placeholder:text-slate-300 focus-visible:ring-primary/30"
                        required
                        data-testid="input-contact-name"
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                      <Input
                        aria-label="Phone number"
                        aria-describedby="chat-contact-privacy-instructions"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="Phone number"
                        type="tel"
                        maxLength={10}
                        inputMode="numeric"
                        className="pl-9 text-sm bg-slate-800/50 border-white/10 text-white placeholder:text-slate-300 focus-visible:ring-primary/30"
                        required
                        data-testid="input-contact-phone"
                      />
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                      <Input
                        aria-label="Email address (optional)"
                        aria-describedby="chat-contact-privacy-instructions"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="Email (optional)"
                        type="email"
                        className="pl-9 text-sm bg-slate-800/50 border-white/10 text-white placeholder:text-slate-300 focus-visible:ring-primary/30"
                        data-testid="input-contact-email"
                      />
                    </div>
                  </div>
                  <p id="chat-contact-privacy-instructions" className="text-[11px] text-slate-400 leading-relaxed">
                    Please do not enter DOB, insurance or member IDs, prescription numbers, or sensitive clinical details. / No comparta fecha de nacimiento, identificación del seguro, números de receta ni detalles clínicos sensibles. Llame a la farmacia para ayuda específica de su cuenta.
                  </p>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!contactName.trim() || !contactPhone.trim() || isSubmitting}
                    data-testid="button-submit-lead"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : callRequested ? (
                      <PhoneCall className="h-4 w-4 mr-2" />
                    ) : (
                      <Heart className="h-4 w-4 mr-2" />
                    )}
                    Review pending request
                  </Button>
                </form>
              )}

              {step === "restock_notify" && (
                <form onSubmit={handleRestockNotifySubmit} className="border-t border-white/10 px-3 pt-2.5 pb-3 space-y-2">
                  <p className="text-xs text-slate-300 font-medium uppercase tracking-wide">Get notified when it's back:</p>
                  <div className="space-y-2">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                      <Input
                        aria-label="Name for restock notification (optional)"
                        value={restockName}
                        onChange={(e) => setRestockName(e.target.value)}
                        placeholder="Your name (optional)"
                        className="pl-9 text-sm bg-slate-800/50 border-white/10 text-white placeholder:text-slate-300 focus-visible:ring-primary/30"
                        data-testid="input-restock-name"
                      />
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                      <Input
                        aria-label="Email address for restock notification"
                        value={restockEmail}
                        onChange={(e) => setRestockEmail(e.target.value)}
                        placeholder="Email address"
                        type="email"
                        className="pl-9 text-sm bg-slate-800/50 border-white/10 text-white placeholder:text-slate-300 focus-visible:ring-primary/30"
                        data-testid="input-restock-email"
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                      <Input
                        aria-label="Phone number for restock notification (optional)"
                        value={restockPhone}
                        onChange={(e) => setRestockPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="Phone number (optional)"
                        type="tel"
                        inputMode="numeric"
                        className="pl-9 text-sm bg-slate-800/50 border-white/10 text-white placeholder:text-slate-300 focus-visible:ring-primary/30"
                        data-testid="input-restock-phone"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={(!restockEmail.trim() && !restockPhone.trim()) || restockSubmitting}
                    data-testid="button-submit-restock-notify"
                  >
                    {restockSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <BellRing className="h-4 w-4 mr-2" />
                    )}
                    Alert Me When It's Back
                  </Button>
                </form>
              )}

              {step !== "chat_or_call" && step !== "restock_notify" && step !== "review" && (
                <div className={`${step === "lead_capture" || step === "address_capture" ? "" : "border-t border-white/10"} px-3 py-2.5`}>
                  <div className="flex gap-2 items-center rounded-xl bg-slate-800/50 border border-white/10 px-3 focus-within:border-primary/40 transition-colors">
                    <input
                      aria-label={step === "pain_point" ? "Describe what is on your mind" : "Chat message"}
                      value={step === "pain_point" ? userChallenge : freeText}
                      onChange={(e) => {
                        if (step === "pain_point") {
                          setUserChallenge(e.target.value);
                        } else {
                          setFreeText(e.target.value);
                        }
                      }}
                      placeholder={step === "pain_point" ? "Tell me what's on your mind..." : "Ask me anything..."}
                      className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-300 outline-none py-3 min-w-0"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (step === "pain_point") {
                            handlePainPointSubmit(e);
                          } else {
                            handleFreeTextSubmit(e);
                          }
                        }
                      }}
                      data-testid="input-chat-message"
                    />
                    <button
                      type="button"
                      aria-label={step === "pain_point" ? "Submit response" : "Send chat message"}
                      disabled={step === "pain_point" ? !userChallenge.trim() : !freeText.trim()}
                      onClick={(e) => {
                        if (step === "pain_point") {
                          handlePainPointSubmit(e);
                        } else {
                          handleFreeTextSubmit(e);
                        }
                      }}
                      className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white transition-all hover:bg-primary disabled:opacity-30 disabled:pointer-events-none shrink-0"
                      data-testid="button-send-message"
                    >
                      <Send aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                    Please do not enter DOB, insurance or member IDs, prescription numbers, or sensitive clinical details. / No comparta fecha de nacimiento, identificación del seguro, números de receta ni detalles clínicos sensibles. Llame a la farmacia para ayuda específica de su cuenta.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );

  return createPortal(chatContent, document.body);
}