/**
 * Deterministic Spain Spanish (es-ES, Madrid accent) to English phonetic respelling engine.
 * Converts any Spanish word or sentence into an easy-to-read English pronunciation guide
 * with stressed syllables in UPPERCASE and Madrid distinción (z / ce / ci -> "th").
 *
 * Examples:
 * - "gracias"        -> "GRAH-thyahs"
 * - "el coche"       -> "ehl KOH-cheh"
 * - "el ordenador"   -> "ehl ohr-deh-nah-DOHR"
 * - "hola"           -> "OH-lah"
 * - "español"        -> "ehs-pah-NYOHL"
 * - "zapato"         -> "thah-PAH-toh"
 */

const UNSTRESSED_MONOSYLLABLES = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "de",
  "del",
  "al",
  "a",
  "en",
  "con",
  "por",
  "sin",
  "mi",
  "tu",
  "su",
  "mis",
  "tus",
  "sus",
  "me",
  "te",
  "se",
  "lo",
  "le",
  "nos",
  "os",
  "les",
  "que",
  "y",
  "o",
  "ni",
  "si",
]);

const STRONG_VOWELS = new Set(["a", "e", "o", "á", "é", "ó", "í", "ú"]);
const ALL_VOWELS = new Set([
  "a",
  "e",
  "i",
  "o",
  "u",
  "á",
  "é",
  "í",
  "ó",
  "ú",
  "ü",
]);

const ACCENTED_VOWELS = new Set(["á", "é", "í", "ó", "ú"]);

const INSEPARABLE_CLUSTERS = new Set([
  "bl",
  "br",
  "cl",
  "cr",
  "dr",
  "fl",
  "fr",
  "gl",
  "gr",
  "pl",
  "pr",
  "tr",
]);

interface TokenUnit {
  raw: string;
  isVowel: boolean;
  isStrongVowel: boolean;
  hasAccent: boolean;
}

/**
 * Breaks a lowercase Spanish word into atomic orthographic units (preserving digraphs like ch, ll, rr, qu, gu)
 * so we can syllabify accurately according to Royal Spanish Academy (RAE) rules.
 */
function tokenizeWordUnits(word: string): TokenUnit[] {
  const units: TokenUnit[] = [];
  let i = 0;

  while (i < word.length) {
    const ch = word[i];
    const next = word[i + 1] ?? "";
    const afterNext = word[i + 2] ?? "";

    // Digraphs: ch, ll, rr
    if (
      (ch === "c" && next === "h") ||
      (ch === "l" && next === "l") ||
      (ch === "r" && next === "r")
    ) {
      units.push({
        raw: ch + next,
        isVowel: false,
        isStrongVowel: false,
        hasAccent: false,
      });
      i += 2;
      continue;
    }

    // qu + (e|i|é|í) -> single consonant unit 'qu'
    if (
      ch === "q" &&
      next === "u" &&
      (afterNext === "e" ||
        afterNext === "i" ||
        afterNext === "é" ||
        afterNext === "í")
    ) {
      units.push({
        raw: "qu",
        isVowel: false,
        isStrongVowel: false,
        hasAccent: false,
      });
      i += 2;
      continue;
    }

    // gu + (e|i|é|í) -> single consonant unit 'gu' (silent u)
    if (
      ch === "g" &&
      next === "u" &&
      (afterNext === "e" ||
        afterNext === "i" ||
        afterNext === "é" ||
        afterNext === "í")
    ) {
      units.push({
        raw: "gu",
        isVowel: false,
        isStrongVowel: false,
        hasAccent: false,
      });
      i += 2;
      continue;
    }

    // Final 'y' acts as vowel 'i' (e.g. muy, soy, estoy, hay, rey)
    if (ch === "y" && i === word.length - 1 && i > 0) {
      units.push({
        raw: "i",
        isVowel: true,
        isStrongVowel: false,
        hasAccent: false,
      });
      i++;
      continue;
    }

    const isVowel = ALL_VOWELS.has(ch);
    units.push({
      raw: ch,
      isVowel,
      isStrongVowel: STRONG_VOWELS.has(ch),
      hasAccent: ACCENTED_VOWELS.has(ch),
    });
    i++;
  }

  return units;
}

/**
 * Splits a Spanish word into orthographic syllables.
 */
function splitIntoSyllables(word: string): string[] {
  const units = tokenizeWordUnits(word);
  if (units.length === 0) return [];

  // Group contiguous vowels that form a diphthong/triphthong into single vocalic nuclei,
  // while splitting hiatuses (two strong vowels like a-e, e-o, or accented weak vowel like í-a).
  interface SyllabicSegment {
    units: TokenUnit[];
    isVowelNucleus: boolean;
  }

  const segments: SyllabicSegment[] = [];
  let idx = 0;

  while (idx < units.length) {
    const u = units[idx];
    if (!u.isVowel) {
      // Intervocalic silent 'h' between two vowels that form a hiatus stays with the second vowel
      segments.push({ units: [u], isVowelNucleus: false });
      idx++;
      continue;
    }

    // Build vowel nucleus (diphthong/triphthong vs hiatus)
    const nucleus: TokenUnit[] = [u];
    idx++;
    while (idx < units.length && units[idx].isVowel) {
      const prevV = nucleus[nucleus.length - 1];
      const currV = units[idx];
      // Two strong vowels (including accented weak vowels í, ú) form a hiatus -> separate syllables!
      if (prevV.isStrongVowel && currV.isStrongVowel) {
        break;
      }
      nucleus.push(currV);
      idx++;
    }
    segments.push({ units: nucleus, isVowelNucleus: true });
  }

  // Find indices of vowel nuclei
  const nucleusIndices: number[] = [];
  segments.forEach((seg, sIdx) => {
    if (seg.isVowelNucleus) nucleusIndices.push(sIdx);
  });

  if (nucleusIndices.length <= 1) {
    return [units.map((u) => u.raw).join("")];
  }

  const syllables: TokenUnit[][] = nucleusIndices.map(() => []);

  // Attach leading consonants before first vowel nucleus to syllable 0
  for (let s = 0; s <= nucleusIndices[0]; s++) {
    syllables[0].push(...segments[s].units);
  }

  // For each pair of consecutive vowel nuclei, distribute the consonants between them
  for (let n = 0; n < nucleusIndices.length - 1; n++) {
    const leftNuc = nucleusIndices[n];
    const rightNuc = nucleusIndices[n + 1];
    const betweenConsonants: TokenUnit[] = [];
    for (let s = leftNuc + 1; s < rightNuc; s++) {
      betweenConsonants.push(...segments[s].units);
    }

    if (betweenConsonants.length === 0) {
      // Hiatus
    } else if (betweenConsonants.length === 1) {
      // Single consonant goes to next syllable (V-CV)
      syllables[n + 1].push(betweenConsonants[0]);
    } else if (betweenConsonants.length === 2) {
      const pair = betweenConsonants[0].raw + betweenConsonants[1].raw;
      if (INSEPARABLE_CLUSTERS.has(pair)) {
        syllables[n + 1].push(betweenConsonants[0], betweenConsonants[1]);
      } else {
        syllables[n].push(betweenConsonants[0]);
        syllables[n + 1].push(betweenConsonants[1]);
      }
    } else {
      // 3+ consonants: check if last 2 form an inseparable cluster (e.g. n-tr, m-pr)
      const lastTwo =
        betweenConsonants[betweenConsonants.length - 2].raw +
        betweenConsonants[betweenConsonants.length - 1].raw;
      if (INSEPARABLE_CLUSTERS.has(lastTwo)) {
        for (let c = 0; c < betweenConsonants.length - 2; c++) {
          syllables[n].push(betweenConsonants[c]);
        }
        syllables[n + 1].push(
          betweenConsonants[betweenConsonants.length - 2],
          betweenConsonants[betweenConsonants.length - 1]
        );
      } else {
        for (let c = 0; c < betweenConsonants.length - 1; c++) {
          syllables[n].push(betweenConsonants[c]);
        }
        syllables[n + 1].push(betweenConsonants[betweenConsonants.length - 1]);
      }
    }

    // Add the right vowel nucleus to syllable n + 1
    syllables[n + 1].push(...segments[rightNuc].units);
  }

  // Attach trailing consonants after the last vowel nucleus to the final syllable
  const lastNuc = nucleusIndices[nucleusIndices.length - 1];
  for (let s = lastNuc + 1; s < segments.length; s++) {
    syllables[syllables.length - 1].push(...segments[s].units);
  }

  return syllables.map((syl) => syl.map((u) => u.raw).join(""));
}

/**
 * Determines which syllable index (0-based) carries the primary stress in Spanish.
 */
function getStressedSyllableIndex(syllables: string[], rawWord: string): number {
  if (syllables.length <= 1) return 0;

  // 1. Explicit written accent mark wins
  for (let i = 0; i < syllables.length; i++) {
    if (/[áéíóú]/.test(syllables[i])) {
      return i;
    }
  }

  // 2. Words ending in vowel, 'n', or 's' are stressed on the penultimate syllable
  const lastChar = rawWord.slice(-1);
  if (/[aeiouns]/.test(lastChar)) {
    return syllables.length - 2;
  }

  // 3. Words ending in any other consonant (r, l, d, z, j, etc.) are stressed on the last syllable
  return syllables.length - 1;
}

/**
 * Converts a single Spanish syllable into Madrid (es-ES) English phonetic respelling.
 */
function respellSyllableEsEs(
  syl: string,
  sylIndex: number,
  totalSyllables: number,
  nextSyllable: string
): string {
  // Normalize acute accents on vowels now that stress index is already known
  const s = syl
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u");

  let out = "";
  let i = 0;

  while (i < s.length) {
    const ch = s[i];
    const next = s[i + 1] ?? "";
    const afterNext = s[i + 2] ?? "";
    const peekNextSylChar =
      i === s.length - 1 ? (nextSyllable[0] ?? "") : next;

    // 1. Multi-character consonant digraphs
    if (ch === "c" && next === "h") {
      out += "ch";
      i += 2;
      continue;
    }
    if (ch === "l" && next === "l") {
      out += "y";
      i += 2;
      continue;
    }
    if (ch === "r" && next === "r") {
      out += "rr";
      i += 2;
      continue;
    }
    if (ch === "q" && next === "u" && (afterNext === "e" || afterNext === "i")) {
      out += "k";
      i += 2;
      continue;
    }
    if (ch === "g" && next === "u" && (afterNext === "e" || afterNext === "i")) {
      out += "g";
      i += 2;
      continue;
    }
    if (ch === "g" && next === "ü") {
      out += "gw";
      i += 2;
      continue;
    }

    // 2. Diphthongs (2 vowels together inside the same syllable)
    if (ALL_VOWELS.has(ch) && ALL_VOWELS.has(next)) {
      const pair = ch + next;
      const diphthongMap: Record<string, string> = {
        ia: "yah",
        ie: "yeh",
        io: "yoh",
        iu: "yoo",
        ua: "wah",
        ue: "weh",
        ui: "wee",
        uo: "woh",
        ai: "eye",
        ei: "ey",
        oi: "oy",
        au: "ow",
        eu: "ehw",
      };
      if (diphthongMap[pair]) {
        out += diphthongMap[pair];
        i += 2;
        continue;
      }
    }

    // 3. Single vowels
    if (ch === "a") {
      out += "ah";
      i++;
      continue;
    }
    if (ch === "e") {
      out += "eh";
      i++;
      continue;
    }
    if (ch === "i") {
      out += "ee";
      i++;
      continue;
    }
    if (ch === "o") {
      out += "oh";
      i++;
      continue;
    }
    if (ch === "u" || ch === "ü") {
      out += "oo";
      i++;
      continue;
    }

    // 4. Madrid Spain (es-ES) Consonants
    if (ch === "z") {
      out += "th";
      i++;
      continue;
    }
    if (ch === "c") {
      if (
        peekNextSylChar === "e" ||
        peekNextSylChar === "i" ||
        peekNextSylChar === "é" ||
        peekNextSylChar === "í"
      ) {
        // Madrid distinción (θ): ce/ci -> th
        out += "th";
      } else {
        out += "k";
      }
      i++;
      continue;
    }
    if (ch === "j") {
      out += "kh";
      i++;
      continue;
    }
    if (ch === "g") {
      if (
        peekNextSylChar === "e" ||
        peekNextSylChar === "i" ||
        peekNextSylChar === "é" ||
        peekNextSylChar === "í"
      ) {
        out += "kh";
      } else {
        out += "g";
      }
      i++;
      continue;
    }
    if (ch === "h") {
      // Silent in Spanish
      i++;
      continue;
    }
    if (ch === "ñ") {
      out += "ny";
      i++;
      continue;
    }
    if (ch === "v") {
      // Spanish 'v' and 'b' share the same bilabial sound
      out += "b";
      i++;
      continue;
    }
    if (ch === "r" && sylIndex === 0 && i === 0) {
      // Word-initial 'r' is rolled in Spanish
      out += "rr";
      i++;
      continue;
    }
    if (ch === "x") {
      out += "ks";
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Converts a single Spanish word into its Madrid (es-ES) English phonetic respelling.
 */
export function wordToMadridPhonetics(rawWord: string): string {
  const clean = rawWord
    .trim()
    .toLowerCase()
    .replace(/[^a-záéíóúüñ]/gi, "");

  if (!clean) return "";

  // Single-letter Spanish words
  if (clean === "y") return "ee";
  if (clean === "o") return "oh";
  if (clean === "a") return "ah";
  if (clean === "e") return "eh";
  if (clean === "u") return "oo";

  const syllables = splitIntoSyllables(clean);
  if (syllables.length === 0) return "";

  const stressedIdx = getStressedSyllableIndex(syllables, clean);
  const hasWrittenAccent = /[áéíóú]/.test(clean);
  const isUnstressedMono =
    syllables.length === 1 &&
    !hasWrittenAccent &&
    UNSTRESSED_MONOSYLLABLES.has(clean);

  const rendered = syllables.map((syl, idx) => {
    const nextSyl = syllables[idx + 1] ?? "";
    const respelled = respellSyllableEsEs(
      syl,
      idx,
      syllables.length,
      nextSyl
    );
    if (isUnstressedMono) {
      return respelled.toLowerCase();
    }
    return idx === stressedIdx
      ? respelled.toUpperCase()
      : respelled.toLowerCase();
  });

  return rendered.join("-");
}

/**
 * Converts a Spanish word, phrase, or full sentence into a readable English pronunciation guide
 * for Madrid Spain Spanish (es-ES).
 *
 * Example:
 * toMadridEnglishPhonetics("Hola, gracias por el café.")
 * -> "OH-lah, GRAH-thyahs pohr ehl kah-FEH"
 */
export function toMadridEnglishPhonetics(text: string): string {
  if (!text || !text.trim()) return "";

  // Strip parenthetical hints or cloze blanks, and separate compact comma/slash variants (e.g. "el,la")
  const stripped = text
    .replace(/\([^)]*\)/g, "")
    .replace(/_{2,}/g, "...")
    .replace(/([,/])(?=\S)/g, "$1 ")
    .trim();

  // Split by whitespace while preserving basic comma/question pauses
  const tokens = stripped.split(/\s+/);
  const converted: string[] = [];

  for (const token of tokens) {
    if (token === "...") {
      converted.push("...");
      continue;
    }
    const trailingPunct = /[.,;!?]+$/.exec(token)?.[0] ?? "";
    const core = token.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ-]/g, "");
    if (!core) continue;

    if (core.includes("-")) {
      const subParts = core
        .split("-")
        .map((p) => wordToMadridPhonetics(p))
        .filter(Boolean);
      if (subParts.length > 0) {
        converted.push(subParts.join("-") + (trailingPunct === "," ? "," : ""));
      }
    } else {
      const phon = wordToMadridPhonetics(core);
      if (phon) {
        converted.push(phon + (trailingPunct === "," ? "," : ""));
      }
    }
  }

  return converted.join(" ");
}
