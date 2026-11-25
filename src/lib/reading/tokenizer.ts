import {
  CardRecord,
  NoteRecord,
  ReadingTextRecord,
  WordKnowledgeStatus,
  WordStatusRecord,
} from "@/types/database";

export interface ReadingToken {
  text: string;
  isWord: boolean;
  normalized: string;
}

export interface ComprehensionStats {
  totalWords: number;
  knownCount: number;
  learningCount: number;
  newCount: number;
  ignoredCount: number;
  comprehensionPct: number;
}

const SPANISH_WORD_REGEX = /([a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+)/g;

export function normalizeSpanishWord(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[^a-záéíóúüñ]+|[^a-záéíóúüñ]+$/g, "");
}

/**
 * Splits a Spanish passage into readable sentences while keeping paragraph breaks clear.
 */
export function splitIntoSentences(content: string): string[] {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const sentences: string[] = [];
  for (const para of paragraphs) {
    const parts = para
      .split(/(?<=[.!?])\s+(?=[¡¿"«A-ZÁÉÍÓÚÜÑ])/)
      .map((s) => s.trim())
      .filter(Boolean);
    sentences.push(...parts);
  }
  return sentences;
}

/**
 * Tokenizes a sentence into alternating word and punctuation/space runs
 * so every word can be colour-coded and tapped individually.
 */
export function tokenizeSentence(sentence: string): ReadingToken[] {
  const tokens: ReadingToken[] = [];
  let lastIndex = 0;

  for (const match of sentence.matchAll(SPANISH_WORD_REGEX)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      tokens.push({
        text: sentence.slice(lastIndex, idx),
        isWord: false,
        normalized: "",
      });
    }
    const wordText = match[0];
    tokens.push({
      text: wordText,
      isWord: true,
      normalized: normalizeSpanishWord(wordText),
    });
    lastIndex = idx + wordText.length;
  }

  if (lastIndex < sentence.length) {
    tokens.push({
      text: sentence.slice(lastIndex),
      isWord: false,
      normalized: "",
    });
  }

  return tokens;
}

export function countWordsInText(content: string): number {
  const matches = content.match(SPANISH_WORD_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Splits a list of sentences into comfortable reading pages (~targetWordsPerPage words each)
 * without ever cutting a sentence in half.
 */
export function paginateSentences(
  sentences: string[],
  targetWordsPerPage = 160
): string[][] {
  if (sentences.length === 0) return [[]];

  const pages: string[][] = [];
  let currentPage: string[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const wc = countWordsInText(sentence);
    if (
      currentPage.length > 0 &&
      currentWordCount + wc > targetWordsPerPage &&
      currentWordCount >= Math.round(targetWordsPerPage * 0.55)
    ) {
      pages.push(currentPage);
      currentPage = [sentence];
      currentWordCount = wc;
    } else {
      currentPage.push(sentence);
      currentWordCount += wc;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

/**
 * Builds a unified Map<normalizedWord, WordKnowledgeStatus> combining:
 * 1. Learned FSRS cards (reps > 0 & scheduled_days >= 7 -> known; reps > 0 -> learning)
 * 2. Explicit learner overrides from `word_status` table (known / learning / ignored / new)
 */
export function buildVocabularyStatusMap(
  notes: NoteRecord[],
  cards: CardRecord[],
  explicitStatuses: WordStatusRecord[]
): Map<string, WordKnowledgeStatus> {
  const map = new Map<string, WordKnowledgeStatus>();

  const cardByNoteId = new Map<string, CardRecord[]>();
  for (const c of cards) {
    const list = cardByNoteId.get(c.note_id) ?? [];
    list.push(c);
    cardByNoteId.set(c.note_id, list);
  }

  for (const note of notes) {
    const noteCards = cardByNoteId.get(note.id) ?? [];
    const maxScheduled = noteCards.reduce(
      (max, c) => Math.max(max, c.scheduled_days ?? 0),
      0
    );
    const totalReps = noteCards.reduce((sum, c) => sum + (c.reps ?? 0), 0);

    if (totalReps === 0) continue;

    const derivedStatus: WordKnowledgeStatus =
      maxScheduled >= 7 ? "known" : "learning";

    const candidates = [
      normalizeSpanishWord(note.lemma),
      normalizeSpanishWord(
        note.word.replace(/^(el|la|los|las|un|una)\s+/i, "")
      ),
    ].filter(Boolean);

    for (const key of candidates) {
      const prev = map.get(key);
      if (!prev || (prev === "learning" && derivedStatus === "known")) {
        map.set(key, derivedStatus);
      }
    }
  }

  // Explicit learner overrides always win
  for (const ws of explicitStatuses) {
    const key = normalizeSpanishWord(ws.lemma);
    if (key) {
      map.set(key, ws.status);
    }
  }

  return map;
}

/**
 * Looks up a word's status, with light Spanish plural fallback (e.g. "mesas" -> "mesa").
 */
export function lookupWordStatus(
  normalizedWord: string,
  statusMap: Map<string, WordKnowledgeStatus>
): WordKnowledgeStatus {
  const direct = statusMap.get(normalizedWord);
  if (direct) return direct;

  if (normalizedWord.length > 3 && normalizedWord.endsWith("s")) {
    const withoutS = normalizedWord.slice(0, -1);
    const matchS = statusMap.get(withoutS);
    if (matchS) return matchS;
  }
  if (normalizedWord.length > 4 && normalizedWord.endsWith("es")) {
    const withoutEs = normalizedWord.slice(0, -2);
    const matchEs = statusMap.get(withoutEs);
    if (matchEs) return matchEs;
  }

  return "new";
}

/**
 * Estimates comprehension percentage for a Spanish text.
 * Known words count 100%, learning words count 60% (familiar in context), ignored words are excluded.
 */
export function computeComprehensionStats(
  content: string,
  statusMap: Map<string, WordKnowledgeStatus>
): ComprehensionStats {
  const matches = content.match(SPANISH_WORD_REGEX) ?? [];
  let knownCount = 0;
  let learningCount = 0;
  let newCount = 0;
  let ignoredCount = 0;

  for (const raw of matches) {
    const norm = normalizeSpanishWord(raw);
    if (!norm) continue;
    const status = lookupWordStatus(norm, statusMap);
    if (status === "known") knownCount++;
    else if (status === "learning") learningCount++;
    else if (status === "ignored") ignoredCount++;
    else newCount++;
  }

  const effectiveTotal = knownCount + learningCount + newCount;
  const comprehensionPct =
    effectiveTotal > 0
      ? Math.round(((knownCount + learningCount * 0.6) / effectiveTotal) * 100)
      : 100;

  return {
    totalWords: matches.length,
    knownCount,
    learningCount,
    newCount,
    ignoredCount,
    comprehensionPct,
  };
}

export const STARTER_MADRID_TEXTS: ReadingTextRecord[] = [
  {
    id: "starter-madrid-cafe",
    title: "Un desayuno en Malasaña (A1)",
    type: "starter",
    topic: "Madrid Café",
    content: `Son las ocho y media de la mañana en Madrid. Hace sol y la calle está muy tranquila. Entro en el bar de la esquina para desayunar antes de trabajar.

—¡Buenos días! ¿Qué te pongo hoy? —pregunta el camarero con una sonrisa.
—Hola, ponme un café con leche y una tostada con tomate y aceite de oliva, por favor.
—¿El café en vaso o en taza?
—En taza, por favor. Y también un zumo de naranja natural.

Me siento cerca de la ventana y miro a la gente que camina rápido hacia el metro. El pan está caliente y el café sabe genial. Cuando termino, pido la cuenta: son cuatro euros con cincuenta. Dejo unas monedas en el plato y digo: «¡Muchas gracias, hasta mañana!».`,
    progress: 0,
    comprehension_pct: 0,
    word_count: 124,
    created_at: "2026-10-19T09:00:00.000Z",
    updated_at: "2026-10-19T09:00:00.000Z",
  },
  {
    id: "starter-madrid-retiro",
    title: "Domingo en el Parque del Retiro (A1–A2)",
    type: "starter",
    topic: "Madrid Weekend",
    content: `Los domingos por la tarde, muchos madrileños van al Parque del Retiro. A mí me encanta pasear bajo los árboles y escuchar música cerca del estanque grande.

Hoy he quedado con dos amigos españoles en la estación de metro Retiro. Hemos comprado agua fría y hemos caminado hasta el Palacio de Cristal. Dentro del palacio entra mucha luz y la gente hace fotos sin parar.

Después de una hora, tenemos hambre y decidimos buscar una terraza en el barrio de Ibiza. Pedimos unas patatas bravas, jamón ibérico y dos cañas bien frías. Hablamos en español sobre nuestros planes para la semana y nos reímos mucho. Vivir en Madrid tiene un ritmo muy especial.`,
    progress: 0,
    comprehension_pct: 0,
    word_count: 118,
    created_at: "2026-10-19T09:05:00.000Z",
    updated_at: "2026-10-19T09:05:00.000Z",
  },
  {
    id: "starter-madrid-piso",
    title: "Visitando un piso en Chamberí (A2)",
    type: "starter",
    topic: "Renting a Flat in Madrid",
    content: `Llevo dos semanas buscando un piso de alquiler en Madrid. Hoy tengo una cita con el propietario de un apartamento luminoso en el barrio de Chamberí.

El piso está en una tercera planta con ascensor y tiene un balcón pequeño que da a una calle silenciosa. El salón es amplio, la cocina está equipada con nevera y lavadora, y el baño es moderno.

—¿Los gastos de comunidad están incluidos en el alquiler? —pregunto.
—Sí, la comunidad entra en el precio, pero la luz, el agua y el internet van aparte —responde el casero—. También pedimos un mes de fianza.

Me gusta mucho la zona porque tiene supermercados, gimnasios y una parada de metro a tres minutos andando. Le digo que quiero reservar el piso hoy mismo.`,
    progress: 0,
    comprehension_pct: 0,
    word_count: 132,
    created_at: "2026-10-19T09:10:00.000Z",
    updated_at: "2026-10-19T09:10:00.000Z",
  },
];
