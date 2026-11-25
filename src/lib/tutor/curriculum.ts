import { LessonRecord } from "@/types/database";

export interface DailyTopicSpec {
  week: number;
  day: number; // 1..7 (7 = review boss test)
  city: string;
  cefr: "A1" | "A2" | "B1";
  weekFocus: string;
  dayTitle: string;
  isReviewTest: boolean;
}

export interface WeekCurriculumSpec {
  week: number;
  city: string;
  cefr: "A1" | "A2" | "B1";
  weekFocus: string;
  days: [string, string, string, string, string, string, string];
}

export const TWELVE_WEEK_CURRICULUM: WeekCurriculumSpec[] = [
  {
    week: 1,
    city: "Madrid",
    cefr: "A1",
    weekFocus: "Pronunciation & spelling rules, ser/estar basics, articles, gender & plural",
    days: [
      "Spanish Alphabet & Madrid Sounds (distinción c/z as θ, j, ll, ñ, rr)",
      "Greetings, Politeness & Subject Pronouns (yo, tú, usted, vosotros)",
      "Noun Gender & Definite Articles (el, la) with Common Madrid Nouns",
      "Indefinite Articles (un, una, unos, unas) & Making Plurals (-s, -es)",
      "Ser Present Tense (soy, eres, es, somos, sois, son) for Identity & Origin",
      "Estar Present Tense (estoy, estás, está, estamos, estáis, están) & Ser vs Estar Basics",
      "Week 1 Madrid Boss Review Test: Sounds, Articles & Ser/Estar",
    ],
  },
  {
    week: 2,
    city: "Toledo",
    cefr: "A1",
    weekFocus: "Present tense regular verbs, questions, negation, hay",
    days: [
      "Regular -AR Verbs in Present Tense (hablar, trabajar, comprar — incl. vosotros habláis)",
      "Regular -ER & -IR Verbs in Present Tense (comer, beber, vivir — coméis, vivís)",
      "Hay (There is / There are) & Describing Places in Toledo",
      "Negation with 'no' & Asking Yes/No Questions",
      "Question Words with Accents (¿qué?, ¿dónde?, ¿cuándo?, ¿cuánto?, ¿por qué?)",
      "Numbers 1–100, Telling Time & Ordering in a Café",
      "Week 2 Toledo Boss Review Test: Regular Present Tense, Questions & Hay",
    ],
  },
  {
    week: 3,
    city: "Segovia",
    cefr: "A1",
    weekFocus: "Stem-changing & irregular present (tener, ir, hacer, poder, querer)",
    days: [
      "Tener (to have) & Tener expressions (tener hambre, prisa, razón, tener que + inf.)",
      "Ir (to go — voy, vas, va, vamos, vais, van) & Preposition 'a' (al / a la)",
      "Stem-Changing e→ie Verbs (querer, preferir, empezar, entender)",
      "Stem-Changing o→ue & e→i Verbs (poder, dormir, volver, pedir)",
      "First-Person Irregular 'Yo-Go' Verbs (hacer, poner, salir, traer, decir)",
      "Market & Shopping Expressions in Spain (¿Cuánto cuesta?, vale, efectivo, tarjeta)",
      "Week 3 Segovia Boss Review Test: Irregular & Stem-Changing Present",
    ],
  },
  {
    week: 4,
    city: "Salamanca",
    cefr: "A1",
    weekFocus: "Gustar-type verbs, direct/indirect object pronouns",
    days: [
      "Gustar (me gusta / me gustan, te, le, nos, os, les) & Clarifiers (a mí, a vosotros)",
      "Other Gustar-Type Verbs (encantar, interesar, importar, parecer, doler)",
      "Direct Object Pronouns (me, te, lo/le, la, nos, os, los, las)",
      "Indirect Object Pronouns (me, te, le, nos, os, les) & Placement Rules",
      "Combining Direct & Indirect Pronouns (se lo, se la, me lo puedes dar)",
      "Demonstratives (este, ese, aquel) & Possessives (mi, tu, vuestro)",
      "Week 4 Salamanca Boss Review Test: Gustar & Object Pronouns (A1→A2 Check)",
    ],
  },
  {
    week: 5,
    city: "León",
    cefr: "A2",
    weekFocus: "Near future (ir a), reflexive verbs, daily routine",
    days: [
      "Near Future: Ir a + Infinitive for Plans in Madrid",
      "Reflexive Verbs for Daily Routine (levantarse, ducharse, vestirse, acostarse)",
      "Vosotros Reflexive Forms (os levantáis, os vais) & Reciprocal Actions",
      "Frequency Adverbs & Time Sequencers (primero, luego, después, siempre, a menudo)",
      "Obligation & Ongoing Actions (tener que, hay que, estar + gerundio)",
      "Checking in at a Hotel/Hostel & Describing Your Daily Schedule",
      "Week 5 León Boss Review Test: Ir a, Reflexives & Daily Routine",
    ],
  },
  {
    week: 6,
    city: "Santiago de Compostela",
    cefr: "A2",
    weekFocus: "Preterite (regular + key irregulars)",
    days: [
      "Regular -AR Preterite (hablé, hablaste, habló, hablamos, hablasteis, hablaron)",
      "Regular -ER/-IR Preterite (comí, comiste, comió, comimos, comisteis, comieron)",
      "Ir & Ser in the Preterite (fui, fuiste, fue, fuimos, fuisteis, fueron)",
      "High-Frequency Irregular Preterite Stems (tener→tuv-, estar→estuv-, hacer→hic-)",
      "More Irregular Preterite Stems (poder→pud-, poner→pus-, venir→vin-, decir→dij-)",
      "Past Time Markers for Completed Days (ayer, anoche, la semana pasada, hace dos días)",
      "Week 6 Santiago Boss Review Test: Preterite Tense Mastery",
    ],
  },
  {
    week: 7,
    city: "Bilbao",
    cefr: "A2",
    weekFocus: "Imperfect; preterite vs imperfect",
    days: [
      "Regular Imperfect Tense (-aba for -AR, -ía for -ER/-IR) for Past Habits",
      "The Only 3 Irregular Verbs in the Imperfect (ser: era, ir: iba, ver: veía)",
      "Describing Background Scenes, Age, Time & Weather in the Past (hacía sol, tenía diez años)",
      "Preterite vs Imperfect Part 1: Interrupted Actions (estaba trabajando cuando sonó el móvil)",
      "Preterite vs Imperfect Part 2: Main Events vs Background Descriptions",
      "Solía + Infinitive (Used to) & Storytelling Connectors (de niño, mientras, de repente)",
      "Week 7 Bilbao Boss Review Test: Imperfect vs Preterite",
    ],
  },
  {
    week: 8,
    city: "Zaragoza",
    cefr: "A2",
    weekFocus: "Present perfect (he hecho — very common in Spain), por/para",
    days: [
      "Present Perfect (Pretérito Perfecto): Haber (he, has, ha, hemos, habéis, han) + Regular Participles",
      "Irregular Past Participles (hecho, dicho, visto, puesto, escrito, abierto, vuelto, roto)",
      "Spain Usage Rule: Present Perfect for Today/This Week (hoy he ido) vs Preterite (ayer fui)",
      "Ya, Todavía no, Alguna vez & Nunca with Present Perfect",
      "Por vs Para Part 1: Cause/Exchange/Duration (por) vs Goal/Recipient/Deadline (para)",
      "Por vs Para Part 2: Idiomatic Madrid Expressions & Banking/Gestoría Vocabulary",
      "Week 8 Zaragoza Boss Review Test: Present Perfect & Por/Para (A2→B1 Check)",
    ],
  },
  {
    week: 9,
    city: "Barcelona",
    cefr: "B1",
    weekFocus: "Future & conditional, comparatives",
    days: [
      "Simple Future Tense (-é, -ás, -á, -emos, -éis, -án) for Predictions & Promises",
      "Irregular Future Stems (tendré, haré, podré, sabré, diré, saldré, vendré, habrá)",
      "Future of Probability in Spain (¿Dónde estará Juan? Estará en la oficina)",
      "Conditional Tense (-ía, -ías, -ía, -íamos, -íais, -ían) for Polite Requests & Advice",
      "Comparatives & Superlatives (más/menos... que, tan... como, mejor, peor, el más grande de)",
      "Business & Negotiation Phrases (acordar, presupuesto, proveedor, os propongo)",
      "Week 9 Barcelona Boss Review Test: Future, Conditional & Comparatives",
    ],
  },
  {
    week: 10,
    city: "Valencia",
    cefr: "B1",
    weekFocus: "Imperative (tú/usted/vosotros), polite requests",
    days: [
      "Affirmative Tú Commands (habla, come, escribe) & the 8 Irregulars (ven, di, sal, haz, ten, ve, pon, sé)",
      "Affirmative Vosotros Commands (hablad, comed, venid — dropping the -d with 'os': sentaos, callaos)",
      "Formal Usted/Ustedes Commands & Negative Commands (no hables, no habléis, no diga)",
      "Pronoun Placement with Commands (dímelo vs no me lo digas)",
      "Polite Requests for Flat-Hunting & Landlords in Spain (¿Podría enseñarme el piso?, fianza, contrato)",
      "Impersonal 'Se' (se alquila, se habla español, cómo se va a...)",
      "Week 10 Valencia Boss Review Test: Imperatives & Polite Requests",
    ],
  },
  {
    week: 11,
    city: "Granada",
    cefr: "B1",
    weekFocus: "Present subjunctive: wishes, recommendations, cuando + subj.",
    days: [
      "How to Form the Present Subjunctive (yo form → opposite endings: hable, coma, tengas, hagáis)",
      "6 Irregular Subjunctive Verbs (DISHES: dar, ir, ser, haber, estar, saber)",
      "Wishes & Requests (quiero que, espero que, os pido que + subjunctive)",
      "Recommendations & Impersonal Expressions (es importante que, os recomiendo que + subjunctive)",
      "Doubt, Emotion & Ojalá (no creo que + subj. vs creo que + indicative, me alegra que)",
      "Time Clauses for the Future: Cuando + Subjunctive (cuando llegues a Madrid, llámame)",
      "Week 11 Granada Boss Review Test: Present Subjunctive in Context",
    ],
  },
  {
    week: 12,
    city: "Sevilla",
    cefr: "B1",
    weekFocus: "Subjunctive consolidation, connectors, final B1 mock test",
    days: [
      "Indicative vs Subjunctive Contrast & Relative Clauses (busco un bar que tenga terraza)",
      "Discourse Connectors for B1 Fluency (sin embargo, por lo tanto, aunque + ind./subj., además)",
      "Reported Speech & Summarizing Conversations (me ha dicho que...)",
      "Business Pitching in Spain: Presenting a Powerbank Station to a Madrid Bar Owner",
      "Administrative Spanish: NIE/TIE, Gestoría, Bank & Lawyer Vocabulary Review",
      "Full 12-Week Grammar & Error Patterns Consolidation",
      "Week 12 Sevilla & Madrid Final B1 Mock Test",
    ],
  },
];

export function getCurriculumSpecForDay(
  week: number,
  day: number
): DailyTopicSpec {
  const safeWeek = Math.min(12, Math.max(1, Math.round(week)));
  const safeDay = Math.min(7, Math.max(1, Math.round(day)));
  const wkSpec = TWELVE_WEEK_CURRICULUM[safeWeek - 1];
  const dayTitle = wkSpec.days[safeDay - 1];

  return {
    week: safeWeek,
    day: safeDay,
    city: wkSpec.city,
    cefr: wkSpec.cefr,
    weekFocus: wkSpec.weekFocus,
    dayTitle,
    isReviewTest: safeDay === 7,
  };
}

/**
 * Builds the core Madrid tutor system prompt strictly following docs/SPEC.md section "AI tutor rules (system prompt core)".
 */
export function buildMadridTutorSystemPrompt(params: {
  cefr: string;
  topic: string;
  knownLemmasSample: string[];
  recentErrors: { category: string; wrong: string; correct: string }[];
  spanishOnlyMode?: boolean;
}): string {
  const knownList =
    params.knownLemmasSample.length > 0
      ? params.knownLemmasSample.slice(0, 60).join(", ")
      : "complete beginner (hola, sí, no, gracias, por favor, ser, estar, el, la)";

  const errorsList =
    params.recentErrors.length > 0
      ? params.recentErrors
          .slice(0, 20)
          .map((e) => `[${e.category}] "${e.wrong}" -> "${e.correct}"`)
          .join("; ")
      : "none yet";

  const langInstruction = params.spanishOnlyMode
    ? "Spanish-only mode is active (Week 7+): write explanations and feedback in clear, simple Spain Spanish (es-ES)."
    : "Explain in English; examples in Spanish. Keep explanations under 120 words.";

  return [
    "You are a patient Spanish tutor from Madrid. Teach **Spain Spanish** (es-ES): use *vosotros*, Peninsular vocabulary (*coche, móvil, ordenador, piso, vale, zumo, bolígrafo*), and present perfect (*he hecho*) for today's events.",
    `Learner level: ${params.cefr}. Current grammar topic: ${params.topic}. Known words: ${knownList}. Recent errors: ${errorsList}.`,
    langInstruction,
    "Use mostly known words; introduce at most 5 new words per lesson and list them.",
    'When correcting: show the corrected sentence, name the rule in one line, and return the error as JSON `{"category", "wrong", "correct", "explanation"}` so the app can save it.',
    "Exercises are returned as JSON matching the app's exercise schema; never free-form when an exercise is requested.",
  ].join("\n");
}

/**
 * Built-in curated Madrid lessons so every Week & Day loads instantaneously (< 5ms)
 * without waiting on a network spinner, while allowing on-demand AI regeneration.
 */
export function getBuiltInFallbackLesson(
  week: number,
  day: number
): LessonRecord {
  const spec = getCurriculumSpecForDay(week, day);
  const key = `w${spec.week}-d${spec.day}`;

  const curatedLessons: Record<
    string,
    Omit<
      LessonRecord,
      "id" | "week" | "day" | "city" | "topic" | "completed_at" | "score"
    >
  > = {
    "w1-d1": {
      explanation:
        "In Madrid (Spain Spanish, es-ES), Spanish is phonetic with a signature distinction: 'z' and 'c' (before 'e' or 'i') sound like English 'th' in 'think' (θ), as in 'gracias', 'cinco', and 'zapato'. Meanwhile, 'j' (and 'g' before 'e/i') has a crisp throat rasp, 'll' sounds like 'y', 'ñ' sounds like 'ny' in 'canyon', and 'h' is always silent ('hola' = OH-lah).",
      examples: [
        {
          es: "Hola, muchas gracias por el café.",
          en: "Hello, thank you very much for the coffee. (Silent 'h' in hola, Madrid 'th' in gracias)",
        },
        {
          es: "La plaza de Madrid es preciosa.",
          en: "The square in Madrid is beautiful. ('z' in plaza and 'ci' in preciosa use θ)",
        },
        {
          es: "Mañana bajo a la calle.",
          en: "Tomorrow I go down to the street. ('ñ' = ny, 'j' = kh, 'll' = y)",
        },
      ],
      new_words: [
        {
          word: "gracias",
          lemma: "gracias",
          meaning: "thank you",
          pos: "interj",
          gender: null,
          example_es: "Muchas gracias por todo.",
          example_tr: "Thank you very much for everything.",
        },
        {
          word: "la plaza",
          lemma: "plaza",
          meaning: "town square / plaza",
          pos: "nf",
          gender: "la",
          example_es: "Nos vemos en la plaza Mayor.",
          example_tr: "See you in the Plaza Mayor.",
        },
        {
          word: "la calle",
          lemma: "calle",
          meaning: "street",
          pos: "nf",
          gender: "la",
          example_es: "Vivo en la calle Alcalá.",
          example_tr: "I live on Alcalá Street.",
        },
        {
          word: "mañana",
          lemma: "mañana",
          meaning: "tomorrow / morning",
          pos: "adv",
          gender: null,
          example_es: "Hasta mañana.",
          example_tr: "See you tomorrow.",
        },
        {
          word: "el jamón",
          lemma: "jamón",
          meaning: "cured ham",
          pos: "nm",
          gender: "el",
          example_es: "Un bocadillo de jamón, por favor.",
          example_tr: "A ham sandwich, please.",
        },
      ],
      exercises: [
        {
          id: "ex-1",
          type: "fill_in",
          prompt: "__, buenos días. (Write 'Hello' — starts with a silent H)",
          answer: "Hola",
          hint: "Spelled H-o-l-a; the H is silent",
        },
        {
          id: "ex-2",
          type: "translate",
          prompt: "Translate to Spain Spanish: Thank you",
          answer: "Gracias",
          hint: "Pronounced GRAH-thyahs in Madrid",
        },
        {
          id: "ex-3",
          type: "fill_in",
          prompt: "Vivo en __ calle Mayor. (Write the feminine article 'la')",
          answer: "la",
          hint: "'calle' is feminine singular",
        },
        {
          id: "ex-4",
          type: "transform",
          prompt: "Fix the spelling for 'tomorrow': manana → __",
          answer: "mañana",
          hint: "Requires the tilde over the ñ (ny sound)",
        },
        {
          id: "ex-5",
          type: "fill_in",
          prompt: "Estamos en la pla__a. (Write the single letter for the Madrid 'th' sound before 'a')",
          answer: "z",
          hint: "Spelled 'plaza' with a z",
        },
        {
          id: "ex-6",
          type: "translate",
          prompt: "Translate to Spain Spanish: the street",
          answer: "la calle",
          hint: "Uses double L ('ll')",
        },
        {
          id: "ex-7",
          type: "fill_in",
          prompt: "Quiero pan con __ (cured ham — starts with J and ends with accented ó-n).",
          answer: "jamón",
          hint: "Spelled j-a-m-ó-n",
        },
        {
          id: "ex-8",
          type: "build_sentence",
          prompt: "Order the words to say 'See you tomorrow in the square':",
          answer: "Hasta mañana en la plaza",
          options: ["plaza", "mañana", "Hasta", "la", "en"],
          hint: "Hasta mañana + en la plaza",
        },
      ],
    },
    "w1-d2": {
      explanation:
        "In Spain, we distinguish between informal and formal 'you': use 'tú' for one friend and 'vosotros/vosotras' for a group of friends ('you all'). Use 'usted' only for formal respect (a stranger, older person, or official). In Madrid, people greet with '¡Hola!', 'Buenos días' (until 2 PM), 'Buenas tardes' (afternoon/evening), and '¿Qué tal?' (How's it going?).",
      examples: [
        {
          es: "¡Hola! ¿Qué tal estás tú?",
          en: "Hi! How are you doing? (Informal singular 'tú')",
        },
        {
          es: "¿Vosotros sois de aquí, de Madrid?",
          en: "Are you all from here, from Madrid? (Spain plural 'vosotros')",
        },
        {
          es: "Buenos días, señor, ¿cómo está usted?",
          en: "Good morning, sir, how are you? (Formal 'usted')",
        },
      ],
      new_words: [
        {
          word: "vosotros",
          lemma: "vosotros",
          meaning: "you all (informal plural in Spain)",
          pos: "pron",
          gender: null,
          example_es: "¿Vosotros habláis español?",
          example_tr: "Do you all speak Spanish?",
        },
        {
          word: "buenos días",
          lemma: "buenos días",
          meaning: "good morning",
          pos: "phrase",
          gender: null,
          example_es: "Buenos días, un café, por favor.",
          example_tr: "Good morning, a coffee, please.",
        },
        {
          word: "buenas tardes",
          lemma: "buenas tardes",
          meaning: "good afternoon / evening",
          pos: "phrase",
          gender: null,
          example_es: "Buenas tardes a todos.",
          example_tr: "Good afternoon to everyone.",
        },
        {
          word: "por favor",
          lemma: "por favor",
          meaning: "please",
          pos: "phrase",
          gender: null,
          example_es: "La cuenta, por favor.",
          example_tr: "The bill, please.",
        },
        {
          word: "hasta luego",
          lemma: "hasta luego",
          meaning: "see you later",
          pos: "phrase",
          gender: null,
          example_es: "¡Vale, hasta luego!",
          example_tr: "Okay, see you later!",
        },
      ],
      exercises: [
        {
          id: "ex-1",
          type: "fill_in",
          prompt: "In Spain, the informal plural 'you all' for friends is __ (vosotros / ustedes).",
          answer: "vosotros",
          hint: "Signature Spain pronoun for a group of friends",
        },
        {
          id: "ex-2",
          type: "fill_in",
          prompt: "__ días, ¿qué tal? (Write 'Good' for 'Good morning')",
          answer: "Buenos",
          hint: "'días' is masculine plural -> Buenos",
        },
        {
          id: "ex-3",
          type: "fill_in",
          prompt: "__ tardes, señora. (Write 'Good' for 'Good afternoon')",
          answer: "Buenas",
          hint: "'tardes' is feminine plural -> Buenas",
        },
        {
          id: "ex-4",
          type: "transform",
          prompt: "Change singular informal 'you' to Spain plural 'you all': tú → __",
          answer: "vosotros",
          hint: "Plural of tú in Spain",
        },
        {
          id: "ex-5",
          type: "translate",
          prompt: "Translate to Spain Spanish: please",
          answer: "por favor",
          hint: "Two words: por + favor",
        },
        {
          id: "ex-6",
          type: "translate",
          prompt: "Translate to Spain Spanish: see you later",
          answer: "hasta luego",
          hint: "Hasta + luego",
        },
        {
          id: "ex-7",
          type: "fill_in",
          prompt: "¿Cómo está __, señor López? (Write the formal singular 'you')",
          answer: "usted",
          hint: "Formal singular pronoun",
        },
        {
          id: "ex-8",
          type: "build_sentence",
          prompt: "Order the words to say 'Good morning, a coffee please':",
          answer: "Buenos días un café por favor",
          options: ["por", "días", "Buenos", "favor", "un", "café"],
          hint: "Greeting + un café + por favor",
        },
      ],
    },
    "w1-d3": {
      explanation:
        "Every Spanish noun has a grammatical gender: masculine nouns take 'el' (singular) and feminine nouns take 'la' (singular). Usually, nouns ending in -o are masculine (el piso, el libro, el metro) and nouns ending in -a are feminine (la mesa, la cuenta, la terraza). Watch out for common exceptions like 'el día' (masculine) and 'la mano' (feminine), and nouns ending in -ción or -dad which are always feminine (la estación, la ciudad).",
      examples: [
        {
          es: "El metro de Madrid es muy rápido.",
          en: "The Madrid metro is very fast. (Masculine 'el metro')",
        },
        {
          es: "La estación de Atocha es enorme.",
          en: "Atocha station is huge. (Words ending in -ción are always feminine 'la')",
        },
        {
          es: "La cuenta está en la mesa.",
          en: "The bill is on the table. (Both end in -a and take 'la')",
        },
      ],
      new_words: [
        {
          word: "el metro",
          lemma: "metro",
          meaning: "subway / underground",
          pos: "nm",
          gender: "el",
          example_es: "Voy al centro en el metro.",
          example_tr: "I go downtown on the metro.",
        },
        {
          word: "la estación",
          lemma: "estación",
          meaning: "station",
          pos: "nf",
          gender: "la",
          example_es: "¿Dónde está la estación de tren?",
          example_tr: "Where is the train station?",
        },
        {
          word: "la cuenta",
          lemma: "cuenta",
          meaning: "bill / check",
          pos: "nf",
          gender: "la",
          example_es: "¿Nos trae la cuenta, por favor?",
          example_tr: "Could you bring us the bill, please?",
        },
        {
          word: "la terraza",
          lemma: "terraza",
          meaning: "outdoor café terrace",
          pos: "nf",
          gender: "la",
          example_es: "Tomamos algo en la terraza.",
          example_tr: "Let's have a drink on the terrace.",
        },
        {
          word: "el día",
          lemma: "día",
          meaning: "day",
          pos: "nm",
          gender: "el",
          example_es: "Hoy es un buen día.",
          example_tr: "Today is a good day.",
        },
      ],
      exercises: [
        {
          id: "ex-1",
          type: "fill_in",
          prompt: "__ metro va al centro. (Write 'El' or 'La')",
          answer: "El",
          hint: "'metro' ends in -o and is masculine",
        },
        {
          id: "ex-2",
          type: "fill_in",
          prompt: "__ terraza está llena hoy. (Write 'El' or 'La')",
          answer: "La",
          hint: "'terraza' ends in -a and is feminine",
        },
        {
          id: "ex-3",
          type: "fill_in",
          prompt: "__ estación está cerca. (Write 'El' or 'La' — nouns ending in -ción)",
          answer: "La",
          hint: "All nouns ending in -ción are feminine",
        },
        {
          id: "ex-4",
          type: "fill_in",
          prompt: "Watch the exception: __ día es bonito. ('día' is masculine!)",
          answer: "El",
          hint: "Even though 'día' ends in -a, it is masculine ('el día')",
        },
        {
          id: "ex-5",
          type: "translate",
          prompt: "Translate to Spain Spanish (include article): the bill",
          answer: "la cuenta",
          hint: "Feminine noun: la cuenta",
        },
        {
          id: "ex-6",
          type: "translate",
          prompt: "Translate to Spain Spanish (include article): the station",
          answer: "la estación",
          hint: "Don't forget the accent on the ó",
        },
        {
          id: "ex-7",
          type: "transform",
          prompt: "Add the correct definite article (el / la): __ ciudad (the city)",
          answer: "la ciudad",
          hint: "Nouns ending in -dad are always feminine",
        },
        {
          id: "ex-8",
          type: "build_sentence",
          prompt: "Order the words to say 'The station is in Madrid':",
          answer: "La estación está en Madrid",
          options: ["en", "estación", "La", "Madrid", "está"],
          hint: "La estación + está + en Madrid",
        },
      ],
    },
    "w1-d4": {
      explanation:
        "Indefinite articles mean 'a/an' (un for masculine, una for feminine) and 'some/a few' in the plural (unos, unas). To make Spanish nouns plural: add '-s' if the word ends in a vowel (una caña → unas cañas; un billete → unos billetes), or add '-es' if it ends in a consonant (un bar → unos bares; una ciudad → unas ciudades). If a word ends in '-z', change z → c before adding '-es' (una vez → unas veces).",
      examples: [
        {
          es: "Quiero una entrada y dos billetes de tren.",
          en: "I want a ticket and two train tickets. (Vowel ending adds -s)",
        },
        {
          es: "En este barrio hay unos bares de tapas geniales.",
          en: "In this neighborhood there are some great tapas bars. (Consonant 'r' adds -es)",
        },
        {
          es: "Tomamos unas aceitunas en la terraza.",
          en: "We are having some olives on the terrace. (Feminine plural 'unas')",
        },
      ],
      new_words: [
        {
          word: "el billete",
          lemma: "billete",
          meaning: "ticket (train/metro) / banknote",
          pos: "nm",
          gender: "el",
          example_es: "Compro un billete de metro.",
          example_tr: "I buy a metro ticket.",
        },
        {
          word: "el barrio",
          lemma: "barrio",
          meaning: "neighborhood / district",
          pos: "nm",
          gender: "el",
          example_es: "Malasaña es un barrio de Madrid.",
          example_tr: "Malasaña is a neighborhood in Madrid.",
        },
        {
          word: "la caña",
          lemma: "caña",
          meaning: "small draft beer (Spain)",
          pos: "nf",
          gender: "la",
          example_es: "Ponme una caña, por favor.",
          example_tr: "Pour me a small draft beer, please.",
        },
        {
          word: "el bar",
          lemma: "bar",
          meaning: "bar / café-bar",
          pos: "nm",
          gender: "el",
          example_es: "Hay muchos bares en esta calle.",
          example_tr: "There are many bars on this street.",
        },
        {
          word: "la tapa",
          lemma: "tapa",
          meaning: "small Spanish appetizer / tapa",
          pos: "nf",
          gender: "la",
          example_es: "Pedimos unas tapas para compartir.",
          example_tr: "We order some tapas to share.",
        },
      ],
      exercises: [
        {
          id: "ex-1",
          type: "fill_in",
          prompt: "Compro __ billete para Toledo. (Write 'a' masculine: un / una)",
          answer: "un",
          hint: "'billete' is masculine singular",
        },
        {
          id: "ex-2",
          type: "fill_in",
          prompt: "Pedimos __ caña bien fría. (Write 'a' feminine: un / una)",
          answer: "una",
          hint: "'caña' is feminine singular",
        },
        {
          id: "ex-3",
          type: "transform",
          prompt: "Make plural: una tapa → __",
          answer: "unas tapas",
          hint: "Change una -> unas and add -s",
        },
        {
          id: "ex-4",
          type: "transform",
          prompt: "Make plural: un bar → __",
          answer: "unos bares",
          hint: "Words ending in consonant 'r' add -es",
        },
        {
          id: "ex-5",
          type: "transform",
          prompt: "Make plural: el billete → __",
          answer: "los billetes",
          hint: "Plural of 'el' is 'los', plus -s",
        },
        {
          id: "ex-6",
          type: "translate",
          prompt: "Translate to Spain Spanish: a neighborhood",
          answer: "un barrio",
          hint: "Masculine singular: un barrio",
        },
        {
          id: "ex-7",
          type: "fill_in",
          prompt: "Tomamos __ tapas en el centro. (Write 'some' feminine plural: unos / unas)",
          answer: "unas",
          hint: "'tapas' is feminine plural",
        },
        {
          id: "ex-8",
          type: "build_sentence",
          prompt: "Order the words to say 'We want some tapas please':",
          answer: "Queremos unas tapas por favor",
          options: ["tapas", "Queremos", "favor", "unas", "por"],
          hint: "Queremos + unas tapas + por favor",
        },
      ],
    },
    "w1-d5": {
      explanation:
        "Use the verb 'ser' (to be) for permanent identity, nationality, origin ('ser de'), profession, and inherent qualities. Its present tense forms in Spain are: yo soy (I am), tú eres (you are), él/ella/usted es (he/she/you formal is), nosotros somos (we are), vosotros sois (you all are — Spain), and ellos/ustedes son (they are).",
      examples: [
        {
          es: "Yo soy empresario y soy de aquí.",
          en: "I am an entrepreneur and I am from here. (Identity & origin use 'soy')",
        },
        {
          es: "¿Vosotros sois de Madrid o de Sevilla?",
          en: "Are you all from Madrid or from Seville? (Vosotros form 'sois')",
        },
        {
          es: "Nosotros somos socios en España.",
          en: "We are business partners in Spain. ('somos' = we are)",
        },
      ],
      new_words: [
        {
          word: "ser",
          lemma: "ser",
          meaning: "to be (identity, origin, traits)",
          pos: "v",
          gender: null,
          example_es: "Soy extranjero en Madrid.",
          example_tr: "I am a foreigner in Madrid.",
        },
        {
          word: "el socio",
          lemma: "socio",
          meaning: "partner / business partner / member",
          pos: "nm",
          gender: "el",
          example_es: "Él es mi socio en el negocio.",
          example_tr: "He is my partner in the business.",
        },
        {
          word: "el negocio",
          lemma: "negocio",
          meaning: "business",
          pos: "nm",
          gender: "el",
          example_es: "El negocio es muy rentable.",
          example_tr: "The business is very profitable.",
        },
        {
          word: "español",
          lemma: "español",
          meaning: "Spanish",
          pos: "adj",
          gender: null,
          example_es: "Mis amigos son españoles.",
          example_tr: "My friends are Spanish.",
        },
        {
          word: "de dónde",
          lemma: "de dónde",
          meaning: "from where",
          pos: "phrase",
          gender: null,
          example_es: "¿De dónde eres tú?",
          example_tr: "Where are you from?",
        },
      ],
      exercises: [
        {
          id: "ex-1",
          type: "fill_in",
          prompt: "Yo __ de Madrid. (Conjugate 'ser' for 'yo')",
          answer: "soy",
          hint: "First-person singular of ser is 'soy'",
        },
        {
          id: "ex-2",
          type: "fill_in",
          prompt: "¿De dónde __ tú? (Conjugate 'ser' for 'tú')",
          answer: "eres",
          hint: "Second-person singular of ser is 'eres'",
        },
        {
          id: "ex-3",
          type: "fill_in",
          prompt: "¿Vosotros __ españoles? (Conjugate 'ser' for 'vosotros')",
          answer: "sois",
          hint: "Vosotros form of ser is 'sois'",
        },
        {
          id: "ex-4",
          type: "fill_in",
          prompt: "Nosotros __ socios en Madrid. (Conjugate 'ser' for 'nosotros')",
          answer: "somos",
          hint: "First-person plural of ser is 'somos'",
        },
        {
          id: "ex-5",
          type: "transform",
          prompt: "Change from singular to plural: Él es mi socio → Ellos __ mis socios",
          answer: "son",
          hint: "Third-person plural of ser is 'son'",
        },
        {
          id: "ex-6",
          type: "translate",
          prompt: "Translate to Spain Spanish: Where are you from? (informal tú)",
          answer: "¿De dónde eres?",
          hint: "De dónde + eres",
        },
        {
          id: "ex-7",
          type: "fill_in",
          prompt: "El negocio __ nuevo. (Conjugate 'ser' for 3rd person singular)",
          answer: "es",
          hint: "3rd person singular of ser is 'es'",
        },
        {
          id: "ex-8",
          type: "build_sentence",
          prompt: "Order the words to say 'We are partners in Madrid':",
          answer: "Nosotros somos socios en Madrid",
          options: ["socios", "somos", "Madrid", "Nosotros", "en"],
          hint: "Nosotros + somos + socios + en Madrid",
        },
      ],
    },
    "w1-d6": {
      explanation:
        "Use 'estar' (to be) for physical locations (even permanent places like buildings!) and temporary states/moods (tired, busy, open, closed). Forms: estoy, estás, está, estamos, estáis, están — notice the written accent marks on estás, está, estáis, están! Golden rule: 'Ser' for WHO/WHAT/FROM WHERE you are; 'Estar' for WHERE you are and HOW you feel.",
      examples: [
        {
          es: "Soy de fuera, pero ahora estoy en Madrid.",
          en: "I am from abroad (ser = origin), but right now I am in Madrid (estar = location).",
        },
        {
          es: "¿Dónde estáis vosotros? —Estamos cerca del Retiro.",
          en: "Where are you all? —We are near Retiro park. (Location always takes estar)",
        },
        {
          es: "El banco está cerrado hoy, pero yo estoy listo.",
          en: "The bank is closed today, but I am ready. (Temporary states take estar)",
        },
      ],
      new_words: [
        {
          word: "estar",
          lemma: "estar",
          meaning: "to be (location & state)",
          pos: "v",
          gender: null,
          example_es: "¿Dónde está la salida?",
          example_tr: "Where is the exit?",
        },
        {
          word: "cerca",
          lemma: "cerca",
          meaning: "near / close by",
          pos: "adv",
          gender: null,
          example_es: "La farmacia está muy cerca.",
          example_tr: "The pharmacy is very close.",
        },
        {
          word: "lejos",
          lemma: "lejos",
          meaning: "far",
          pos: "adv",
          gender: null,
          example_es: "No está lejos de aquí.",
          example_tr: "It is not far from here.",
        },
        {
          word: "abierto",
          lemma: "abierto",
          meaning: "open",
          pos: "adj",
          gender: null,
          example_es: "El supermercado está abierto.",
          example_tr: "The supermarket is open.",
        },
        {
          word: "cansado",
          lemma: "cansado",
          meaning: "tired",
          pos: "adj",
          gender: null,
          example_es: "Hoy estoy un poco cansado.",
          example_tr: "Today I am a bit tired.",
        },
      ],
      exercises: [
        {
          id: "ex-1",
          type: "fill_in",
          prompt: "Yo __ en el centro de Madrid ahora. (soy / estoy)",
          answer: "estoy",
          hint: "Physical location always uses 'estar' -> estoy",
        },
        {
          id: "ex-2",
          type: "fill_in",
          prompt: "¿Dónde __ la estación de metro? (es / está — watch the accent!)",
          answer: "está",
          hint: "Even buildings use 'está' for physical location",
        },
        {
          id: "ex-3",
          type: "fill_in",
          prompt: "Nosotros __ de España, pero __ en Londres hoy. (Write: somos, estamos)",
          answer: "somos, estamos",
          hint: "Origin = somos; current location = estamos",
        },
        {
          id: "ex-4",
          type: "fill_in",
          prompt: "¿Vosotros __ cansados hoy? (sois / estáis)",
          answer: "estáis",
          hint: "Temporary state (tired) for vosotros is 'estáis'",
        },
        {
          id: "ex-5",
          type: "transform",
          prompt: "Fix the mistake: Yo soy cansado → Yo __ cansado",
          answer: "estoy",
          hint: "Tiredness is a temporary state -> estoy",
        },
        {
          id: "ex-6",
          type: "translate",
          prompt: "Translate to Spain Spanish: The bar is open",
          answer: "El bar está abierto",
          hint: "Use 'está' + abierto",
        },
        {
          id: "ex-7",
          type: "fill_in",
          prompt: "La oficina está muy __ (near / close by).",
          answer: "cerca",
          hint: "Starts with 'c' (pronounced THEHR-kah in Madrid)",
        },
        {
          id: "ex-8",
          type: "build_sentence",
          prompt: "Order the words to say 'Where are you all right now?':",
          answer: "¿Dónde estáis vosotros ahora?",
          options: ["vosotros", "estáis", "¿Dónde", "ahora?"],
          hint: "¿Dónde + estáis + vosotros + ahora?",
        },
      ],
    },
    "w1-d7": {
      explanation:
        "Welcome to the Week 1 Madrid Boss Review Test! Today we test all Week 1 skills together: Madrid pronunciation rules (z/ce/ci, ñ, ll, j), definite & indefinite articles (el, la, un, una, unos, unas), noun plurals (-s vs -es), subject pronouns (including Spain's vosotros), and the crucial contrast between 'ser' (identity/origin) and 'estar' (location/temporary state).",
      examples: [
        {
          es: "Nosotros somos de Madrid, pero hoy estamos en una terraza en la plaza Mayor.",
          en: "We are from Madrid (ser), but today we are on a terrace in Plaza Mayor (estar).",
        },
        {
          es: "¿Vosotros tenéis los billetes de metro?",
          en: "Do you all have the metro tickets? (Plural masculine 'los billetes')",
        },
        {
          es: "Buenas tardes, ¿dónde están los baños, por favor?",
          en: "Good afternoon, where are the restrooms, please? (Plural location 'están')",
        },
      ],
      new_words: [
        {
          word: "el baño",
          lemma: "baño",
          meaning: "bathroom / restroom",
          pos: "nm",
          gender: "el",
          example_es: "¿Dónde está el baño, por favor?",
          example_tr: "Where is the restroom, please?",
        },
        {
          word: "el centro",
          lemma: "centro",
          meaning: "city centre / downtown",
          pos: "nm",
          gender: "el",
          example_es: "Estamos en el centro de Madrid.",
          example_tr: "We are in the centre of Madrid.",
        },
        {
          word: "cerrado",
          lemma: "cerrado",
          meaning: "closed",
          pos: "adj",
          gender: null,
          example_es: "La tienda está cerrada.",
          example_tr: "The shop is closed.",
        },
        {
          word: "listo",
          lemma: "listo",
          meaning: "ready (with estar) / clever (with ser)",
          pos: "adj",
          gender: null,
          example_es: "¿Estáis listos para salir?",
          example_tr: "Are you all ready to go out?",
        },
      ],
      exercises: [
        {
          id: "ex-1",
          type: "fill_in",
          prompt: "Boss Check 1: Yo __ (ser/estar) de Ucrania, pero ahora __ (ser/estar) en Madrid. (Format: soy, estoy)",
          answer: "soy, estoy",
          hint: "Origin uses soy; current location uses estoy",
        },
        {
          id: "ex-2",
          type: "transform",
          prompt: "Boss Check 2 — Make plural: una estación → __",
          answer: "unas estaciones",
          hint: "Words ending in consonant -n add -es and drop the written accent",
        },
        {
          id: "ex-3",
          type: "fill_in",
          prompt: "Boss Check 3: ¿Vosotros __ listos para empezar? (sois / estáis — meaning 'ready')",
          answer: "estáis",
          hint: "'estar listo' means 'to be ready'",
        },
        {
          id: "ex-4",
          type: "fill_in",
          prompt: "Boss Check 4: __ problema es grande. (Write 'El' or 'La' — watch this classic -ma exception!)",
          answer: "El",
          hint: "'el problema' and 'el día' are masculine despite ending in -a",
        },
        {
          id: "ex-5",
          type: "translate",
          prompt: "Boss Check 5 — Translate to Spain Spanish: Good afternoon, where is the station?",
          answer: "Buenas tardes, ¿dónde está la estación?",
          hint: "Buenas tardes + ¿dónde está la estación?",
        },
        {
          id: "ex-6",
          type: "transform",
          prompt: "Boss Check 6 — Rewrite for vosotros: Tú eres socio → Vosotros __ socios",
          answer: "sois",
          hint: "Vosotros form of ser is 'sois'",
        },
        {
          id: "ex-7",
          type: "fill_in",
          prompt: "Boss Check 7: Los bares __ abiertos en el centro. (son / están)",
          answer: "están",
          hint: "Open/closed is a state -> están",
        },
        {
          id: "ex-8",
          type: "build_sentence",
          prompt: "Boss Check 8 — Order the words to say 'We are in the centre of Madrid':",
          answer: "Nosotros estamos en el centro de Madrid",
          options: ["centro", "estamos", "Madrid", "Nosotros", "el", "de", "en"],
          hint: "Nosotros estamos + en el centro de Madrid",
        },
      ],
    },
  };

  if (curatedLessons[key]) {
    const c = curatedLessons[key];
    return {
      id: key,
      week: spec.week,
      day: spec.day,
      city: spec.city,
      topic: spec.dayTitle,
      explanation: c.explanation,
      examples: c.examples,
      new_words: c.new_words,
      exercises: c.exercises,
      completed_at: null,
      score: null,
    };
  }

  // Topic-aware instant lesson for Weeks 2..12 if offline or before AI regeneration
  return {
    id: key,
    week: spec.week,
    day: spec.day,
    city: spec.city,
    topic: spec.dayTitle,
    explanation: `Welcome to Week ${spec.week}, Day ${spec.day} in ${spec.city} (${spec.cefr}): "${spec.dayTitle}". Week focus: ${spec.weekFocus}. In Spain Spanish (es-ES), pay special attention to the 'vosotros' forms and natural Peninsular expressions used in ${spec.city}. Tap "↻ Fresh AI Lesson" above at any time to generate a custom Gemini Flash exercise set tailored to your recent Error Notebook.`,
    examples: [
      {
        es: `En ${spec.city} practicamos hoy: ${spec.dayTitle.split("(")[0].trim()}.`,
        en: `In ${spec.city} today we practice: ${spec.dayTitle}.`,
      },
      {
        es: "¿Vosotros queréis practicar juntos en la cafetería?",
        en: "Do you all want to practice together in the café? (Spain 'vosotros')",
      },
      {
        es: "Hoy he aprendido una regla muy útil en español.",
        en: "Today I have learned a very useful rule in Spanish. (Spain present perfect 'he aprendido')",
      },
    ],
    new_words: [
      {
        word: "practicar",
        lemma: "practicar",
        meaning: "to practice",
        pos: "v",
        gender: null,
        example_es: "Vamos a practicar español hoy.",
        example_tr: "We are going to practice Spanish today.",
      },
      {
        word: "la regla",
        lemma: "regla",
        meaning: "rule",
        pos: "nf",
        gender: "la",
        example_es: "Esta regla es fácil.",
        example_tr: "This rule is easy.",
      },
      {
        word: "el ejemplo",
        lemma: "ejemplo",
        meaning: "example",
        pos: "nm",
        gender: "el",
        example_es: "Mira este ejemplo.",
        example_tr: "Look at this example.",
      },
      {
        word: "aprender",
        lemma: "aprender",
        meaning: "to learn",
        pos: "v",
        gender: null,
        example_es: "Quiero aprender rápido.",
        example_tr: "I want to learn fast.",
      },
    ],
    exercises: [
      {
        id: "ex-1",
        type: "fill_in",
        prompt: `Hoy nosotros __ (practicar) en ${spec.city}. (Present tense -AR: practicamos)`,
        answer: "practicamos",
        hint: "Nosotros ending for -AR verbs is -amos",
      },
      {
        id: "ex-2",
        type: "transform",
        prompt: "Rewrite for Spain plural 'vosotros': Tú hablas español → Vosotros __ español",
        answer: "habláis",
        hint: "-AR vosotros ending is -áis",
      },
      {
        id: "ex-3",
        type: "transform",
        prompt: "Rewrite for Spain plural 'vosotros': Tú comes aquí → Vosotros __ aquí",
        answer: "coméis",
        hint: "-ER vosotros ending is -éis",
      },
      {
        id: "ex-4",
        type: "fill_in",
        prompt: "Hoy yo __ (haber) hablado con mi socio. (Present perfect auxiliary for 'yo': he / ha)",
        answer: "he",
        hint: "Yo form of haber is 'he'",
      },
      {
        id: "ex-5",
        type: "translate",
        prompt: "Translate to Spain Spanish: This rule is easy",
        answer: "Esta regla es fácil",
        hint: "Esta regla + es + fácil",
      },
      {
        id: "ex-6",
        type: "fill_in",
        prompt: "¿Dónde __ (estar) la estación de tren?",
        answer: "está",
        hint: "3rd person singular of estar with accent",
      },
      {
        id: "ex-7",
        type: "translate",
        prompt: "Translate to Spain Spanish: I want to learn",
        answer: "Quiero aprender",
        hint: "Quiero + infinitive aprender",
      },
      {
        id: "ex-8",
        type: "build_sentence",
        prompt: "Order the words to say 'We are going to practice today':",
        answer: "Vamos a practicar hoy",
        options: ["practicar", "Vamos", "hoy", "a"],
        hint: "Ir a + infinitive: Vamos a practicar hoy",
      },
    ],
    completed_at: null,
    score: null,
  };
}
