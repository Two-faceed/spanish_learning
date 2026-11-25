import { AiLemmaLookupOutput } from "@/lib/ai/json-parser";
import {
  TWELVE_WEEK_CURRICULUM,
  getBuiltInFallbackLesson,
} from "@/lib/tutor/curriculum";

export interface WordLookupEntry extends AiLemmaLookupOutput {
  direction?: "es-to-en" | "en-to-es";
  example_es?: string;
  example_tr?: string;
  sourceBadge?: "deck" | "dictionary" | "ai";
}

/**
 * Strips punctuation and normalizes a selected Spanish or English word/phrase.
 */
export function cleanSelectedSpanishText(raw: string): string {
  return raw
    .trim()
    .replace(/^[«"“”'‘’¿¡([{\s.,;!?—–-]+|[»"“”'‘’?!.,;)\]}\s—–-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CORE_SPAIN_DICTIONARY: Record<
  string,
  {
    lemma: string;
    pos: string;
    gender: "el" | "la" | "el/la" | null;
    meaning: string;
    example_es?: string;
    example_tr?: string;
  }
> = {
  // Countries, cities & nationalities in exercises
  ucrania: {
    lemma: "ucrania",
    pos: "proper noun",
    gender: null,
    meaning: "Ukraine",
    example_es: "Soy de Ucrania y vivo en Madrid.",
    example_tr: "I am from Ukraine and I live in Madrid.",
  },
  ucraniano: {
    lemma: "ucraniano",
    pos: "adj / n",
    gender: "el",
    meaning: "Ukrainian (masculine)",
  },
  ucraniana: {
    lemma: "ucraniano",
    pos: "adj / n",
    gender: "la",
    meaning: "Ukrainian (feminine)",
  },
  españa: {
    lemma: "españa",
    pos: "proper noun",
    gender: null,
    meaning: "Spain",
    example_es: "Vivimos en España.",
    example_tr: "We live in Spain.",
  },
  español: {
    lemma: "español",
    pos: "n / adj",
    gender: "el",
    meaning: "Spanish (language / person)",
  },
  española: {
    lemma: "español",
    pos: "adj / n",
    gender: "la",
    meaning: "Spanish (feminine)",
  },
  madrid: {
    lemma: "madrid",
    pos: "proper noun",
    gender: null,
    meaning: "Madrid (capital of Spain)",
    example_es: "Estoy en el centro de Madrid.",
    example_tr: "I am in the centre of Madrid.",
  },
  toledo: {
    lemma: "toledo",
    pos: "proper noun",
    gender: null,
    meaning: "Toledo (historic city south of Madrid)",
  },
  segovia: {
    lemma: "segovia",
    pos: "proper noun",
    gender: null,
    meaning: "Segovia (Castilian city famous for its Roman aqueduct)",
  },
  salamanca: {
    lemma: "salamanca",
    pos: "proper noun",
    gender: null,
    meaning: "Salamanca (university city in Castile and León)",
  },
  león: {
    lemma: "león",
    pos: "proper noun",
    gender: "el",
    meaning: "León (city in NW Spain) / lion",
  },
  santiago: {
    lemma: "santiago",
    pos: "proper noun",
    gender: null,
    meaning: "Santiago de Compostela (Galicia)",
  },
  bilbao: {
    lemma: "bilbao",
    pos: "proper noun",
    gender: null,
    meaning: "Bilbao (Basque Country city)",
  },
  zaragoza: {
    lemma: "zaragoza",
    pos: "proper noun",
    gender: null,
    meaning: "Zaragoza (capital of Aragon)",
  },
  barcelona: {
    lemma: "barcelona",
    pos: "proper noun",
    gender: null,
    meaning: "Barcelona (capital of Catalonia)",
  },
  valencia: {
    lemma: "valencia",
    pos: "proper noun",
    gender: null,
    meaning: "Valencia (Mediterranean port city)",
  },
  granada: {
    lemma: "granada",
    pos: "proper noun",
    gender: null,
    meaning: "Granada (Andalusian city home to the Alhambra)",
  },
  sevilla: {
    lemma: "sevilla",
    pos: "proper noun",
    gender: null,
    meaning: "Seville (capital of Andalusia)",
  },

  // Pronouns (with Spain vosotros)
  yo: { lemma: "yo", pos: "pron", gender: null, meaning: "I" },
  tú: {
    lemma: "tú",
    pos: "pron",
    gender: null,
    meaning: "you (informal singular)",
  },
  él: { lemma: "él", pos: "pron", gender: null, meaning: "he / him" },
  ella: { lemma: "ella", pos: "pron", gender: null, meaning: "she / her" },
  usted: {
    lemma: "usted",
    pos: "pron",
    gender: null,
    meaning: "you (formal singular)",
  },
  nosotros: {
    lemma: "nosotros",
    pos: "pron",
    gender: null,
    meaning: "we (masculine / mixed)",
  },
  nosotras: {
    lemma: "nosotras",
    pos: "pron",
    gender: null,
    meaning: "we (feminine)",
  },
  vosotros: {
    lemma: "vosotros",
    pos: "pron",
    gender: null,
    meaning: "you all (informal plural in Spain)",
    example_es: "¿Vosotros sois de Madrid?",
    example_tr: "Are you all from Madrid?",
  },
  vosotras: {
    lemma: "vosotras",
    pos: "pron",
    gender: null,
    meaning: "you all (informal plural feminine in Spain)",
  },
  ellos: {
    lemma: "ellos",
    pos: "pron",
    gender: null,
    meaning: "they (masculine / mixed)",
  },
  ellas: {
    lemma: "ellas",
    pos: "pron",
    gender: null,
    meaning: "they (feminine)",
  },
  ustedes: {
    lemma: "ustedes",
    pos: "pron",
    gender: null,
    meaning: "you all (formal plural in Spain)",
  },

  // SER (to be — identity, origin, characteristics)
  ser: {
    lemma: "ser",
    pos: "v",
    gender: null,
    meaning: "to be (permanent identity, origin, profession, time)",
  },
  soy: {
    lemma: "ser",
    pos: "v (1st sg present)",
    gender: null,
    meaning: "I am (from ser — identity / origin)",
    example_es: "Yo soy de Ucrania.",
    example_tr: "I am from Ukraine.",
  },
  eres: {
    lemma: "ser",
    pos: "v (2nd sg present)",
    gender: null,
    meaning: "you are (from ser — identity / origin)",
    example_es: "¿De dónde eres?",
    example_tr: "Where are you from?",
  },
  es: {
    lemma: "ser",
    pos: "v (3rd sg present)",
    gender: null,
    meaning: "he/she/it is, you (formal) are (from ser)",
  },
  somos: {
    lemma: "ser",
    pos: "v (1st pl present)",
    gender: null,
    meaning: "we are (from ser)",
  },
  sois: {
    lemma: "ser",
    pos: "v (vosotros present)",
    gender: null,
    meaning: "you all are (Spain vosotros form of ser)",
  },
  son: {
    lemma: "ser",
    pos: "v (3rd pl present)",
    gender: null,
    meaning: "they are (from ser)",
  },
  era: {
    lemma: "ser",
    pos: "v (imperfect)",
    gender: null,
    meaning: "was / used to be (ser)",
  },
  fue: {
    lemma: "ser",
    pos: "v (preterite)",
    gender: null,
    meaning: "was / went (ser / ir)",
  },

  // ESTAR (to be — location, temporary state, mood)
  estar: {
    lemma: "estar",
    pos: "v",
    gender: null,
    meaning: "to be (location, temporary state, mood)",
  },
  estoy: {
    lemma: "estar",
    pos: "v (1st sg present)",
    gender: null,
    meaning: "I am (from estar — location or current state)",
    example_es: "Ahora estoy en Madrid.",
    example_tr: "Right now I am in Madrid.",
  },
  estás: {
    lemma: "estar",
    pos: "v (2nd sg present)",
    gender: null,
    meaning: "you are (from estar — location or current state)",
    example_es: "¿Cómo estás hoy?",
    example_tr: "How are you today?",
  },
  está: {
    lemma: "estar",
    pos: "v (3rd sg present)",
    gender: null,
    meaning: "is / is located (from estar)",
    example_es: "El café está caliente.",
    example_tr: "The coffee is hot.",
  },
  estamos: {
    lemma: "estar",
    pos: "v (1st pl present)",
    gender: null,
    meaning: "we are (from estar — location or state)",
  },
  estáis: {
    lemma: "estar",
    pos: "v (vosotros present)",
    gender: null,
    meaning: "you all are (Spain vosotros form of estar)",
  },
  están: {
    lemma: "estar",
    pos: "v (3rd pl present)",
    gender: null,
    meaning: "they are (from estar — location or state)",
  },

  // TENER (to have)
  tener: { lemma: "tener", pos: "v", gender: null, meaning: "to have" },
  tengo: {
    lemma: "tener",
    pos: "v (1st sg)",
    gender: null,
    meaning: "I have (tener)",
  },
  tienes: {
    lemma: "tener",
    pos: "v (2nd sg)",
    gender: null,
    meaning: "you have (tener)",
  },
  tiene: {
    lemma: "tener",
    pos: "v (3rd sg)",
    gender: null,
    meaning: "he/she has (tener)",
  },
  tenemos: {
    lemma: "tener",
    pos: "v (1st pl)",
    gender: null,
    meaning: "we have (tener)",
  },
  tenéis: {
    lemma: "tener",
    pos: "v (vosotros)",
    gender: null,
    meaning: "you all have (Spain vosotros)",
  },
  tienen: {
    lemma: "tener",
    pos: "v (3rd pl)",
    gender: null,
    meaning: "they have (tener)",
  },

  // IR (to go)
  ir: { lemma: "ir", pos: "v", gender: null, meaning: "to go" },
  voy: {
    lemma: "ir",
    pos: "v (1st sg)",
    gender: null,
    meaning: "I go / I am going (ir)",
  },
  vas: { lemma: "ir", pos: "v (2nd sg)", gender: null, meaning: "you go (ir)" },
  va: {
    lemma: "ir",
    pos: "v (3rd sg)",
    gender: null,
    meaning: "he/she goes (ir)",
  },
  vamos: {
    lemma: "ir",
    pos: "v (1st pl)",
    gender: null,
    meaning: "we go / let's go (ir)",
  },
  vais: {
    lemma: "ir",
    pos: "v (vosotros)",
    gender: null,
    meaning: "you all go (Spain vosotros)",
  },
  van: {
    lemma: "ir",
    pos: "v (3rd pl)",
    gender: null,
    meaning: "they go (ir)",
  },

  // HACER, PODER, QUERER, HABER
  hacer: {
    lemma: "hacer",
    pos: "v",
    gender: null,
    meaning: "to do / to make",
  },
  hago: {
    lemma: "hacer",
    pos: "v (1st sg)",
    gender: null,
    meaning: "I do / I make (hacer)",
  },
  haces: {
    lemma: "hacer",
    pos: "v (2nd sg)",
    gender: null,
    meaning: "you do / make (hacer)",
  },
  hace: {
    lemma: "hacer",
    pos: "v (3rd sg)",
    gender: null,
    meaning: "does / makes / weather is (hacer)",
  },
  poder: {
    lemma: "poder",
    pos: "v",
    gender: null,
    meaning: "to be able to / can",
  },
  puedo: {
    lemma: "poder",
    pos: "v (1st sg)",
    gender: null,
    meaning: "I can (poder)",
  },
  puedes: {
    lemma: "poder",
    pos: "v (2nd sg)",
    gender: null,
    meaning: "you can (poder)",
  },
  puede: {
    lemma: "poder",
    pos: "v (3rd sg)",
    gender: null,
    meaning: "can / is able to (poder)",
  },
  podemos: {
    lemma: "poder",
    pos: "v (1st pl)",
    gender: null,
    meaning: "we can (poder)",
  },
  podéis: {
    lemma: "poder",
    pos: "v (vosotros)",
    gender: null,
    meaning: "you all can (Spain vosotros)",
  },
  querer: {
    lemma: "querer",
    pos: "v",
    gender: null,
    meaning: "to want / to love",
  },
  quiero: {
    lemma: "querer",
    pos: "v (1st sg)",
    gender: null,
    meaning: "I want (querer)",
  },
  quieres: {
    lemma: "querer",
    pos: "v (2nd sg)",
    gender: null,
    meaning: "you want (querer)",
  },
  quiere: {
    lemma: "querer",
    pos: "v (3rd sg)",
    gender: null,
    meaning: "wants (querer)",
  },
  queremos: {
    lemma: "querer",
    pos: "v (1st pl)",
    gender: null,
    meaning: "we want (querer)",
  },
  queréis: {
    lemma: "querer",
    pos: "v (vosotros)",
    gender: null,
    meaning: "you all want (Spain vosotros)",
  },
  hay: {
    lemma: "haber",
    pos: "v (impersonal)",
    gender: null,
    meaning: "there is / there are",
    example_es: "Hay una cafetería muy buena aquí.",
    example_tr: "There is a very good café here.",
  },
  he: {
    lemma: "haber",
    pos: "aux v (1st sg)",
    gender: null,
    meaning: "I have (auxiliary in present perfect)",
  },
  has: {
    lemma: "haber",
    pos: "aux v (2nd sg)",
    gender: null,
    meaning: "you have (auxiliary in present perfect)",
  },
  ha: {
    lemma: "haber",
    pos: "aux v (3rd sg)",
    gender: null,
    meaning: "has (auxiliary in present perfect)",
  },
  hemos: {
    lemma: "haber",
    pos: "aux v (1st pl)",
    gender: null,
    meaning: "we have (auxiliary in present perfect)",
  },
  habéis: {
    lemma: "haber",
    pos: "aux v (vosotros)",
    gender: null,
    meaning: "you all have (auxiliary in Spain)",
  },
  han: {
    lemma: "haber",
    pos: "aux v (3rd pl)",
    gender: null,
    meaning: "they have (auxiliary in present perfect)",
  },

  // Articles, prepositions, question words & connectors
  el: {
    lemma: "el",
    pos: "art",
    gender: "el",
    meaning: "the (masculine singular)",
  },
  la: {
    lemma: "la",
    pos: "art",
    gender: "la",
    meaning: "the (feminine singular)",
  },
  los: {
    lemma: "el",
    pos: "art",
    gender: "el",
    meaning: "the (masculine plural)",
  },
  las: {
    lemma: "la",
    pos: "art",
    gender: "la",
    meaning: "the (feminine plural)",
  },
  un: { lemma: "un", pos: "art", gender: "el", meaning: "a / an (masculine)" },
  una: { lemma: "una", pos: "art", gender: "la", meaning: "a / an (feminine)" },
  unos: {
    lemma: "un",
    pos: "art",
    gender: "el",
    meaning: "some (masculine plural)",
  },
  unas: {
    lemma: "una",
    pos: "art",
    gender: "la",
    meaning: "some (feminine plural)",
  },
  de: { lemma: "de", pos: "prep", gender: null, meaning: "of / from" },
  del: {
    lemma: "de + el",
    pos: "prep",
    gender: "el",
    meaning: "of the / from the (de + el)",
  },
  al: {
    lemma: "a + el",
    pos: "prep",
    gender: "el",
    meaning: "to the (a + el)",
  },
  en: { lemma: "en", pos: "prep", gender: null, meaning: "in / on / at" },
  con: { lemma: "con", pos: "prep", gender: null, meaning: "with" },
  sin: { lemma: "sin", pos: "prep", gender: null, meaning: "without" },
  por: {
    lemma: "por",
    pos: "prep",
    gender: null,
    meaning: "for / because of / through / by",
  },
  para: {
    lemma: "para",
    pos: "prep",
    gender: null,
    meaning: "for / in order to / toward (goal/recipient)",
  },
  pero: { lemma: "pero", pos: "conj", gender: null, meaning: "but" },
  porque: { lemma: "porque", pos: "conj", gender: null, meaning: "because" },
  qué: {
    lemma: "qué",
    pos: "interrog",
    gender: null,
    meaning: "what / which",
  },
  quién: { lemma: "quién", pos: "interrog", gender: null, meaning: "who" },
  dónde: { lemma: "dónde", pos: "interrog", gender: null, meaning: "where" },
  cuándo: { lemma: "cuándo", pos: "interrog", gender: null, meaning: "when" },
  cómo: { lemma: "cómo", pos: "interrog", gender: null, meaning: "how" },
  cuánto: {
    lemma: "cuánto",
    pos: "interrog",
    gender: null,
    meaning: "how much",
  },
  cuántos: {
    lemma: "cuánto",
    pos: "interrog",
    gender: null,
    meaning: "how many",
  },
  muy: { lemma: "muy", pos: "adv", gender: null, meaning: "very" },
  más: { lemma: "más", pos: "adv", gender: null, meaning: "more / plus" },
  menos: {
    lemma: "menos",
    pos: "adv",
    gender: null,
    meaning: "less / fewer / minus",
  },
  ahora: {
    lemma: "ahora",
    pos: "adv",
    gender: null,
    meaning: "now / right now",
  },
  hoy: { lemma: "hoy", pos: "adv", gender: null, meaning: "today" },
  mañana: {
    lemma: "mañana",
    pos: "adv / n",
    gender: "la",
    meaning: "tomorrow / morning",
  },
  ayer: { lemma: "ayer", pos: "adv", gender: null, meaning: "yesterday" },
  aquí: { lemma: "aquí", pos: "adv", gender: null, meaning: "here" },
  allí: {
    lemma: "allí",
    pos: "adv",
    gender: null,
    meaning: "there / over there",
  },
  también: {
    lemma: "también",
    pos: "adv",
    gender: null,
    meaning: "also / too",
  },
  siempre: { lemma: "siempre", pos: "adv", gender: null, meaning: "always" },
  nunca: { lemma: "nunca", pos: "adv", gender: null, meaning: "never" },

  // Everyday Madrid nouns & greetings
  hola: { lemma: "hola", pos: "interj", gender: null, meaning: "hello / hi" },
  adiós: { lemma: "adiós", pos: "interj", gender: null, meaning: "goodbye" },
  gracias: {
    lemma: "gracias",
    pos: "interj",
    gender: null,
    meaning: "thank you / thanks",
  },
  vale: {
    lemma: "vale",
    pos: "interj",
    gender: null,
    meaning: "okay / alright / sounds good (Spain)",
    example_es: "¡Vale, nos vemos a las ocho!",
    example_tr: "Okay, see you at eight!",
  },
  coche: { lemma: "coche", pos: "n", gender: "el", meaning: "car (Spain)" },
  móvil: {
    lemma: "móvil",
    pos: "n",
    gender: "el",
    meaning: "mobile phone (Spain)",
  },
  ordenador: {
    lemma: "ordenador",
    pos: "n",
    gender: "el",
    meaning: "computer (Spain)",
  },
  piso: {
    lemma: "piso",
    pos: "n",
    gender: "el",
    meaning: "flat / apartment (Spain)",
  },
  caña: {
    lemma: "caña",
    pos: "n",
    gender: "la",
    meaning: "small draft beer (Madrid)",
  },
  tostada: {
    lemma: "tostada",
    pos: "n",
    gender: "la",
    meaning: "toasted bread (breakfast toast)",
  },
  café: { lemma: "café", pos: "n", gender: "el", meaning: "coffee / café" },
  leche: { lemma: "leche", pos: "n", gender: "la", meaning: "milk" },
  agua: {
    lemma: "agua",
    pos: "n",
    gender: "el",
    meaning: "water (feminine noun taking 'el' in singular)",
  },
  cuenta: {
    lemma: "cuenta",
    pos: "n",
    gender: "la",
    meaning: "bill / check / bank account",
  },
  camarero: { lemma: "camarero", pos: "n", gender: "el", meaning: "waiter" },
  camarera: { lemma: "camarera", pos: "n", gender: "la", meaning: "waitress" },
  banco: { lemma: "banco", pos: "n", gender: "el", meaning: "bank / bench" },
  calle: { lemma: "calle", pos: "n", gender: "la", meaning: "street" },
  plaza: { lemma: "plaza", pos: "n", gender: "la", meaning: "square / plaza" },
  metro: {
    lemma: "metro",
    pos: "n",
    gender: "el",
    meaning: "underground / subway (Metro de Madrid)",
  },
  billete: {
    lemma: "billete",
    pos: "n",
    gender: "el",
    meaning: "ticket / banknote (Spain)",
  },
  trabajo: { lemma: "trabajo", pos: "n", gender: "el", meaning: "work / job" },
  casa: { lemma: "casa", pos: "n", gender: "la", meaning: "house / home" },
  ciudad: { lemma: "ciudad", pos: "n", gender: "la", meaning: "city" },
  centro: {
    lemma: "centro",
    pos: "n",
    gender: "el",
    meaning: "centre / downtown",
  },
  barrio: {
    lemma: "barrio",
    pos: "n",
    gender: "el",
    meaning: "neighbourhood / district",
  },
  estación: {
    lemma: "estación",
    pos: "n",
    gender: "la",
    meaning: "station / season",
  },
  mercado: { lemma: "mercado", pos: "n", gender: "el", meaning: "market" },
  tienda: {
    lemma: "tienda",
    pos: "n",
    gender: "la",
    meaning: "shop / store",
  },
  amigo: {
    lemma: "amigo",
    pos: "n",
    gender: "el",
    meaning: "friend (male)",
  },
  amiga: {
    lemma: "amiga",
    pos: "n",
    gender: "la",
    meaning: "friend (female)",
  },
  día: { lemma: "día", pos: "n", gender: "el", meaning: "day" },
  noche: {
    lemma: "noche",
    pos: "n",
    gender: "la",
    meaning: "night / evening",
  },
  tarde: {
    lemma: "tarde",
    pos: "n",
    gender: "la",
    meaning: "afternoon / evening / late",
  },
  semana: { lemma: "semana", pos: "n", gender: "la", meaning: "week" },
  mes: { lemma: "mes", pos: "n", gender: "el", meaning: "month" },
  año: { lemma: "año", pos: "n", gender: "el", meaning: "year" },
  tiempo: {
    lemma: "tiempo",
    pos: "n",
    gender: "el",
    meaning: "time / weather",
  },
  dinero: { lemma: "dinero", pos: "n", gender: "el", meaning: "money" },
  problema: {
    lemma: "problema",
    pos: "n",
    gender: "el",
    meaning: "problem (masculine -ma noun)",
  },
  idioma: {
    lemma: "idioma",
    pos: "n",
    gender: "el",
    meaning: "language (masculine -ma noun)",
  },
  sistema: {
    lemma: "sistema",
    pos: "n",
    gender: "el",
    meaning: "system (masculine -ma noun)",
  },
  mano: {
    lemma: "mano",
    pos: "n",
    gender: "la",
    meaning: "hand (feminine irregular noun)",
  },
  foto: {
    lemma: "foto",
    pos: "n",
    gender: "la",
    meaning: "photo (feminine short for fotografía)",
  },
  moto: {
    lemma: "moto",
    pos: "n",
    gender: "la",
    meaning: "motorbike (feminine short for motocicleta)",
  },
};

/**
 * Curated English -> Spain Spanish (es-ES) reverse dictionary for instant lookup
 * when the learner double-clicks an English word anywhere in the app.
 */
const CORE_ENGLISH_TO_SPANISH_DICTIONARY: Record<
  string,
  {
    word: string;
    lemma: string;
    pos: string;
    gender: "el" | "la" | "el/la" | null;
    meaning: string;
    example_es?: string;
    example_tr?: string;
  }
> = {
  ukraine: {
    word: "Ucrania",
    lemma: "ucrania",
    pos: "proper noun",
    gender: null,
    meaning: "Ukraine",
    example_es: "Soy de Ucrania y vivo en Madrid.",
    example_tr: "I am from Ukraine and I live in Madrid.",
  },
  ukrainian: {
    word: "ucraniano / ucraniana",
    lemma: "ucraniano",
    pos: "adj / n",
    gender: "el/la",
    meaning: "Ukrainian",
  },
  spain: {
    word: "España",
    lemma: "españa",
    pos: "proper noun",
    gender: null,
    meaning: "Spain",
    example_es: "Vivimos en España.",
    example_tr: "We live in Spain.",
  },
  spanish: {
    word: "el español",
    lemma: "español",
    pos: "n / adj",
    gender: "el",
    meaning: "Spanish (language / nationality)",
  },
  hello: {
    word: "hola",
    lemma: "hola",
    pos: "interj",
    gender: null,
    meaning: "hello / hi",
  },
  goodbye: {
    word: "adiós",
    lemma: "adiós",
    pos: "interj",
    gender: null,
    meaning: "goodbye",
  },
  thanks: {
    word: "gracias",
    lemma: "gracias",
    pos: "interj",
    gender: null,
    meaning: "thanks / thank you",
  },
  please: {
    word: "por favor",
    lemma: "por favor",
    pos: "phrase",
    gender: null,
    meaning: "please",
    example_es: "Un café con leche, por favor.",
    example_tr: "A coffee with milk, please.",
  },
  okay: {
    word: "vale",
    lemma: "vale",
    pos: "interj",
    gender: null,
    meaning: "okay / sounds good (Spain)",
    example_es: "¡Vale, perfecto!",
    example_tr: "Okay, perfect!",
  },
  car: {
    word: "el coche",
    lemma: "coche",
    pos: "n",
    gender: "el",
    meaning: "car (Spain)",
    example_es: "He aparcado el coche cerca.",
    example_tr: "I parked the car nearby.",
  },
  phone: {
    word: "el móvil",
    lemma: "móvil",
    pos: "n",
    gender: "el",
    meaning: "mobile phone (Spain)",
  },
  mobile: {
    word: "el móvil",
    lemma: "móvil",
    pos: "n",
    gender: "el",
    meaning: "mobile phone (Spain)",
  },
  computer: {
    word: "el ordenador",
    lemma: "ordenador",
    pos: "n",
    gender: "el",
    meaning: "computer (Spain)",
  },
  laptop: {
    word: "el portátil",
    lemma: "portátil",
    pos: "n",
    gender: "el",
    meaning: "laptop (Spain)",
  },
  flat: {
    word: "el piso",
    lemma: "piso",
    pos: "n",
    gender: "el",
    meaning: "flat / apartment (Spain)",
  },
  apartment: {
    word: "el piso",
    lemma: "piso",
    pos: "n",
    gender: "el",
    meaning: "apartment / flat (Spain)",
  },
  coffee: {
    word: "el café",
    lemma: "café",
    pos: "n",
    gender: "el",
    meaning: "coffee",
    example_es: "¿Tomamos un café?",
    example_tr: "Shall we have a coffee?",
  },
  toast: {
    word: "la tostada",
    lemma: "tostada",
    pos: "n",
    gender: "la",
    meaning: "toasted bread (breakfast toast)",
  },
  breakfast: {
    word: "el desayuno",
    lemma: "desayuno",
    pos: "n",
    gender: "el",
    meaning: "breakfast",
    example_es: "Tomamos el desayuno en una cafetería.",
    example_tr: "We have breakfast at a café.",
  },
  lunch: {
    word: "la comida",
    lemma: "comida",
    pos: "n",
    gender: "la",
    meaning: "lunch / midday meal (Spain)",
  },
  dinner: {
    word: "la cena",
    lemma: "cena",
    pos: "n",
    gender: "la",
    meaning: "dinner",
  },
  beer: {
    word: "la caña",
    lemma: "caña",
    pos: "n",
    gender: "la",
    meaning: "small draft beer (Madrid) / la cerveza",
  },
  water: {
    word: "el agua",
    lemma: "agua",
    pos: "n",
    gender: "el",
    meaning: "water",
  },
  milk: {
    word: "la leche",
    lemma: "leche",
    pos: "n",
    gender: "la",
    meaning: "milk",
  },
  bread: {
    word: "el pan",
    lemma: "pan",
    pos: "n",
    gender: "el",
    meaning: "bread",
  },
  waiter: {
    word: "el camarero",
    lemma: "camarero",
    pos: "n",
    gender: "el",
    meaning: "waiter",
  },
  waitress: {
    word: "la camarera",
    lemma: "camarera",
    pos: "n",
    gender: "la",
    meaning: "waitress",
  },
  bill: {
    word: "la cuenta",
    lemma: "cuenta",
    pos: "n",
    gender: "la",
    meaning: "bill / check (in a restaurant)",
    example_es: "¿Nos trae la cuenta, por favor?",
    example_tr: "Could you bring us the bill, please?",
  },
  account: {
    word: "la cuenta bancaria",
    lemma: "cuenta",
    pos: "n",
    gender: "la",
    meaning: "bank account",
  },
  bank: {
    word: "el banco",
    lemma: "banco",
    pos: "n",
    gender: "el",
    meaning: "bank",
  },
  money: {
    word: "el dinero",
    lemma: "dinero",
    pos: "n",
    gender: "el",
    meaning: "money",
  },
  card: {
    word: "la tarjeta",
    lemma: "tarjeta",
    pos: "n",
    gender: "la",
    meaning: "card (credit/debit/flashcard)",
  },
  cash: {
    word: "el efectivo",
    lemma: "efectivo",
    pos: "n",
    gender: "el",
    meaning: "cash (en efectivo)",
  },
  ticket: {
    word: "el billete",
    lemma: "billete",
    pos: "n",
    gender: "el",
    meaning: "ticket / banknote (Spain)",
  },
  train: {
    word: "el tren",
    lemma: "tren",
    pos: "n",
    gender: "el",
    meaning: "train",
  },
  bus: {
    word: "el autobús",
    lemma: "autobús",
    pos: "n",
    gender: "el",
    meaning: "bus",
  },
  subway: {
    word: "el metro",
    lemma: "metro",
    pos: "n",
    gender: "el",
    meaning: "subway / underground (el metro)",
  },
  station: {
    word: "la estación",
    lemma: "estación",
    pos: "n",
    gender: "la",
    meaning: "station",
  },
  street: {
    word: "la calle",
    lemma: "calle",
    pos: "n",
    gender: "la",
    meaning: "street",
  },
  square: {
    word: "la plaza",
    lemma: "plaza",
    pos: "n",
    gender: "la",
    meaning: "town square / plaza",
  },
  city: {
    word: "la ciudad",
    lemma: "ciudad",
    pos: "n",
    gender: "la",
    meaning: "city",
  },
  house: {
    word: "la casa",
    lemma: "casa",
    pos: "n",
    gender: "la",
    meaning: "house / home",
  },
  home: {
    word: "la casa",
    lemma: "casa",
    pos: "n",
    gender: "la",
    meaning: "home / house",
  },
  work: {
    word: "el trabajo",
    lemma: "trabajo",
    pos: "n",
    gender: "el",
    meaning: "work / job",
  },
  job: {
    word: "el trabajo",
    lemma: "trabajo",
    pos: "n",
    gender: "el",
    meaning: "job / work",
  },
  market: {
    word: "el mercado",
    lemma: "mercado",
    pos: "n",
    gender: "el",
    meaning: "market",
  },
  shop: {
    word: "la tienda",
    lemma: "tienda",
    pos: "n",
    gender: "la",
    meaning: "shop / store",
  },
  store: {
    word: "la tienda",
    lemma: "tienda",
    pos: "n",
    gender: "la",
    meaning: "store / shop",
  },
  friend: {
    word: "el amigo / la amiga",
    lemma: "amigo",
    pos: "n",
    gender: "el/la",
    meaning: "friend",
  },
  doctor: {
    word: "el médico / la médica",
    lemma: "médico",
    pos: "n",
    gender: "el/la",
    meaning: "doctor",
  },
  lawyer: {
    word: "el abogado / la abogada",
    lemma: "abogado",
    pos: "n",
    gender: "el/la",
    meaning: "lawyer",
  },
  landlord: {
    word: "el casero / la casera",
    lemma: "casero",
    pos: "n",
    gender: "el/la",
    meaning: "landlord / landlady (Spain)",
  },
  rent: {
    word: "el alquiler",
    lemma: "alquiler",
    pos: "n",
    gender: "el",
    meaning: "rent",
  },
  appointment: {
    word: "la cita",
    lemma: "cita",
    pos: "n",
    gender: "la",
    meaning: "appointment / date (cita previa)",
  },
  morning: {
    word: "la mañana",
    lemma: "mañana",
    pos: "n",
    gender: "la",
    meaning: "morning",
  },
  afternoon: {
    word: "la tarde",
    lemma: "tarde",
    pos: "n",
    gender: "la",
    meaning: "afternoon / early evening",
  },
  night: {
    word: "la noche",
    lemma: "noche",
    pos: "n",
    gender: "la",
    meaning: "night",
  },
  today: {
    word: "hoy",
    lemma: "hoy",
    pos: "adv",
    gender: null,
    meaning: "today",
  },
  tomorrow: {
    word: "mañana",
    lemma: "mañana",
    pos: "adv",
    gender: null,
    meaning: "tomorrow",
  },
  yesterday: {
    word: "ayer",
    lemma: "ayer",
    pos: "adv",
    gender: null,
    meaning: "yesterday",
  },
  now: {
    word: "ahora",
    lemma: "ahora",
    pos: "adv",
    gender: null,
    meaning: "now",
  },
  always: {
    word: "siempre",
    lemma: "siempre",
    pos: "adv",
    gender: null,
    meaning: "always",
  },
  never: {
    word: "nunca",
    lemma: "nunca",
    pos: "adv",
    gender: null,
    meaning: "never",
  },
  here: {
    word: "aquí",
    lemma: "aquí",
    pos: "adv",
    gender: null,
    meaning: "here",
  },
  there: {
    word: "allí",
    lemma: "allí",
    pos: "adv",
    gender: null,
    meaning: "there / over there",
  },
  where: {
    word: "dónde",
    lemma: "dónde",
    pos: "interrog",
    gender: null,
    meaning: "where",
  },
  what: {
    word: "qué",
    lemma: "qué",
    pos: "interrog",
    gender: null,
    meaning: "what",
  },
  who: {
    word: "quién",
    lemma: "quién",
    pos: "interrog",
    gender: null,
    meaning: "who",
  },
  when: {
    word: "cuándo",
    lemma: "cuándo",
    pos: "interrog",
    gender: null,
    meaning: "when",
  },
  how: {
    word: "cómo",
    lemma: "cómo",
    pos: "interrog",
    gender: null,
    meaning: "how",
  },
  why: {
    word: "por qué",
    lemma: "por qué",
    pos: "interrog",
    gender: null,
    meaning: "why",
  },
  because: {
    word: "porque",
    lemma: "porque",
    pos: "conj",
    gender: null,
    meaning: "because",
  },
  with: {
    word: "con",
    lemma: "con",
    pos: "prep",
    gender: null,
    meaning: "with",
  },
  without: {
    word: "sin",
    lemma: "sin",
    pos: "prep",
    gender: null,
    meaning: "without",
  },
  from: {
    word: "de / desde",
    lemma: "de",
    pos: "prep",
    gender: null,
    meaning: "from / of",
  },
  but: {
    word: "pero",
    lemma: "pero",
    pos: "conj",
    gender: null,
    meaning: "but",
  },
  very: {
    word: "muy",
    lemma: "muy",
    pos: "adv",
    gender: null,
    meaning: "very",
  },
  more: {
    word: "más",
    lemma: "más",
    pos: "adv",
    gender: null,
    meaning: "more",
  },
  less: {
    word: "menos",
    lemma: "menos",
    pos: "adv",
    gender: null,
    meaning: "less",
  },
  good: {
    word: "bueno / buena",
    lemma: "bueno",
    pos: "adj",
    gender: null,
    meaning: "good",
  },
  bad: {
    word: "malo / mala",
    lemma: "malo",
    pos: "adj",
    gender: null,
    meaning: "bad",
  },
  big: {
    word: "grande",
    lemma: "grande",
    pos: "adj",
    gender: null,
    meaning: "big / large",
  },
  small: {
    word: "pequeño / pequeña",
    lemma: "pequeño",
    pos: "adj",
    gender: null,
    meaning: "small / little",
  },
  hot: {
    word: "caliente",
    lemma: "caliente",
    pos: "adj",
    gender: null,
    meaning: "hot (El café está caliente)",
  },
  cold: {
    word: "frío / fría",
    lemma: "frío",
    pos: "adj",
    gender: null,
    meaning: "cold",
  },
  new: {
    word: "nuevo / nueva",
    lemma: "nuevo",
    pos: "adj",
    gender: null,
    meaning: "new",
  },
  old: {
    word: "viejo / antiguo",
    lemma: "viejo",
    pos: "adj",
    gender: null,
    meaning: "old",
  },
  day: {
    word: "el día",
    lemma: "día",
    pos: "n",
    gender: "el",
    meaning: "day",
  },
  week: {
    word: "la semana",
    lemma: "semana",
    pos: "n",
    gender: "la",
    meaning: "week",
  },
  month: {
    word: "el mes",
    lemma: "mes",
    pos: "n",
    gender: "el",
    meaning: "month",
  },
  year: {
    word: "el año",
    lemma: "año",
    pos: "n",
    gender: "el",
    meaning: "year",
  },
  time: {
    word: "el tiempo / la hora",
    lemma: "tiempo",
    pos: "n",
    gender: "el",
    meaning: "time",
  },
  weather: {
    word: "el tiempo",
    lemma: "tiempo",
    pos: "n",
    gender: "el",
    meaning: "weather",
  },
  problem: {
    word: "el problema",
    lemma: "problema",
    pos: "n",
    gender: "el",
    meaning: "problem (masculine -ma noun)",
  },
  language: {
    word: "el idioma",
    lemma: "idioma",
    pos: "n",
    gender: "el",
    meaning: "language",
  },
  hand: {
    word: "la mano",
    lemma: "mano",
    pos: "n",
    gender: "la",
    meaning: "hand",
  },
  photo: {
    word: "la foto",
    lemma: "foto",
    pos: "n",
    gender: "la",
    meaning: "photo",
  },
  word: {
    word: "la palabra",
    lemma: "palabra",
    pos: "n",
    gender: "la",
    meaning: "word",
  },
  sentence: {
    word: "la frase",
    lemma: "frase",
    pos: "n",
    gender: "la",
    meaning: "sentence / phrase",
  },
  example: {
    word: "el ejemplo",
    lemma: "ejemplo",
    pos: "n",
    gender: "el",
    meaning: "example",
  },
  question: {
    word: "la pregunta",
    lemma: "pregunta",
    pos: "n",
    gender: "la",
    meaning: "question",
  },
  answer: {
    word: "la respuesta",
    lemma: "respuesta",
    pos: "n",
    gender: "la",
    meaning: "answer / reply",
  },
  mistake: {
    word: "el error",
    lemma: "error",
    pos: "n",
    gender: "el",
    meaning: "mistake / error",
  },
  rule: {
    word: "la regla",
    lemma: "regla",
    pos: "n",
    gender: "la",
    meaning: "rule",
  },
  lesson: {
    word: "la lección",
    lemma: "lección",
    pos: "n",
    gender: "la",
    meaning: "lesson",
  },
  origin: {
    word: "el origen",
    lemma: "origen",
    pos: "n",
    gender: "el",
    meaning: "origin (use SER: Soy de...)",
  },
  identity: {
    word: "la identidad",
    lemma: "identidad",
    pos: "n",
    gender: "la",
    meaning: "identity (use SER)",
  },
  location: {
    word: "la ubicación",
    lemma: "ubicación",
    pos: "n",
    gender: "la",
    meaning: "location (use ESTAR: Estoy en...)",
  },
  temporary: {
    word: "temporal",
    lemma: "temporal",
    pos: "adj",
    gender: null,
    meaning: "temporary (states use ESTAR)",
  },
  permanent: {
    word: "permanente",
    lemma: "permanente",
    pos: "adj",
    gender: null,
    meaning: "permanent (traits use SER)",
  },
  speak: {
    word: "hablar",
    lemma: "hablar",
    pos: "v",
    gender: null,
    meaning: "to speak / to talk",
  },
  eat: {
    word: "comer",
    lemma: "comer",
    pos: "v",
    gender: null,
    meaning: "to eat",
  },
  drink: {
    word: "beber / tomar",
    lemma: "beber",
    pos: "v",
    gender: null,
    meaning: "to drink / to have (a drink)",
  },
  live: {
    word: "vivir",
    lemma: "vivir",
    pos: "v",
    gender: null,
    meaning: "to live",
  },
  want: {
    word: "querer",
    lemma: "querer",
    pos: "v",
    gender: null,
    meaning: "to want",
  },
  need: {
    word: "necesitar",
    lemma: "necesitar",
    pos: "v",
    gender: null,
    meaning: "to need",
  },
  know: {
    word: "saber / conocer",
    lemma: "saber",
    pos: "v",
    gender: null,
    meaning: "to know (facts: saber / people & places: conocer)",
  },
  understand: {
    word: "entender",
    lemma: "entender",
    pos: "v",
    gender: null,
    meaning: "to understand",
  },
  learn: {
    word: "aprender",
    lemma: "aprender",
    pos: "v",
    gender: null,
    meaning: "to learn",
  },
  read: {
    word: "leer",
    lemma: "leer",
    pos: "v",
    gender: null,
    meaning: "to read",
  },
  write: {
    word: "escribir",
    lemma: "escribir",
    pos: "v",
    gender: null,
    meaning: "to write",
  },
  listen: {
    word: "escuchar",
    lemma: "escuchar",
    pos: "v",
    gender: null,
    meaning: "to listen",
  },
  buy: {
    word: "comprar",
    lemma: "comprar",
    pos: "v",
    gender: null,
    meaning: "to buy",
  },
  pay: {
    word: "pagar",
    lemma: "pagar",
    pos: "v",
    gender: null,
    meaning: "to pay",
  },
};

let curriculumWordMap: Map<string, WordLookupEntry> | null = null;
let curriculumEnglishReverseMap: Map<string, WordLookupEntry> | null = null;

function ensureCurriculumMaps(): {
  esMap: Map<string, WordLookupEntry>;
  enMap: Map<string, WordLookupEntry>;
} {
  if (curriculumWordMap && curriculumEnglishReverseMap) {
    return {
      esMap: curriculumWordMap,
      enMap: curriculumEnglishReverseMap,
    };
  }

  const esMap = new Map<string, WordLookupEntry>();
  const enMap = new Map<string, WordLookupEntry>();

  for (const item of TWELVE_WEEK_CURRICULUM) {
    for (let day = 1; day <= 7; day++) {
      try {
        const lesson = getBuiltInFallbackLesson(item.week, day);
        for (const nw of lesson.new_words) {
          const cleanWord = nw.word.trim().toLowerCase();
          const stripped = cleanWord.replace(/^(el|la|los|las)\s+/i, "").trim();
          const gender =
            nw.gender === "el" || nw.gender === "la" || nw.gender === "el/la"
              ? nw.gender
              : null;

          const esEntry: WordLookupEntry = {
            direction: "es-to-en",
            word: nw.word,
            lemma: nw.lemma || stripped,
            pos: nw.pos || "n",
            gender,
            meaning: nw.meaning,
            example_es: nw.example_es,
            example_tr: nw.example_tr,
            sourceBadge: "dictionary",
          };
          esMap.set(cleanWord, esEntry);
          if (stripped) {
            esMap.set(stripped, esEntry);
          }

          // Also index English gloss tokens for reverse lookup (English -> Spanish)
          const rawGlossParts = nw.meaning
            .toLowerCase()
            .replace(/\([^)]*\)/g, "")
            .split(/[,;/]+/);
          for (const part of rawGlossParts) {
            const cleanEn = part
              .trim()
              .replace(/^to\s+/i, "")
              .trim();
            if (cleanEn && cleanEn.length >= 2 && !enMap.has(cleanEn)) {
              enMap.set(cleanEn, {
                ...esEntry,
                direction: "en-to-es",
              });
            }
          }
        }
      } catch {
        // Ignore fallback errors
      }
    }
  }

  curriculumWordMap = esMap;
  curriculumEnglishReverseMap = enMap;
  return { esMap, enMap };
}

/**
 * Looks up a word or short phrase bidirectionally:
 * - If it matches a Spanish word in the built-in dictionary or curriculum, returns `direction: "es-to-en"`.
 * - If it matches an English word in the built-in reverse dictionary or curriculum glosses, returns `direction: "en-to-es"`,
 *   where `word` is the Spain Spanish (`es-ES`) translation and `meaning` is the English gloss.
 */
export function lookupBuiltInSpanishWord(rawWord: string): WordLookupEntry | null {
  const cleaned = cleanSelectedSpanishText(rawWord);
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  const withoutArticle = lower.replace(/^(el|la|los|las|un|una)\s+/i, "").trim();
  const { esMap, enMap } = ensureCurriculumMaps();

  // 1. Direct match in CORE_SPAIN_DICTIONARY (Spanish -> English)
  const directEs =
    CORE_SPAIN_DICTIONARY[lower] ?? CORE_SPAIN_DICTIONARY[withoutArticle];
  if (directEs) {
    return {
      direction: "es-to-en",
      word: cleaned,
      lemma: directEs.lemma,
      pos: directEs.pos,
      gender: directEs.gender,
      meaning: directEs.meaning,
      example_es: directEs.example_es,
      example_tr: directEs.example_tr,
      sourceBadge: "dictionary",
    };
  }

  // 2. Match in 12-week curriculum Spanish new_words
  const currEsMatch = esMap.get(lower) ?? esMap.get(withoutArticle);
  if (currEsMatch) {
    return {
      ...currEsMatch,
      direction: "es-to-en",
      word: cleaned,
    };
  }

  // 3. Simple Spanish plural stripping (e.g., "coches" -> "coche", "ciudades" -> "ciudad")
  if (withoutArticle.endsWith("es") && withoutArticle.length > 4) {
    const stemEs = withoutArticle.slice(0, -2);
    const hitEs = CORE_SPAIN_DICTIONARY[stemEs] ?? esMap.get(stemEs);
    if (hitEs) {
      return {
        direction: "es-to-en",
        word: cleaned,
        lemma: hitEs.lemma,
        pos: hitEs.pos,
        gender: hitEs.gender,
        meaning: `${hitEs.meaning} (plural)`,
        example_es: hitEs.example_es,
        example_tr: hitEs.example_tr,
        sourceBadge: "dictionary",
      };
    }
  }
  if (withoutArticle.endsWith("s") && withoutArticle.length > 3) {
    const stemS = withoutArticle.slice(0, -1);
    const hitS = CORE_SPAIN_DICTIONARY[stemS] ?? esMap.get(stemS);
    if (hitS) {
      return {
        direction: "es-to-en",
        word: cleaned,
        lemma: hitS.lemma,
        pos: hitS.pos,
        gender: hitS.gender,
        meaning: `${hitS.meaning} (plural)`,
        example_es: hitS.example_es,
        example_tr: hitS.example_tr,
        sourceBadge: "dictionary",
      };
    }
  }

  // 4. Reverse lookup (English -> Spain Spanish)
  const withoutEnglishPrefix = lower.replace(/^(to|the|a|an)\s+/i, "").trim();
  const singularEnglish =
    withoutEnglishPrefix.endsWith("s") && withoutEnglishPrefix.length > 3
      ? withoutEnglishPrefix.slice(0, -1)
      : withoutEnglishPrefix;

  const directEn =
    CORE_ENGLISH_TO_SPANISH_DICTIONARY[lower] ??
    CORE_ENGLISH_TO_SPANISH_DICTIONARY[withoutEnglishPrefix] ??
    CORE_ENGLISH_TO_SPANISH_DICTIONARY[singularEnglish];

  if (directEn) {
    return {
      direction: "en-to-es",
      word: directEn.word,
      lemma: directEn.lemma,
      pos: directEn.pos,
      gender: directEn.gender,
      meaning: directEn.meaning,
      example_es: directEn.example_es,
      example_tr: directEn.example_tr,
      sourceBadge: "dictionary",
    };
  }

  const currEnMatch =
    enMap.get(lower) ??
    enMap.get(withoutEnglishPrefix) ??
    enMap.get(singularEnglish);
  if (currEnMatch) {
    return {
      ...currEnMatch,
      direction: "en-to-es",
    };
  }

  return null;
}
