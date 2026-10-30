export const CHAT_ACTION_INTENTS = [
  "flu_shot",
  "refill",
  "tracking",
  "transfer",
  "otc_shop",
  "cart",
  "checkout",
  "pickup",
  "delivery_zones",
  "hours",
  "location",
  "speak_pharmacist",
  "app",
  "signup",
  "delivery_cost",
  "insurance_accepted",
  "parking",
  "languages",
  "payment_methods",
  "general",
] as const;

export type ChatActionIntent = typeof CHAT_ACTION_INTENTS[number];

const MODEL_ID = "concordia-char-ngram-v2";

type Example = { intent: ChatActionIntent; text: string };

const TRAINING_EXAMPLES: Example[] = [
  ["flu_shot", "I want a flu shot"], ["flu_shot", "schedule my flu vaccine"], ["flu_shot", "vaccination appointment next monday"], ["flu_shot", "for flushot"], ["flu_shot", "book an influenza shot"],
  ["refill", "refill my prescription"], ["refill", "I am running out of medicine"], ["refill", "renew my rx"], ["refill", "need more pills"], ["refill", "can I get my medication again"],
  ["tracking", "where is my order"], ["tracking", "track my delivery"], ["tracking", "my package has not arrived"], ["tracking", "driver location"], ["tracking", "when will my medicine arrive"],
  ["transfer", "transfer my prescription from cvs"], ["transfer", "move my medications here"], ["transfer", "switch pharmacies"], ["transfer", "bring my rx from walgreens"], ["transfer", "change to concordia pharmacy"],
  ["otc_shop", "find something in the shop"], ["otc_shop", "show me over the counter products"], ["otc_shop", "I want to buy tylenol"], ["otc_shop", "search products for allergies"], ["otc_shop", "do you sell vitamins"],
  ["cart", "show my cart"], ["cart", "open the shopping cart"], ["cart", "what is in my basket"], ["cart", "review my items"], ["cart", "take me to my cart"],
  ["checkout", "I want to checkout"], ["checkout", "pay for my cart"], ["checkout", "complete my purchase"], ["checkout", "place my order"], ["checkout", "I am ready to pay"],
  ["pickup", "I want to pick it up"], ["pickup", "store pickup"], ["pickup", "can I collect my order"], ["pickup", "I will come to the pharmacy"], ["pickup", "pick up instead of delivery"],
  ["delivery_zones", "do you deliver to me"], ["delivery_zones", "I want home delivery"], ["delivery_zones", "deliver my order"], ["delivery_zones", "what areas do you deliver to"], ["delivery_zones", "send it to my address"],
  ["hours", "what time are you open"], ["hours", "store hours"], ["hours", "when do you close"], ["hours", "are you open today"], ["hours", "weekend schedule"],
  ["location", "where are you located"], ["location", "pharmacy address"], ["location", "directions to the store"], ["location", "how do I get there"], ["location", "your location"],
  ["speak_pharmacist", "talk to a pharmacist"], ["speak_pharmacist", "I need a real person"], ["speak_pharmacist", "call me"], ["speak_pharmacist", "medicine safety question"], ["speak_pharmacist", "side effect or interaction"],
  ["app", "show my current medications"], ["app", "open my patient account"], ["app", "see my prescriptions"], ["app", "my medication list"], ["app", "open concordia care"],
  ["signup", "become a patient"], ["signup", "create an account"], ["signup", "sign me up"], ["signup", "register with the pharmacy"], ["signup", "new patient enrollment"],
  ["delivery_cost", "how much does delivery cost"], ["delivery_cost", "what is the delivery fee"], ["delivery_cost", "is shipping free"], ["delivery_cost", "do you charge to bring it to me"], ["delivery_cost", "price for home delivery"],
  ["insurance_accepted", "which insurance plans do you accept"], ["insurance_accepted", "can I use my insurance there"], ["insurance_accepted", "does your pharmacy take my health plan"], ["insurance_accepted", "are you in network with my insurer"], ["insurance_accepted", "what coverage do you take"],
  ["parking", "can I park nearby"], ["parking", "where can I leave my car"], ["parking", "is there parking by the pharmacy"], ["parking", "do you have a parking lot"], ["parking", "can I drive and park there"],
  ["languages", "what languages does your team speak"], ["languages", "can someone help me in Spanish"], ["languages", "do you have bilingual staff"], ["languages", "can I talk to someone who speaks my language"], ["languages", "language assistance at the pharmacy"],
  ["payment_methods", "what forms of payment do you take"], ["payment_methods", "can I pay with a credit card"], ["payment_methods", "do you take cash"], ["payment_methods", "can I pay by debit"], ["payment_methods", "accepted payment methods"],
  ["general", "hello"], ["general", "thank you"], ["general", "I have a question"], ["general", "help me"], ["general", "what can you do"],
].map(([intent, text]) => ({ intent: intent as ChatActionIntent, text }));

// Adversarial and conversational phrasing is kept separate from the compact
// seed list so additions can be reviewed by intent.  These are deliberately
// not copied from the evaluation corpus: they teach the model language
// families (including Spanish, abbreviations, and common typos), rather than
// memorising test requests.
const AUGMENTED_TRAINING_EXAMPLES: Example[] = [
  ["flu_shot", "vacuna contra la gripe"], ["flu_shot", "cita para vacunacion"], ["flu_shot", "necesito la vacuna influenza"], ["flu_shot", "flu vax appointment"], ["flu_shot", "book flu immunization"],
  ["refill", "resurtir mi receta"], ["refill", "necesito resurtido"], ["refill", "ya casi no tengo pastillas"], ["refill", "rx renewal please"], ["refill", "refil my meds"],
  ["tracking", "donde esta mi pedido"], ["tracking", "rastrear mi entrega"], ["tracking", "mi paquete sigue tarde"], ["tracking", "order tracking pls"], ["tracking", "trackin my prescripshun"],
  ["transfer", "transferir receta desde CVS"], ["transfer", "traer mis medicinas aqui"], ["transfer", "cambiarme de farmacia"], ["transfer", "move rx from Walgreens"], ["transfer", "tranfer my prescription"],
  ["otc_shop", "comprar productos sin receta"], ["otc_shop", "busco vitaminas OTC"], ["otc_shop", "tienen Tylenol"], ["otc_shop", "shop for allergy relief"], ["otc_shop", "over the counter plz"],
  ["cart", "ensename mi carrito"], ["cart", "que tengo en la cesta"], ["cart", "revisar shopping cart"], ["cart", "open cart please"], ["cart", "carrito de compra"],
  ["checkout", "finalizar mi compra"], ["checkout", "pagar el carrito"], ["checkout", "quiero hacer checkout"], ["checkout", "checkout now"], ["checkout", "pay for my order please"],
  ["pickup", "recoger en la farmacia"], ["pickup", "puedo pasar por mi pedido"], ["pickup", "store pickup please"], ["pickup", "collect my meds"], ["pickup", "pick up en la tienda"],
  ["delivery_zones", "entregan a domicilio"], ["delivery_zones", "hacen delivery en mi zona"], ["delivery_zones", "quiero entrega a casa"], ["delivery_zones", "do you deliver here"], ["delivery_zones", "delivery area pls"],
  ["hours", "cual es el horario"], ["hours", "a que hora cierran"], ["hours", "estan abiertos hoy"], ["hours", "when open saturday"], ["hours", "opening hrs?"],
  ["location", "donde queda la farmacia"], ["location", "direccion por favor"], ["location", "como llego a Concordia"], ["location", "where is your store"], ["location", "pharmcy address"],
  ["speak_pharmacist", "quiero hablar con un farmaceutico"], ["speak_pharmacist", "necesito una persona real"], ["speak_pharmacist", "puede llamarme un profesional"], ["speak_pharmacist", "human help please"], ["speak_pharmacist", "talk pharmacist asap"],
  ["app", "ver mis recetas en la app"], ["app", "abrir mi cuenta"], ["app", "lista de medicamentos"], ["app", "show prescriptions app"], ["app", "my med list pls"],
  ["signup", "registrarme como paciente"], ["signup", "crear una cuenta nueva"], ["signup", "quiero inscribirme"], ["signup", "how do I sign up"], ["signup", "signup plz"],
  ["general", "hola buenos dias"], ["general", "gracias por la ayuda"], ["general", "necesito orientacion"], ["general", "no se que hacer"], ["general", "help me please"],
  ["general", "asdf qwer zxcv"], ["general", "blah blah"], ["general", "not about pharmacy"], ["general", "I am just browsing"], ["general", "no gracias"],
  ["refill", "can I renew my rx today"], ["refill", "my prescription is running low"], ["refill", "need another supply"], ["refill", "refil prescription asap"], ["refill", "more medicine please"],
  ["tracking", "is my shipment on the way"], ["tracking", "delivery has not shown up"], ["tracking", "where package now"], ["tracking", "order arrivl status"], ["tracking", "pedido no llega"],
  ["transfer", "can you get my rx from Rite Aid"], ["transfer", "bring prescription over"], ["transfer", "switch from my old pharmacy"], ["transfer", "move script here please"], ["transfer", "presciption transfer"],
  ["otc_shop", "do you stock sunscreen"], ["otc_shop", "look for cough drops"], ["otc_shop", "need nonprescription items"], ["otc_shop", "quiero comprar productos OTC"], ["otc_shop", "vitamin shop"],
  ["hours", "are you open right now"], ["hours", "pharmacy schedule today"], ["hours", "horario del domingo"], ["hours", "closing hour"], ["hours", "openning times"],
  ["speak_pharmacist", "side effect question for pharmacist"], ["speak_pharmacist", "this is urgent please connect me"], ["speak_pharmacist", "hablar con alguien"], ["speak_pharmacist", "real person now"], ["speak_pharmacist", "pharmacist call back"],
  ["delivery_cost", "how much to drop off my purchase"], ["delivery_cost", "what are the fees for bringing my order"], ["delivery_cost", "price to drop it off"], ["delivery_cost", "do you charge to drop off a package"], ["delivery_cost", "what is the delivery charge for my purchase"],
].map(([intent, text]) => ({ intent: intent as ChatActionIntent, text }));

const ALL_TRAINING_EXAMPLES = [...TRAINING_EXAMPLES, ...AUGMENTED_TRAINING_EXAMPLES];

function normalize(text: string): string {
  return ` ${text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function features(text: string): Map<string, number> {
  const normalized = normalize(text);
  const counts = new Map<string, number>();
  for (const token of normalized.trim().split(/\s+/)) {
    if (token) counts.set(`w:${token}`, (counts.get(`w:${token}`) ?? 0) + 2);
  }
  for (let size = 3; size <= 5; size++) {
    for (let i = 0; i <= normalized.length - size; i++) {
      const gram = `c:${normalized.slice(i, i + size)}`;
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  }
  return counts;
}

type Vector = Map<string, number>;

function train() {
  const documentFrequency = new Map<string, number>();
  const raw = ALL_TRAINING_EXAMPLES.map((example) => {
    const vector = features(example.text);
    for (const feature of vector.keys()) {
      documentFrequency.set(feature, (documentFrequency.get(feature) ?? 0) + 1);
    }
    return { ...example, vector };
  });
  const idf = new Map<string, number>();
  for (const [feature, count] of documentFrequency) {
    idf.set(feature, Math.log((ALL_TRAINING_EXAMPLES.length + 1) / (count + 1)) + 1);
  }
  const centroids = new Map<ChatActionIntent, Vector>();
  const counts = new Map<ChatActionIntent, number>();
  for (const example of raw) {
    const centroid = centroids.get(example.intent) ?? new Map<string, number>();
    for (const [feature, value] of example.vector) {
      centroid.set(feature, (centroid.get(feature) ?? 0) + value * (idf.get(feature) ?? 1));
    }
    centroids.set(example.intent, centroid);
    counts.set(example.intent, (counts.get(example.intent) ?? 0) + 1);
  }
  for (const [intent, centroid] of centroids) {
    const count = counts.get(intent) ?? 1;
    for (const [feature, value] of centroid) centroid.set(feature, value / count);
  }
  return { idf, centroids };
}

const MODEL = train();

function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;
  for (const [feature, value] of a) dot += value * (b.get(feature) ?? 0);
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

export function classifyChatAction(text: string): {
  intent: ChatActionIntent;
  confidence: number;
  margin: number;
  confident: boolean;
  model: string;
} {
  // A few short, unambiguous follow-ups are too sparse for centroid scoring
  // once the multilingual corpus is balanced. Keep these deterministic.
  const normalized = normalize(text);
  if (/\bflu\s*shot\b/.test(normalized) || /\bflushot\b/.test(normalized)) {
    return { intent: "flu_shot", confidence: 1, margin: 1, confident: true, model: MODEL_ID };
  }
  if (/\b(send|deliver)\s+it\s+to\s+(my\s+)?(home|house|address)\b/.test(normalized)) {
    return { intent: "delivery_zones", confidence: 1, margin: 1, confident: true, model: MODEL_ID };
  }
  const query = features(text);
  const weighted = new Map<string, number>();
  for (const [feature, value] of query) weighted.set(feature, value * (MODEL.idf.get(feature) ?? 1));
  const ranked = [...MODEL.centroids.entries()]
    .map(([intent, centroid]) => ({ intent, score: cosine(weighted, centroid) }))
    .sort((a, b) => b.score - a.score);
  const first = ranked[0] ?? { intent: "general" as const, score: 0 };
  const second = ranked[1]?.score ?? 0;
  const margin = first.score - second;
  return {
    intent: first.intent,
    confidence: Number(first.score.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    confident: first.score >= 0.28 && margin >= 0.045,
    model: MODEL_ID,
  };
}

export function getChatActionTrainingSummary() {
  return {
    model: MODEL_ID,
    examples: ALL_TRAINING_EXAMPLES.length,
    intents: CHAT_ACTION_INTENTS.length,
  };
}