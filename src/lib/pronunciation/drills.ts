import { SpainSoundGroup } from "@/types/database";

export interface ShadowingSentence {
  id: string;
  es: string;
  en: string;
  focusSounds: SpainSoundGroup[];
  sourceLabel?: string;
}

export interface MinimalPairDrill {
  id: string;
  soundContrast: string;
  targetGroup: SpainSoundGroup;
  left: { es: string; en: string; sentence: string };
  right: { es: string; en: string; sentence: string };
  tip: string;
}

export interface StressLinkingDrill {
  id: string;
  category: "stress" | "linking" | "paragraph";
  title: string;
  es: string;
  en: string;
  focusNote: string;
  targetGroup: SpainSoundGroup;
}

export const DEFAULT_MADRID_SHADOWING_SENTENCES: ShadowingSentence[] = [
  {
    id: "mad-1",
    es: "Quiero cinco cervezas frías y unas aceitunas, por favor.",
    en: "I want five cold beers and some olives, please.",
    focusSounds: ["theta", "r"],
    sourceLabel: "Madrid Bar · θ & r",
  },
  {
    id: "mad-2",
    es: "El perro rojo corre rápido por el parque del Retiro.",
    en: "The red dog runs fast through Retiro Park.",
    focusSounds: ["rr", "r"],
    sourceLabel: "Retiro Park · rr & r",
  },
  {
    id: "mad-3",
    es: "La gente en Madrid come jamón y bebe zumo de naranja.",
    en: "People in Madrid eat ham and drink orange juice.",
    focusSounds: ["j_g", "theta"],
    sourceLabel: "Madrid Food · j/g & θ",
  },
  {
    id: "mad-4",
    es: "Vivo cerca de la calle Mayor y voy al trabajo en metro.",
    en: "I live near Calle Mayor and go to work by metro.",
    focusSounds: ["b_v", "ll_y", "j_g"],
    sourceLabel: "Madrid Commute · b/v & ll/y",
  },
  {
    id: "mad-5",
    es: "Muchas gracias, ¿vosotros sabéis dónde está la estación de Atocha?",
    en: "Thank you very much, do you all know where Atocha station is?",
    focusSounds: ["theta", "vowels", "b_v"],
    sourceLabel: "Atocha · θ & pure vowels",
  },
];

export const SPAIN_MINIMAL_PAIRS: MinimalPairDrill[] = [
  {
    id: "mp-pero-perro",
    soundContrast: "r (tap) vs rr (trill)",
    targetGroup: "rr",
    left: {
      es: "pero",
      en: "but",
      sentence: "Quiero ir, pero no tengo tiempo.",
    },
    right: {
      es: "perro",
      en: "dog",
      sentence: "Mi perro corre por el parque.",
    },
    tip: "Single 'r' is one light tap; double 'rr' vibrates the tongue tip 2–3 times.",
  },
  {
    id: "mp-casa-caza",
    soundContrast: "s vs θ (Castilian z)",
    targetGroup: "theta",
    left: {
      es: "casa",
      en: "house",
      sentence: "Mi casa está en el centro de Madrid.",
    },
    right: {
      es: "caza",
      en: "hunt",
      sentence: "El perro busca en la caza.",
    },
    tip: "In Spain, 's' is hissed (casa) while 'z/ce/ci' uses the 'th' tongue position (caza = KAH-thah).",
  },
  {
    id: "mp-caro-carro",
    soundContrast: "r (tap) vs rr (trill)",
    targetGroup: "r",
    left: {
      es: "caro",
      en: "expensive",
      sentence: "Este piso en Madrid es muy caro.",
    },
    right: {
      es: "carro",
      en: "cart / wagon",
      sentence: "Llevo el carro lleno en el mercado.",
    },
    tip: "Keep 'caro' crisp with a single tap so it never blurs into 'carro'.",
  },
  {
    id: "mp-coser-cocer",
    soundContrast: "s vs θ (Castilian ce/ci)",
    targetGroup: "theta",
    left: {
      es: "coser",
      en: "to sew",
      sentence: "Voy a coser este botón ahora.",
    },
    right: {
      es: "cocer",
      en: "to boil / cook",
      sentence: "Hay que cocer las patatas diez minutos.",
    },
    tip: "Pronounce 'cocer' as [koh-THEHR] with a clear Madrid 'th' on the 'ce'.",
  },
  {
    id: "mp-callo-cayo",
    soundContrast: "ll vs y (Madrid yeísmo)",
    targetGroup: "ll_y",
    left: {
      es: "calló",
      en: "went quiet",
      sentence: "Todo el mundo se calló de repente.",
    },
    right: {
      es: "cayó",
      en: "fell down",
      sentence: "Se cayó el vaso en la mesa.",
    },
    tip: "In Madrid, 'll' and 'y' sound nearly identical — focus on the crisp final stress (-yó).",
  },
  {
    id: "mp-jamon-ramon",
    soundContrast: "j (velar) vs r (initial trill)",
    targetGroup: "j_g",
    left: {
      es: "jamón",
      en: "cured ham",
      sentence: "Ponme una tostada con tomate y jamón.",
    },
    right: {
      es: "Ramón",
      en: "Ramón (name)",
      sentence: "Ramón vive cerca de Gran Vía.",
    },
    tip: "Spanish 'j' comes from the back of the throat; word-initial 'R' is always rolled like 'rr'.",
  },
];

export const STRESS_LINKING_DRILLS: StressLinkingDrill[] = [
  {
    id: "sl-linking-1",
    category: "linking",
    title: "Sinalefa & Consonant Linking",
    es: "Los otros amigos están en el autobús de España.",
    en: "The other friends are on the bus from Spain.",
    focusNote: "Link 'los_otros', 'están_en_el', and 'de_España' smoothly without pausing between words.",
    targetGroup: "vowels",
  },
  {
    id: "sl-stress-1",
    category: "stress",
    title: "Accent Mark Stress Shift",
    es: "Hablo español todos los días, y ayer habló mi jefe conmigo.",
    en: "I speak Spanish every day, and yesterday my boss spoke with me.",
    focusNote: "Contrast 'HA-blo' (present, I speak) vs 'ha-BLÓ' (past, he/she spoke).",
    targetGroup: "vowels",
  },
  {
    id: "sl-bv-1",
    category: "linking",
    title: "Soft B / V Between Vowels",
    es: "Vamos a vivir bien y beber un buen vino blanco en Madrid.",
    en: "We are going to live well and drink a good white wine in Madrid.",
    focusNote: "Soften 'v/b' between vowels (a vivir, beber) — never bite your lower lip like English 'v'.",
    targetGroup: "b_v",
  },
  {
    id: "sl-para-1",
    category: "paragraph",
    title: "Madrid Morning Read-Aloud",
    es: "Buenos días. Hoy hace mucho sol en Madrid y voy caminando por la calle hacia el metro. Antes de empezar a trabajar, siempre pido un café con leche y una tostada con tomate en el bar de la esquina. ¡Muchas gracias y hasta luego!",
    en: "Good morning. Today it's very sunny in Madrid and I'm walking down the street toward the metro. Before starting work, I always order a coffee with milk and toast with tomato at the corner bar. Thank you very much and see you later!",
    focusNote: "Read at a natural, even pace. Hit the Madrid θ on 'hace', 'hacia', and 'gracias'.",
    targetGroup: "theta",
  },
];
