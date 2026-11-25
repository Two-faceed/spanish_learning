import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  extractMediaBytesFromApkg,
  mergeMultiPartResults,
  parseApkgBuffer,
  upsertNotesIdempotently,
} from "@/lib/anki/parser";
import {
  buildClozeSentence,
  matchesSpanishTargetAnswer,
  parseWordGenderAndLemma,
} from "@/lib/anki/field-mapping";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";

const DATA_DIR = path.resolve(__dirname, "../data");
const TOP_5000_PATH = path.join(DATA_DIR, "New_Spanish_Top_5000_Vocabulary.apkg");
const PART_1_10K_PATH = path.join(
  DATA_DIR,
  "10000_Spanish_Vocabulary_Part_1_of_3.apkg"
);

describe("Anki Importer & Field Mapping", () => {
  it("parses gender and lemma from article prefixes and POS tags", () => {
    expect(parseWordGenderAndLemma("el color")).toEqual({
      word: "el color",
      lemma: "color",
      gender: "el",
      pos: "n",
    });

    expect(parseWordGenderAndLemma("la amenaza")).toEqual({
      word: "la amenaza",
      lemma: "amenaza",
      gender: "la",
      pos: "n",
    });

    expect(parseWordGenderAndLemma("zapato", "nm")).toEqual({
      word: "el zapato",
      lemma: "zapato",
      gender: "el",
      pos: "nm",
    });

    expect(parseWordGenderAndLemma("agua", "nf (el)")).toEqual({
      word: "el agua",
      lemma: "agua",
      gender: "la",
      pos: "nf (el)",
    });

    expect(parseWordGenderAndLemma("hablar", "v")).toEqual({
      word: "hablar",
      lemma: "hablar",
      gender: null,
      pos: "v",
    });
  });

  it("imports New_Spanish_Top_5000_Vocabulary.apkg (Spain es-ES deck) in <15s with all 5,000 ranked words and audio", async () => {
    expect(fs.existsSync(TOP_5000_PATH)).toBe(true);
    const startMs = Date.now();
    const rawBuffer = fs.readFileSync(TOP_5000_PATH);
    const result = await parseApkgBuffer(new Uint8Array(rawBuffer), {
      fileName: "New_Spanish_Top_5000_Vocabulary.apkg",
    });
    const elapsedMs = Date.now() - startMs;

    // Must complete well under the 2-minute acceptance threshold
    expect(elapsedMs).toBeLessThan(15000);

    // 5,000+ vocabulary notes
    expect(result.notes.length).toBeGreaterThanOrEqual(5000);
    expect(result.totalMediaFiles).toBe(4948);

    // Frequency rank order preserved
    expect(result.notes[0].freq_rank).toBe(1);
    expect(result.notes[0].lemma).toContain("el");
    expect(result.notes[1].freq_rank).toBe(2);
    expect(result.notes[1].word).toBe("de");

    // Accent check samples (cinco, gracias, zapato, hacer) extracted with valid zip keys
    const sampleWords = result.accentSamples.map((s) => s.targetWord);
    expect(sampleWords).toEqual(["cinco", "gracias", "zapato", "hacer"]);
    for (const sample of result.accentSamples) {
      expect(sample.wordAudioZipKey).toBeTruthy();
      const mp3Bytes = extractMediaBytesFromApkg(
        new Uint8Array(rawBuffer),
        sample.wordAudioZipKey!
      );
      expect(mp3Bytes).not.toBeNull();
      expect(mp3Bytes!.byteLength).toBeGreaterThan(1000);
    }
  });

  it("imports 10000_Spanish_Vocabulary_Part_1_of_3.apkg, skips the 1 Basic instruction note, and preserves 3,638 ranked notes", async () => {
    expect(fs.existsSync(PART_1_10K_PATH)).toBe(true);
    const rawBuffer = fs.readFileSync(PART_1_10K_PATH);
    const result = await parseApkgBuffer(new Uint8Array(rawBuffer), {
      fileName: "10000_Spanish_Vocabulary_Part_1_of_3.apkg",
    });

    expect(result.part).toBe(1);
    expect(result.skippedInstructionNotes).toBe(1);
    expect(result.notes.length).toBe(3638);

    // First 4 notes match the deck's due order
    expect(result.notes[0].word).toBe("el color");
    expect(result.notes[0].gender).toBe("el");
    expect(result.notes[0].lemma).toBe("color");
    expect(result.notes[0].cloze_es).toBe("__ es hermoso.");
    expect(result.notes[1].word).toBe("tener");
    expect(result.notes[2].word).toBe("hablar");
    expect(result.notes[3].word).toBe("la comida");
    expect(result.notes[3].gender).toBe("la");

    // Every note in Part 1 has both word and sentence audio resolved
    const withBothAudio = result.notes.filter(
      (n) => n.wordAudioZipKey && n.exampleAudioZipKey
    );
    expect(withBothAudio.length).toBe(3638);

    // Test idempotent re-import on anki_guid
    const firstImport = upsertNotesIdempotently(
      [],
      result.notes.slice(0, 20),
      "es-ES TTS"
    );
    expect(firstImport.insertedCount).toBe(20);
    expect(firstImport.updatedCount).toBe(0);

    const secondImport = upsertNotesIdempotently(
      firstImport.notes,
      result.notes.slice(0, 25),
      "es-ES TTS"
    );
    expect(secondImport.insertedCount).toBe(5);
    expect(secondImport.updatedCount).toBe(20);
    expect(secondImport.notes.length).toBe(25);
    // Original note IDs are preserved
    expect(secondImport.notes[0].id).toBe(firstImport.notes[0].id);
  });

  it("merges multi-part imports continuously across Part 1, 2, 3", () => {
    const fakePart1 = {
      fileName: "Part1.apkg",
      part: 1 as const,
      deckNames: [],
      noteTypes: [],
      skippedInstructionNotes: 0,
      mediaFilenameToZipKey: {},
      totalMediaFiles: 0,
      accentSamples: [],
      notes: [
        {
          anki_guid: "g1",
          modelId: "m1",
          modelName: "M",
          rawFields: {},
          minDue: 1,
          explicitRank: 1,
          part: 1 as const,
          word: "uno",
          lemma: "uno",
          meaning: "one",
          example_es: "",
          cloze_es: "",
          example_tr: "",
          pos: "num",
          gender: null,
          wordAudioFilename: null,
          wordAudioZipKey: null,
          exampleAudioFilename: null,
          exampleAudioZipKey: null,
          imageFilename: null,
          imageZipKey: null,
          freq_rank: 1,
        },
      ],
    };
    const fakePart2 = {
      ...fakePart1,
      fileName: "Part2.apkg",
      part: 2 as const,
      notes: [
        {
          ...fakePart1.notes[0],
          anki_guid: "g2",
          part: 2 as const,
          word: "dos",
          lemma: "dos",
          meaning: "two",
          freq_rank: 1,
        },
      ],
    };

    const merged = mergeMultiPartResults([fakePart2, fakePart1]);
    expect(merged.map((n) => [n.word, n.freq_rank])).toEqual([
      ["uno", 1],
      ["dos", 2],
    ]);
  });

  it("blanks comma-separated variants like 'el,la' in cloze sentences and pronounces them separately", () => {
    // Even if an old stored cloze_es lacked a blank, buildClozeSentence masks "El"
    const cloze = buildClozeSentence(
      "El perro es amigable.",
      "El perro es amigable.",
      "el,la",
      "el,la"
    );
    expect(cloze).toBe("____ perro es amigable.");
    expect(matchesSpanishTargetAnswer("el", "el,la", "el,la")).toBe(true);
    expect(matchesSpanishTargetAnswer("la", "el,la", "el,la")).toBe(true);
    expect(matchesSpanishTargetAnswer("que", "el,la", "el,la")).toBe(false);
    expect(toMadridEnglishPhonetics("el,la")).toBe("ehl, lah");
  });
});
