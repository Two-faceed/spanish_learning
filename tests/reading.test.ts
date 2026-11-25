import { describe, expect, it } from "vitest";
import {
  buildVocabularyStatusMap,
  computeComprehensionStats,
  lookupWordStatus,
  paginateSentences,
  splitIntoSentences,
  tokenizeSentence,
} from "@/lib/reading/tokenizer";
import {
  extractArticleFromHtml,
  parseGeneratedGradedReaderJson,
  parseSentenceTranslationsJson,
} from "@/lib/reading/importers";
import { CardRecord, NoteRecord, WordStatusRecord } from "@/types/database";

describe("Phase 4 Reading — Tokenizer & Comprehension Stats", () => {
  it("splits Spanish passages into clean sentences preserving punctuation", () => {
    const text =
      "¡Buenos días! Hace sol en Madrid.\n\n¿Qué te pongo hoy? Ponme un café.";
    const sentences = splitIntoSentences(text);
    expect(sentences).toEqual([
      "¡Buenos días!",
      "Hace sol en Madrid.",
      "¿Qué te pongo hoy?",
      "Ponme un café.",
    ]);
  });

  it("tokenizes Spanish words with accents and ñ while keeping punctuation intact", () => {
    const tokens = tokenizeSentence("¡Mañana tomo café!");
    const words = tokens.filter((t) => t.isWord).map((t) => t.normalized);
    expect(words).toEqual(["mañana", "tomo", "café"]);
    expect(tokens.map((t) => t.text).join("")).toBe("¡Mañana tomo café!");
  });

  it("derives known/learning/ignored statuses from FSRS cards + explicit overrides and computes comprehension %", () => {
    const notes: NoteRecord[] = [
      {
        id: "n1",
        anki_guid: "g1",
        word: "el café",
        lemma: "café",
        meaning: "coffee",
        example_es: "",
        cloze_es: "",
        example_tr: "",
        pos: "nm",
        gender: "el",
        image_url: null,
        audio_word_url: null,
        audio_example_url: null,
        deck_audio_word_url: null,
        deck_audio_example_url: null,
        audio_source: "es-ES TTS",
        part: 1,
        freq_rank: 10,
        source: "deck",
        created_at: new Date().toISOString(),
      },
      {
        id: "n2",
        anki_guid: "g2",
        word: "la mesa",
        lemma: "mesa",
        meaning: "table",
        example_es: "",
        cloze_es: "",
        example_tr: "",
        pos: "nf",
        gender: "la",
        image_url: null,
        audio_word_url: null,
        audio_example_url: null,
        deck_audio_word_url: null,
        deck_audio_example_url: null,
        audio_source: "es-ES TTS",
        part: 1,
        freq_rank: 20,
        source: "deck",
        created_at: new Date().toISOString(),
      },
    ];

    const cards: CardRecord[] = [
      {
        id: "c1",
        note_id: "n1",
        type: "recognition",
        due: new Date().toISOString(),
        stability: 12,
        difficulty: 5,
        elapsed_days: 8,
        scheduled_days: 10, // >= 7d -> known
        reps: 3,
        lapses: 0,
        state: 2,
        last_review: new Date().toISOString(),
        suspended: false,
      },
      {
        id: "c2",
        note_id: "n2",
        type: "recognition",
        due: new Date().toISOString(),
        stability: 1,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 2, // < 7d -> learning
        reps: 1,
        lapses: 0,
        state: 1,
        last_review: new Date().toISOString(),
        suspended: false,
      },
    ];

    const explicit: WordStatusRecord[] = [
      {
        lemma: "madrid",
        status: "ignored",
        first_seen_text_id: null,
        updated_at: new Date().toISOString(),
      },
    ];

    const map = buildVocabularyStatusMap(notes, cards, explicit);
    expect(lookupWordStatus("café", map)).toBe("known");
    expect(lookupWordStatus("mesas", map)).toBe("learning"); // plural fallback
    expect(lookupWordStatus("madrid", map)).toBe("ignored");
    expect(lookupWordStatus("tostada", map)).toBe("new");

    const stats = computeComprehensionStats(
      "Café, mesas, tostada, Madrid.",
      map
    );
    expect(stats.knownCount).toBe(1);
    expect(stats.learningCount).toBe(1);
    expect(stats.newCount).toBe(1);
    expect(stats.ignoredCount).toBe(1);
    // (1 + 0.6) / 3 = 53.3% -> 53%
    expect(stats.comprehensionPct).toBe(53);
  });

  it("extracts clean article title and paragraphs from HTML pages", () => {
    const html = `<html><head><title>Noticias de Madrid</title><script>var x=1;</script></head>
      <body><nav>Menu</nav><article><p>Hoy hace muy buen tiempo en el centro de Madrid y mucha gente pasea por el Retiro.</p><p>Los cafés abren temprano para servir tostadas con tomate.</p></article><footer>Copyright</footer></body></html>`;
    const extracted = extractArticleFromHtml(html);
    expect(extracted.title).toBe("Noticias de Madrid");
    expect(extracted.content).toContain("centro de Madrid");
    expect(extracted.content).not.toContain("Menu");
    expect(extracted.content).not.toContain("var x=1");
  });

  it("parses AI Graded Reader JSON safely with target words", () => {
    const raw = `\`\`\`json
    {
      "title": "Una mañana en Lavapiés (A1-A2)",
      "content": "Hoy tomo un café con leche en Madrid.\\n\\nDespués camino hasta la plaza.",
      "targetWords": ["la plaza", "caminar", "el café"]
    }
    \`\`\``;
    const parsed = parseGeneratedGradedReaderJson(raw, "Lavapiés");
    expect(parsed.title).toBe("Una mañana en Lavapiés (A1-A2)");
    expect(parsed.content).toContain("café con leche");
    expect(parsed.targetWords).toEqual(["la plaza", "caminar", "el café"]);
  });

  it("paginates long books into balanced sentence-aligned pages", () => {
    const sentences = Array.from(
      { length: 40 },
      (_, i) => `Esta es la frase número ${i + 1} del libro español en Madrid.`
    );
    const pages = paginateSentences(sentences, 120);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.flat()).toEqual(sentences);
  });

  it("parses batched sentence translations JSON safely", () => {
    const raw = `\`\`\`json
    {
      "translations": [
        "I have been looking for a rental flat in Madrid for two weeks.",
        "The flat is on a third floor with a lift."
      ]
    }
    \`\`\``;
    const parsed = parseSentenceTranslationsJson(raw, 2);
    expect(parsed).toEqual([
      "I have been looking for a rental flat in Madrid for two weeks.",
      "The flat is on a third floor with a lift.",
    ]);
  });
});
