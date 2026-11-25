import { FieldMappingConfig, Gender, MappedFieldRole } from "@/types/database";

export const FIELD_ROLE_LABELS: Record<MappedFieldRole, string> = {
  word: "Word (Spanish)",
  meaning: "Meaning (English)",
  example_es: "Example Sentence (ES)",
  cloze_es: "Cloze Sentence (ES)",
  example_tr: "Example Translation (EN)",
  audio_word: "Audio (Word)",
  audio_example: "Audio (Example Sentence)",
  pos: "Part of Speech / Gender Tag",
  gender: "Gender (el/la)",
  ranking: "Frequency Rank",
  image: "Image",
  ignore: "Ignore",
};

/**
 * Pre-filled field mappings for both supported decks:
 * 1) "Basic Spanish (EIS)" -> New_Spanish_Top_5000_Vocabulary.apkg (Spain es-ES audio)
 * 2) "Spanish Vocabulary Practice" -> 10000_Spanish_Vocabulary_Part_1_of_3.apkg
 */
export const DEFAULT_MODEL_MAPPINGS: Record<string, FieldMappingConfig> = {
  "Basic Spanish (EIS)": {
    Ranking: "ranking",
    Spanish: "word",
    "Word Type": "pos",
    English: "meaning",
    "Spanish Examples": "example_es",
    "English Examples": "example_tr",
    Picture: "image",
    Audio: "audio_word",
  },
  "Basic-f4e28": {
    Spanish: "word",
    Picture: "image",
    English: "meaning",
    Audio: "audio_word",
    Ranking: "ranking",
  },
  "Spanish Vocabulary Practice": {
    Spanish: "word",
    English: "meaning",
    "Spanish Sentence": "example_es",
    "Cloze Sentence": "cloze_es",
    "English Sentence": "example_tr",
    Image: "image",
    "Vocab Audio": "audio_word",
    "Sentence Audio": "audio_example",
  },
};

/**
 * Infers a field mapping for any Anki note type based on known model names or heuristics.
 */
export function getPreFilledFieldMapping(
  modelName: string,
  fieldNames: string[]
): FieldMappingConfig {
  const preset = DEFAULT_MODEL_MAPPINGS[modelName];
  if (preset) {
    const result: FieldMappingConfig = {};
    for (const f of fieldNames) {
      result[f] = preset[f] ?? "ignore";
    }
    return result;
  }

  const mapping: FieldMappingConfig = {};
  for (const name of fieldNames) {
    const lower = name.toLowerCase().trim();
    if (lower === "spanish" || lower === "word" || lower === "front") {
      mapping[name] = "word";
    } else if (lower === "english" || lower === "meaning" || lower === "back") {
      mapping[name] = "meaning";
    } else if (lower.includes("spanish sentence") || lower.includes("spanish example")) {
      mapping[name] = "example_es";
    } else if (lower.includes("cloze")) {
      mapping[name] = "cloze_es";
    } else if (lower.includes("english sentence") || lower.includes("english example")) {
      mapping[name] = "example_tr";
    } else if (lower === "vocab audio" || lower === "audio" || lower === "word audio") {
      mapping[name] = "audio_word";
    } else if (lower.includes("sentence audio") || lower.includes("example audio")) {
      mapping[name] = "audio_example";
    } else if (lower.includes("word type") || lower === "pos" || lower.includes("part of speech")) {
      mapping[name] = "pos";
    } else if (lower.includes("rank")) {
      mapping[name] = "ranking";
    } else if (lower.includes("image") || lower.includes("picture")) {
      mapping[name] = "image";
    } else if (lower.includes("gender")) {
      mapping[name] = "gender";
    } else {
      mapping[name] = "ignore";
    }
  }
  return mapping;
}

/**
 * Parses a raw Spanish word field (e.g. "el color", "la amenaza", "zapato")
 * and optional POS/gender field (e.g. "nm", "nf", "nf (el)", "nm/f", "v")
 * into { word, lemma, gender, pos }.
 */
export function parseWordGenderAndLemma(
  rawWord: string,
  rawPos?: string | null,
  rawGender?: string | null
): {
  word: string;
  lemma: string;
  gender: Gender;
  pos: string | null;
} {
  let cleanedWord = stripHtml(rawWord).replace(/\s+/g, " ").trim();
  let posClean = rawPos ? stripHtml(rawPos).trim() : null;
  const explicitGender = rawGender ? stripHtml(rawGender).trim().toLowerCase() : null;

  // Handle inline POS in parentheses from Spanish_Top_5000_Vocabulary.apkg, e.g. "hola (interj)", "gracia (nf)", "de (prep) de"
  const inlinePosMatch = /^(.+?)\s*\((nm\/f|nmf|nf\s*\(el\)|nm|nf|nc|v|adj|adv|prep|conj|pron|num|interj|art|n)\)(?:\s+.*)?$/i.exec(
    cleanedWord
  );
  if (inlinePosMatch) {
    cleanedWord = inlinePosMatch[1].trim();
    if (!posClean) {
      posClean = inlinePosMatch[2].trim().toLowerCase();
    }
  }

  let gender: Gender = null;
  let lemma = cleanedWord;

  // 1. Check leading article on the word itself (e.g. "el collar", "la amenaza", "los zapatos", "las manos")
  const articleMatch = /^(el\/la|la\/el|el|la|los|las)\s+(.+)$/i.exec(cleanedWord);
  if (articleMatch) {
    const art = articleMatch[1].toLowerCase();
    lemma = articleMatch[2].trim();
    if (art === "el/la" || art === "la/el") {
      gender = "el/la";
    } else if (art === "el" || art === "la" || art === "los" || art === "las") {
      gender = art;
    }
  }

  // 2. If no leading article, check POS tag from Top 5000 deck ("nm", "nf", "nf (el)", "nm/f", "nmf")
  if (!gender && posClean) {
    const p = posClean.toLowerCase();
    if (p === "nm") {
      gender = "el";
    } else if (p === "nf" || p === "nf (el)") {
      gender = "la";
    } else if (p === "nm/f" || p === "nmf" || p === "nc") {
      gender = "el/la";
    }
  }

  // 3. Explicit gender field override if provided
  if (!gender && explicitGender) {
    if (
      explicitGender === "el" ||
      explicitGender === "la" ||
      explicitGender === "los" ||
      explicitGender === "las" ||
      explicitGender === "el/la"
    ) {
      gender = explicitGender;
    } else if (explicitGender === "m" || explicitGender === "masculine") {
      gender = "el";
    } else if (explicitGender === "f" || explicitGender === "feminine") {
      gender = "la";
    }
  }

  // Format display word with article if it's a single-gender noun that didn't include the article
  let displayWord = cleanedWord;
  if (!articleMatch && (gender === "el" || gender === "la")) {
    // Handle feminine nouns taking "el" in singular like "nf (el)" -> "el agua (f)"
    if (posClean?.toLowerCase() === "nf (el)") {
      displayWord = `el ${lemma}`;
    } else {
      displayWord = `${gender} ${lemma}`;
    }
  }

  const inferredPos =
    posClean ||
    (gender ? "n" : null);

  return {
    word: displayWord,
    lemma,
    gender,
    pos: inferredPos,
  };
}

/**
 * Strips HTML tags while preserving line breaks as spaces or newlines.
 */
export function stripHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>\s*<div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

/**
 * Extracts the first sentence when a field contains multiple <br>-separated examples
 * (as in New_Spanish_Top_5000_Vocabulary.apkg).
 */
export function extractPrimarySentence(rawField: string): string {
  const cleaned = stripHtml(rawField);
  if (!cleaned) return "";
  const lines = cleaned
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[0] ?? "";
}

/**
 * Splits comma/slash-separated Spanish deck entries (e.g. "el,la" or "bueno/a")
 * into individual clean target variants for cloze blanking & answer matching.
 */
export function expandTargetVariants(word: string, lemma: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  };

  for (const raw of [word, lemma]) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    push(trimmed);
    for (const part of trimmed.split(/[,/;]+/)) {
      const p = part.trim();
      if (p) {
        push(p);
        // Also allow matching the noun without its leading article (e.g. "la casa" -> "casa")
        const withoutArticle = p.replace(/^(el|la|los|las|un|una)\s+/i, "").trim();
        if (withoutArticle && withoutArticle !== p) {
          push(withoutArticle);
        }
      }
    }
  }

  return out;
}

/**
 * Checks whether a learner's typed Spanish answer matches any valid variant
 * of the card's word or lemma (e.g. "el" or "la" for "el,la").
 */
export function matchesSpanishTargetAnswer(
  typed: string,
  word: string,
  lemma: string
): boolean {
  const norm = typed.trim().toLowerCase();
  if (!norm) return false;
  return expandTargetVariants(word, lemma).some(
    (variant) => variant.toLowerCase() === norm
  );
}

/**
 * Builds a cloze sentence if the deck doesn't have an explicit Cloze Sentence field
 * by masking the lemma or word (or any comma/slash variant) inside the Spanish example sentence.
 */
export function buildClozeSentence(
  explicitCloze: string,
  exampleEs: string,
  lemma: string,
  word: string
): string {
  const cleanExplicit = stripHtml(explicitCloze).trim();
  if (cleanExplicit && /_{2,}/.test(cleanExplicit)) return cleanExplicit;
  if (!exampleEs) return cleanExplicit;

  const targetCandidates = expandTargetVariants(word, lemma).filter(
    (s) => s.length >= 1
  );

  for (const target of targetCandidates) {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `(?<![a-záéíóúñü])${escaped}(?![a-záéíóúñü])`,
      "i"
    );
    if (regex.test(exampleEs)) {
      return exampleEs.replace(regex, "____");
    }
  }

  // Fallback: stem match (first 4+ characters for conjugated verbs/plurals)
  for (const candidate of targetCandidates) {
    if (candidate.length >= 4) {
      const stem = candidate
        .slice(0, Math.max(4, candidate.length - 2))
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stemRegex = new RegExp(
        `(?<![a-záéíóúñü])${stem}[a-záéíóúñü]*(?![a-záéíóúñü])`,
        "i"
      );
      if (stemRegex.test(exampleEs)) {
        return exampleEs.replace(stemRegex, "____");
      }
    }
  }

  return exampleEs;
}

/**
 * Extracts `[sound:filename.mp3]` references from an Anki field.
 */
export function extractSoundRefs(rawField: string): string[] {
  if (!rawField) return [];
  const matches: string[] = [];
  const regex = /\[sound:([^\]]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(rawField)) !== null) {
    matches.push(m[1].trim());
  }
  return matches;
}

/**
 * Extracts `<img src="filename.jpg">` references from an Anki field.
 */
export function extractImageRefs(rawField: string): string[] {
  if (!rawField) return [];
  const matches: string[] = [];
  const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(rawField)) !== null) {
    matches.push(m[1].trim());
  }
  return matches;
}
