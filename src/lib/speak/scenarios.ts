import { extractJsonFromAiText } from "@/lib/ai/json-parser";

export interface MadridRoleplayScenario {
  id: string;
  title: string;
  category: "Life in Madrid" | "Business" | "City Boss";
  cefr: string;
  characterName: string;
  characterRole: string;
  city: string;
  weekBoss?: number;
  emoji: string;
  setting: string;
  openingLineEs: string;
  openingLineEn: string;
  goalEn: string;
}

export const MADRID_ROLEPLAY_SCENARIOS: MadridRoleplayScenario[] = [
  {
    id: "madrid-cafe",
    title: "Order Coffee & Tostada",
    category: "City Boss",
    cefr: "A1",
    characterName: "Carlos",
    characterRole: "Barista in Malasaña, Madrid",
    city: "Madrid",
    weekBoss: 1,
    emoji: "☕",
    setting: "A busy morning café on Calle del Pez in Madrid.",
    openingLineEs: "¡Buenos días! ¿Qué te pongo hoy? Tenemos café recién hecho y tostadas con tomate.",
    openingLineEn: "Good morning! What can I get you today? We have fresh coffee and toast with tomato.",
    goalEn: "Order a drink and food politely, ask for the bill, and say thank you.",
  },
  {
    id: "madrid-bank",
    title: "Open a Bank Account",
    category: "City Boss",
    cefr: "A2",
    characterName: "Lucía",
    characterRole: "Bank advisor in Salamanca, Madrid",
    city: "Zaragoza",
    weekBoss: 8,
    emoji: "🏦",
    setting: "A bank branch in Madrid. You want to open a personal account with your passport/NIE.",
    openingLineEs: "Hola, buenos días. Siéntate, por favor. ¿Qué tipo de cuenta bancaria quieres abrir?",
    openingLineEn: "Hello, good morning. Please sit down. What kind of bank account do you want to open?",
    goalEn: "Explain you live in Madrid, ask about monthly fees, and mention your NIE/passport.",
  },
  {
    id: "madrid-nie",
    title: "NIE / TIE Appointment",
    category: "Life in Madrid",
    cefr: "A2",
    characterName: "Inspector Ruiz",
    characterRole: "Extranjería officer in Aluche",
    city: "Madrid",
    emoji: "🪪",
    setting: "Police station (Extranjería) for your Spanish residency card (TIE) fingerprints.",
    openingLineEs: "Siguiente, por favor. ¿Tienes cita previa? Dame tu pasaporte y el formulario EX-17.",
    openingLineEn: "Next, please. Do you have an appointment? Give me your passport and the EX-17 form.",
    goalEn: "Confirm your appointment, hand over documents, and ask when your card will be ready.",
  },
  {
    id: "madrid-gestoria",
    title: "Call a Gestoría",
    category: "Life in Madrid",
    cefr: "A2-B1",
    characterName: "Elena",
    characterRole: "Tax & autónomo advisor in Madrid",
    city: "Madrid",
    emoji: "📑",
    setting: "Phone call with a Spanish gestoría to ask about registering as autónomo or taxes.",
    openingLineEs: "Gestoría Serrano, buenas tardes, le atiende Elena. ¿En qué puedo ayudarle?",
    openingLineEn: "Gestoría Serrano, good afternoon, Elena speaking. How can I help you?",
    goalEn: "Ask about their monthly fee and what documents they need to help with your taxes.",
  },
  {
    id: "madrid-landlord",
    title: "Rent a Flat in Madrid",
    category: "City Boss",
    cefr: "A2-B1",
    characterName: "Javier",
    characterRole: "Flat owner in Chamberí",
    city: "Valencia",
    weekBoss: 10,
    emoji: "🏠",
    setting: "Visiting a 1-bedroom apartment in Chamberí with the landlord.",
    openingLineEs: "¡Hola! Pasa, pasa. Este es el salón y ahí tienes la cocina. ¿Qué te parece el piso?",
    openingLineEn: "Hi! Come in. This is the living room and there's the kitchen. What do you think of the flat?",
    goalEn: "Ask about deposit (fianza), bills (gastos), contract length, and move-in date.",
  },
  {
    id: "madrid-doctor",
    title: "Doctor's Appointment",
    category: "City Boss",
    cefr: "B1",
    characterName: "Dra. Morales",
    characterRole: "Family doctor at Centro de Salud",
    city: "Granada",
    weekBoss: 11,
    emoji: "🩺",
    setting: "A clinic consultation in Madrid. You have had a sore throat and fever for two days.",
    openingLineEs: "Buenos días. Cuéntame, ¿qué síntomas tienes y desde cuándo te encuentras mal?",
    openingLineEn: "Good morning. Tell me, what symptoms do you have and since when have you felt unwell?",
    goalEn: "Describe your symptoms, answer how long it's lasted, and ask for a prescription.",
  },
  {
    id: "biz-powerbank-pitch",
    title: "Pitch Powerbank Station to a Bar",
    category: "City Boss",
    cefr: "B1",
    characterName: "Manolo",
    characterRole: "Owner of a busy tapas bar in La Latina",
    city: "Sevilla",
    weekBoss: 12,
    emoji: "🔋",
    setting: "Pitching a free shared powerbank charging station to a skeptical Madrid bar owner.",
    openingLineEs: "A ver, dime rápido que tengo mucha gente en la barra. ¿Qué me quieres vender?",
    openingLineEn: "Alright, tell me quickly because I have a lot of people at the bar. What are you selling me?",
    goalEn: "Explain it costs €0 for the bar, keeps customers longer, and ask to install it this week.",
  },
  {
    id: "biz-supplier",
    title: "Negotiate with a Supplier",
    category: "Business",
    cefr: "B1",
    characterName: "Marta",
    characterRole: "Wholesale account manager",
    city: "Barcelona",
    weekBoss: 9,
    emoji: "🤝",
    setting: "Negotiating unit pricing and delivery timelines for a 200-unit order.",
    openingLineEs: "Gracias por venir. Para un pedido de cien unidades el precio es de veinticinco euros cada una.",
    openingLineEn: "Thanks for coming. For an order of 100 units the price is 25 euros each.",
    goalEn: "Ask for a discount for 200 units and confirm delivery time to Madrid.",
  },
  {
    id: "biz-lawyer",
    title: "Meeting with a Lawyer",
    category: "Business",
    cefr: "B1",
    characterName: "Alejandro",
    characterRole: "Commercial lawyer in Castellana",
    city: "Madrid",
    emoji: "⚖️",
    setting: "Reviewing a Spanish SL company contract and venue partnership terms.",
    openingLineEs: "Encantado. He revisado el borrador del contrato. ¿Qué cláusula te preocupa más?",
    openingLineEn: "Pleased to meet you. I've reviewed the draft contract. Which clause concerns you most?",
    goalEn: "Ask about liability, cancellation notice, and when you can sign the final version.",
  },
];

export interface SpeakTurnResult {
  userTranscript: string;
  replyEs: string;
  replyEn: string;
  quickHintEn?: string;
  correctionSuggestion?: string;
  goalCompleted?: boolean;
}

export interface SpeakSummaryResult {
  score: number; // 0..100
  summaryEn: string;
  corrections: {
    category: string;
    wrong: string;
    correct: string;
    explanation: string;
  }[];
  usefulPhrases: {
    es: string;
    en: string;
  }[];
}

export function parseSpeakTurnJson(
  rawText: string,
  fallbackUserText: string
): SpeakTurnResult {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  return {
    userTranscript:
      typeof parsed.userTranscript === "string" && parsed.userTranscript.trim()
        ? parsed.userTranscript.trim()
        : fallbackUserText,
    replyEs:
      typeof parsed.replyEs === "string" && parsed.replyEs.trim()
        ? parsed.replyEs.trim()
        : "¡Vale! ¿Puedes repetirme eso un poco más despacio, por favor?",
    replyEn:
      typeof parsed.replyEn === "string" ? parsed.replyEn.trim() : "",
    quickHintEn:
      typeof parsed.quickHintEn === "string" && parsed.quickHintEn.trim()
        ? parsed.quickHintEn.trim()
        : undefined,
    correctionSuggestion:
      typeof parsed.correctionSuggestion === "string" &&
      parsed.correctionSuggestion.trim()
        ? parsed.correctionSuggestion.trim()
        : undefined,
    goalCompleted: Boolean(parsed.goalCompleted),
  };
}

export function parseSpeakSummaryJson(rawText: string): SpeakSummaryResult {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  const rawScore = Number(parsed.score);
  const score = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : 78;

  const corrections = Array.isArray(parsed.corrections)
    ? (parsed.corrections as Record<string, unknown>[])
        .slice(0, 3)
        .map((c) => ({
          category: String(c.category ?? "grammar").trim(),
          wrong: String(c.wrong ?? "").trim(),
          correct: String(c.correct ?? "").trim(),
          explanation: String(c.explanation ?? "").trim(),
        }))
        .filter((c) => c.wrong && c.correct)
    : [];

  const usefulPhrases = Array.isArray(parsed.usefulPhrases)
    ? (parsed.usefulPhrases as Record<string, unknown>[])
        .slice(0, 3)
        .map((p) => ({
          es: String(p.es ?? "").trim(),
          en: String(p.en ?? "").trim(),
        }))
        .filter((p) => p.es && p.en)
    : [];

  return {
    score,
    summaryEn:
      typeof parsed.summaryEn === "string" && parsed.summaryEn.trim()
        ? parsed.summaryEn.trim()
        : "Good Madrid roleplay session! Review the 3 corrections and useful phrases below.",
    corrections,
    usefulPhrases,
  };
}
