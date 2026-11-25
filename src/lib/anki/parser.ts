import { unzipSync } from "fflate";
import { decompress as zstdDecompress } from "fzstd";
import initSqlJs, { Database } from "sql.js";
import {
  AudioSource,
  FieldMappingConfig,
  Gender,
  NoteRecord,
} from "@/types/database";
import {
  buildClozeSentence,
  extractImageRefs,
  extractPrimarySentence,
  extractSoundRefs,
  getPreFilledFieldMapping,
  parseWordGenderAndLemma,
  stripHtml,
} from "./field-mapping";

export interface AnkiNoteTypeInfo {
  id: string;
  name: string;
  fieldNames: string[];
  noteCount: number;
  suggestedMapping: FieldMappingConfig;
  sampleNotes: Record<string, string>[];
}

export interface ParsedAnkiNote {
  anki_guid: string;
  modelId: string;
  modelName: string;
  rawFields: Record<string, string>;
  minDue: number;
  explicitRank: number | null;
  part: 1 | 2 | 3;
  word: string;
  lemma: string;
  meaning: string;
  example_es: string;
  cloze_es: string;
  example_tr: string;
  pos: string | null;
  gender: Gender;
  wordAudioFilename: string | null;
  wordAudioZipKey: string | null;
  exampleAudioFilename: string | null;
  exampleAudioZipKey: string | null;
  imageFilename: string | null;
  imageZipKey: string | null;
  freq_rank: number;
}

export interface AccentCheckSample {
  targetWord: "cinco" | "gracias" | "zapato" | "hacer";
  noteWord: string;
  exampleEs: string;
  wordAudioFilename: string | null;
  wordAudioZipKey: string | null;
  exampleAudioFilename: string | null;
  exampleAudioZipKey: string | null;
}

export interface ParsedApkgResult {
  fileName: string;
  part: 1 | 2 | 3;
  deckNames: string[];
  noteTypes: AnkiNoteTypeInfo[];
  notes: ParsedAnkiNote[];
  skippedInstructionNotes: number;
  mediaFilenameToZipKey: Record<string, string>;
  totalMediaFiles: number;
  accentSamples: AccentCheckSample[];
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function isZstdCompressed(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === ZSTD_MAGIC[0] &&
    bytes[1] === ZSTD_MAGIC[1] &&
    bytes[2] === ZSTD_MAGIC[2] &&
    bytes[3] === ZSTD_MAGIC[3]
  );
}

/**
 * Parses Anki's `media` manifest (either plain UTF-8 JSON or zstd-compressed protobuf).
 * Returns a map of { originalFilename -> zipEntryKey (e.g. "azure-xxx.mp3" -> "4834") }.
 */
export function parseMediaManifest(mediaBytes: Uint8Array): Record<string, string> {
  const filenameToZipKey: Record<string, string> = {};
  if (!mediaBytes || mediaBytes.length === 0) return filenameToZipKey;

  const rawBytes = isZstdCompressed(mediaBytes)
    ? zstdDecompress(mediaBytes)
    : mediaBytes;

  // Try standard JSON first: {"0": "file.mp3", "1": "file2.mp3"}
  try {
    const text = new TextDecoder("utf-8").decode(rawBytes);
    if (text.trim().startsWith("{")) {
      const parsed = JSON.parse(text) as Record<string, string>;
      for (const [zipKey, filename] of Object.entries(parsed)) {
        if (filename) {
          filenameToZipKey[filename] = zipKey;
        }
      }
      return filenameToZipKey;
    }
  } catch {
    // Fall through to protobuf parser for Anki 23.10+ .anki21b media manifests
  }

  // Minimal protobuf parser for Anki 23.10+ MediaEntries (repeated field 1: MediaEntry { string name = 1; ... })
  let offset = 0;
  let index = 0;
  const decoder = new TextDecoder("utf-8");

  const readVarint = (): number => {
    let result = 0;
    let shift = 0;
    while (offset < rawBytes.length) {
      const b = rawBytes[offset++];
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  };

  while (offset < rawBytes.length) {
    const tag = readVarint();
    const wireType = tag & 0x07;
    if (wireType === 2) {
      const len = readVarint();
      const entryEnd = Math.min(offset + len, rawBytes.length);
      let entryName = "";
      while (offset < entryEnd) {
        const innerTag = readVarint();
        const innerField = innerTag >> 3;
        const innerWire = innerTag & 0x07;
        if (innerWire === 2) {
          const strLen = readVarint();
          if (innerField === 1) {
            entryName = decoder.decode(rawBytes.subarray(offset, offset + strLen));
          }
          offset += strLen;
        } else if (innerWire === 0) {
          readVarint();
        } else {
          offset = entryEnd;
        }
      }
      if (entryName) {
        filenameToZipKey[entryName] = String(index);
      }
      index++;
      offset = entryEnd;
    } else {
      break;
    }
  }

  return filenameToZipKey;
}

/**
 * Detects part number (1, 2, or 3) from filename or deck name.
 */
export function detectPartNumber(fileName: string, deckNames: string[] = []): 1 | 2 | 3 {
  const combined = `${fileName} ${deckNames.join(" ")}`.toLowerCase();
  if (/part[\s_-]*3\b/.test(combined)) return 3;
  if (/part[\s_-]*2\b/.test(combined)) return 2;
  return 1;
}

/**
 * Checks if a note is an instructional / promotional banner note rather than a vocabulary note.
 */
function isInstructionalNote(
  modelName: string,
  rawFields: Record<string, string>,
  word: string,
  meaning: string
): boolean {
  if (!word || !meaning) return true;
  const lowerWord = word.toLowerCase();
  const lowerMeaning = meaning.toLowerCase();
  if (
    lowerWord.includes("naturallanguagejourney.com") ||
    lowerWord.includes("although this deck can be used by itself") ||
    lowerMeaning.includes("to delete this note") ||
    word.length > 140
  ) {
    return true;
  }
  if (modelName === "Basic" && Object.keys(rawFields).length <= 2 && word.length > 80) {
    return true;
  }
  return false;
}

let cachedBrowserWasmBinary: ArrayBuffer | null = null;

async function openSqliteDatabase(sqliteBytes: Uint8Array): Promise<Database> {
  if (typeof window !== "undefined") {
    if (!cachedBrowserWasmBinary) {
      const res = await fetch("/sql-wasm.wasm");
      if (!res.ok) {
        throw new Error(`Failed to fetch /sql-wasm.wasm (${res.status})`);
      }
      cachedBrowserWasmBinary = await res.arrayBuffer();
    }
    const SQL = await initSqlJs({
      wasmBinary: cachedBrowserWasmBinary,
    });
    return new SQL.Database(sqliteBytes);
  }

  const SQL = await initSqlJs({
    locateFile: (file: string) => `node_modules/sql.js/dist/${file}`,
  });
  return new SQL.Database(sqliteBytes);
}

/**
 * Extracts a single media file's raw bytes from an `.apkg` buffer by its numbered zip entry key.
 */
export function extractMediaBytesFromApkg(
  apkgBytes: Uint8Array,
  zipEntryKey: string
): Uint8Array | null {
  const unzipped = unzipSync(apkgBytes, {
    filter: (file) => file.name === zipEntryKey,
  });
  const entry = unzipped[zipEntryKey];
  if (!entry) return null;
  return isZstdCompressed(entry) ? zstdDecompress(entry) : entry;
}

/**
 * Batch-extracts multiple media files from an `.apkg` buffer in a single pass.
 */
export function extractMediaBatchFromApkg(
  apkgBytes: Uint8Array,
  zipEntryKeys: string[]
): Record<string, Uint8Array> {
  const keySet = new Set(zipEntryKeys);
  const unzipped = unzipSync(apkgBytes, {
    filter: (file) => keySet.has(file.name),
  });
  const result: Record<string, Uint8Array> = {};
  for (const [k, bytes] of Object.entries(unzipped)) {
    result[k] = isZstdCompressed(bytes) ? zstdDecompress(bytes) : bytes;
  }
  return result;
}

/**
 * Parses a single `.apkg` file buffer in browser or Node.
 * Only decompresses the SQLite DB and media manifest up-front so a 240 MB deck parses in ~1 second.
 */
export async function parseApkgBuffer(
  apkgBytes: Uint8Array,
  options: {
    fileName?: string;
    partOverride?: 1 | 2 | 3;
    customMappings?: Record<string, FieldMappingConfig>;
  } = {}
): Promise<ParsedApkgResult> {
  const fileName = options.fileName ?? "deck.apkg";
  let totalMediaFiles = 0;

  // 1. Unzip only non-numeric metadata entries (collection.anki21b / anki21 / anki2 / media)
  const metaFiles = unzipSync(apkgBytes, {
    filter: (file) => {
      if (/^\d+$/.test(file.name)) {
        totalMediaFiles++;
        return false;
      }
      return (
        file.name === "collection.anki21b" ||
        file.name === "collection.anki21" ||
        file.name === "collection.anki2" ||
        file.name === "media"
      );
    },
  });

  // 2. Parse media manifest
  const mediaBytes = metaFiles["media"];
  const mediaFilenameToZipKey = mediaBytes
    ? parseMediaManifest(mediaBytes)
    : {};

  // 3. Decompress SQLite database
  let dbBytes: Uint8Array | undefined;
  if (metaFiles["collection.anki21b"]) {
    const raw = metaFiles["collection.anki21b"];
    dbBytes = isZstdCompressed(raw) ? zstdDecompress(raw) : raw;
  } else if (metaFiles["collection.anki21"]) {
    dbBytes = metaFiles["collection.anki21"];
  } else if (metaFiles["collection.anki2"]) {
    dbBytes = metaFiles["collection.anki2"];
  }

  if (!dbBytes) {
    throw new Error(`No valid Anki SQLite collection found in ${fileName}`);
  }

  const db = await openSqliteDatabase(dbBytes);

  try {
    // 4. Read models (note types) and decks
    const deckNames: string[] = [];
    const modelMap: Record<
      string,
      { id: string; name: string; fieldNames: string[] }
    > = {};

    const tablesRes = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    const tableNames = new Set(
      (tablesRes[0]?.values ?? []).map((r) => String(r[0]))
    );

    if (tableNames.has("notetypes") && tableNames.has("fields")) {
      const ntRows = db.exec("SELECT id, name FROM notetypes")[0]?.values ?? [];
      for (const [id, name] of ntRows) {
        modelMap[String(id)] = {
          id: String(id),
          name: String(name),
          fieldNames: [],
        };
      }
      const fldRows =
        db.exec("SELECT ntid, name FROM fields ORDER BY ntid, ord ASC")[0]
          ?.values ?? [];
      for (const [ntid, fname] of fldRows) {
        modelMap[String(ntid)]?.fieldNames.push(String(fname));
      }
      if (tableNames.has("decks")) {
        const dRows = db.exec("SELECT name FROM decks")[0]?.values ?? [];
        for (const [dname] of dRows) {
          deckNames.push(String(dname));
        }
      }
    } else {
      const colRow = db.exec("SELECT models, decks FROM col")[0]?.values?.[0];
      if (colRow) {
        const modelsJson = JSON.parse(String(colRow[0])) as Record<
          string,
          {
            name: string;
            flds: { name: string; ord: number }[];
          }
        >;
        for (const [mid, m] of Object.entries(modelsJson)) {
          const sortedFields = [...(m.flds ?? [])]
            .sort((a, b) => a.ord - b.ord)
            .map((f) => f.name);
          modelMap[mid] = {
            id: mid,
            name: m.name,
            fieldNames: sortedFields,
          };
        }
        const decksJson = JSON.parse(String(colRow[1])) as Record<
          string,
          { name: string }
        >;
        for (const d of Object.values(decksJson)) {
          if (d.name && d.name !== "Default") {
            deckNames.push(d.name);
          }
        }
      }
    }

    const part = options.partOverride ?? detectPartNumber(fileName, deckNames);

    // 5. Read notes + minimum card due order
    const noteQuery = `
      SELECT n.id, n.guid, n.mid, n.flds, COALESCE(MIN(c.due), 999999) as min_due
      FROM notes n
      LEFT JOIN cards c ON c.nid = n.id AND c.ord = 0
      GROUP BY n.id
      ORDER BY min_due ASC, n.id ASC
    `;
    const noteRows = db.exec(noteQuery)[0]?.values ?? [];

    // Prepare note type summary & field mappings
    const noteTypeMap: Record<string, AnkiNoteTypeInfo> = {};
    for (const m of Object.values(modelMap)) {
      const mapping =
        options.customMappings?.[m.name] ??
        getPreFilledFieldMapping(m.name, m.fieldNames);
      noteTypeMap[m.id] = {
        id: m.id,
        name: m.name,
        fieldNames: m.fieldNames,
        noteCount: 0,
        suggestedMapping: mapping,
        sampleNotes: [],
      };
    }

    const parsedNotes: ParsedAnkiNote[] = [];
    let skippedInstructionNotes = 0;

    for (const row of noteRows) {
      const guid = String(row[1]);
      const mid = String(row[2]);
      const fldsStr = String(row[3]);
      const minDue = Number(row[4]);

      const model = modelMap[mid];
      if (!model) continue;

      const fldsArray = fldsStr.split("\x1f");
      const rawFields: Record<string, string> = {};
      model.fieldNames.forEach((fname, idx) => {
        rawFields[fname] = (fldsArray[idx] ?? "").trim();
      });

      const mapping = noteTypeMap[mid].suggestedMapping;
      const getByRole = (role: string): string => {
        for (const [fname, fRole] of Object.entries(mapping)) {
          if (fRole === role && rawFields[fname]) {
            return rawFields[fname];
          }
        }
        return "";
      };

      const rawWord = getByRole("word");
      const rawMeaning = stripHtml(getByRole("meaning"));
      const rawPos = getByRole("pos");
      const rawGender = getByRole("gender");
      const rawRanking = stripHtml(getByRole("ranking")).replace(/,/g, "");

      if (isInstructionalNote(model.name, rawFields, rawWord, rawMeaning)) {
        skippedInstructionNotes++;
        continue;
      }

      const noteTypeInfo = noteTypeMap[mid];
      noteTypeInfo.noteCount++;
      if (noteTypeInfo.sampleNotes.length < 5) {
        noteTypeInfo.sampleNotes.push(rawFields);
      }

      const { word, lemma, gender, pos } = parseWordGenderAndLemma(
        rawWord,
        rawPos,
        rawGender
      );

      const exampleEs = extractPrimarySentence(getByRole("example_es"));
      const exampleTr = extractPrimarySentence(getByRole("example_tr"));
      const clozeEs = buildClozeSentence(
        getByRole("cloze_es"),
        exampleEs,
        lemma,
        word
      );

      const wordSounds = extractSoundRefs(getByRole("audio_word"));
      const exampleSounds = extractSoundRefs(getByRole("audio_example"));
      const images = extractImageRefs(getByRole("image"));

      const wordAudioFilename = wordSounds[0] ?? null;
      const exampleAudioFilename = exampleSounds[0] ?? null;
      const imageFilename = images[0] ?? null;

      const explicitRankNum = rawRanking ? Number.parseInt(rawRanking, 10) : NaN;
      const explicitRank =
        Number.isFinite(explicitRankNum) && explicitRankNum > 0
          ? explicitRankNum
          : null;

      parsedNotes.push({
        anki_guid: guid,
        modelId: mid,
        modelName: model.name,
        rawFields,
        minDue,
        explicitRank,
        part,
        word,
        lemma,
        meaning: rawMeaning,
        example_es: exampleEs,
        cloze_es: clozeEs,
        example_tr: exampleTr,
        pos,
        gender,
        wordAudioFilename,
        wordAudioZipKey: wordAudioFilename
          ? mediaFilenameToZipKey[wordAudioFilename] ?? null
          : null,
        exampleAudioFilename,
        exampleAudioZipKey: exampleAudioFilename
          ? mediaFilenameToZipKey[exampleAudioFilename] ?? null
          : null,
        imageFilename,
        imageZipKey: imageFilename
          ? mediaFilenameToZipKey[imageFilename] ?? null
          : null,
        freq_rank: 0,
      });
    }

    // 6. Sort notes by explicitRank (if present) then minDue, and assign continuous 1..N freq_rank
    parsedNotes.sort((a, b) => {
      if (a.explicitRank !== null && b.explicitRank !== null) {
        return a.explicitRank - b.explicitRank;
      }
      if (a.explicitRank !== null) return -1;
      if (b.explicitRank !== null) return 1;
      return a.minDue - b.minDue;
    });

    parsedNotes.forEach((n, index) => {
      n.freq_rank = index + 1;
    });

    // 7. Locate the 4 Accent Check words (cinco, gracias, zapato, hacer) per SPEC.md
    const accentTargets: ("cinco" | "gracias" | "zapato" | "hacer")[] = [
      "cinco",
      "gracias",
      "zapato",
      "hacer",
    ];
    const accentSamples: AccentCheckSample[] = [];
    for (const target of accentTargets) {
      const match =
        parsedNotes.find((n) => n.lemma.toLowerCase() === target) ??
        parsedNotes.find((n) =>
          new RegExp(`\\b${target}\\b`, "i").test(n.word)
        );
      if (match) {
        accentSamples.push({
          targetWord: target,
          noteWord: match.word,
          exampleEs: match.example_es,
          wordAudioFilename: match.wordAudioFilename,
          wordAudioZipKey: match.wordAudioZipKey,
          exampleAudioFilename: match.exampleAudioFilename,
          exampleAudioZipKey: match.exampleAudioZipKey,
        });
      }
    }

    return {
      fileName,
      part,
      deckNames,
      noteTypes: Object.values(noteTypeMap).filter((nt) => nt.noteCount > 0),
      notes: parsedNotes,
      skippedInstructionNotes,
      mediaFilenameToZipKey,
      totalMediaFiles,
      accentSamples,
    };
  } finally {
    db.close();
  }
}

/**
 * Merges multiple parsed `.apkg` results (e.g. Part 1, Part 2, Part 3) into a single
 * continuously ranked list (1..10,000), deduplicating by `anki_guid`.
 */
export function mergeMultiPartResults(
  results: ParsedApkgResult[]
): ParsedAnkiNote[] {
  const sortedParts = [...results].sort((a, b) => a.part - b.part);
  const byGuid = new Map<string, ParsedAnkiNote>();

  for (const partRes of sortedParts) {
    for (const note of partRes.notes) {
      byGuid.set(note.anki_guid, { ...note });
    }
  }

  const merged = Array.from(byGuid.values());
  merged.sort((a, b) => {
    if (a.part !== b.part) return a.part - b.part;
    return a.freq_rank - b.freq_rank;
  });

  merged.forEach((note, idx) => {
    note.freq_rank = idx + 1;
  });

  return merged;
}

/**
 * Idempotently merges newly imported notes into an existing collection of NoteRecords:
 * - Matches on `anki_guid`
 * - Preserves existing `id` and `created_at` so associated FSRS cards & review logs are never reset
 * - Updates mutable content fields (`word`, `lemma`, `meaning`, `example_es`, `cloze_es`, `pos`, `gender`, `freq_rank`, `audio_source`)
 */
export function upsertNotesIdempotently(
  existingNotes: NoteRecord[],
  incomingNotes: ParsedAnkiNote[],
  audioSource: AudioSource
): {
  notes: NoteRecord[];
  insertedCount: number;
  updatedCount: number;
} {
  const existingByGuid = new Map<string, NoteRecord>(
    existingNotes.map((n) => [n.anki_guid, n])
  );

  let insertedCount = 0;
  let updatedCount = 0;
  const nowIso = new Date().toISOString();

  for (const inc of incomingNotes) {
    const existing = existingByGuid.get(inc.anki_guid);
    if (existing) {
      updatedCount++;
      existingByGuid.set(inc.anki_guid, {
        ...existing,
        word: inc.word,
        lemma: inc.lemma,
        meaning: inc.meaning,
        example_es: inc.example_es,
        cloze_es: inc.cloze_es,
        example_tr: inc.example_tr,
        pos: inc.pos,
        gender: inc.gender,
        part: inc.part,
        freq_rank: inc.freq_rank,
        audio_source: audioSource,
        deck_audio_word_url:
          existing.deck_audio_word_url ?? inc.wordAudioFilename,
        deck_audio_example_url:
          existing.deck_audio_example_url ?? inc.exampleAudioFilename,
      });
    } else {
      insertedCount++;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `note-${inc.anki_guid}`;
      existingByGuid.set(inc.anki_guid, {
        id,
        anki_guid: inc.anki_guid,
        word: inc.word,
        lemma: inc.lemma,
        meaning: inc.meaning,
        example_es: inc.example_es,
        cloze_es: inc.cloze_es,
        example_tr: inc.example_tr,
        pos: inc.pos,
        gender: inc.gender,
        image_url: inc.imageFilename,
        audio_word_url:
          audioSource === "deck" ? inc.wordAudioFilename : null,
        audio_example_url:
          audioSource === "deck" ? inc.exampleAudioFilename : null,
        deck_audio_word_url: inc.wordAudioFilename,
        deck_audio_example_url: inc.exampleAudioFilename,
        audio_source: audioSource,
        part: inc.part,
        freq_rank: inc.freq_rank,
        source: "deck",
        created_at: nowIso,
      });
    }
  }

  const finalNotes = Array.from(existingByGuid.values()).sort(
    (a, b) => a.part - b.part || a.freq_rank - b.freq_rank
  );

  return {
    notes: finalNotes,
    insertedCount,
    updatedCount,
  };
}
