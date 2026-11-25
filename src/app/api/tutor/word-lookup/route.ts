import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { callGeminiFlashJson } from "@/lib/ai/gemini";
import { extractJsonFromAiText, parseAiLemmaLookupJson } from "@/lib/ai/json-parser";
import {
  cleanSelectedSpanishText,
  lookupBuiltInSpanishWord,
  WordLookupEntry,
} from "@/lib/tutor/word-dictionary";

const WORD_CACHE_DIR = path.join(process.cwd(), "data", "word-cache");

function slugifyWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      word?: string;
      contextSentence?: string;
    };

    const cleanedWord = cleanSelectedSpanishText(body.word ?? "");
    if (!cleanedWord || cleanedWord.length > 140) {
      return NextResponse.json(
        { error: "Please select a word or phrase up to 140 characters" },
        { status: 400 }
      );
    }

    // 1. Check built-in bidirectional dictionary (Spanish <-> English) + 12-week curriculum first
    const builtIn = lookupBuiltInSpanishWord(cleanedWord);
    if (builtIn) {
      return NextResponse.json({
        ...builtIn,
        cached: true,
      });
    }

    // 2. Check persistent disk cache (AGENTS.md: cache every AI word lookup)
    const slug = slugifyWord(cleanedWord) || "word";
    const cachePath = path.join(WORD_CACHE_DIR, `${slug}.json`);
    try {
      const cachedRaw = await fs.readFile(cachePath, "utf-8");
      const cached = JSON.parse(cachedRaw) as WordLookupEntry;
      if (cached && cached.word && cached.meaning) {
        return NextResponse.json({
          ...cached,
          cached: true,
        });
      }
    } catch {
      // Cache miss -> call Gemini Flash
    }

    const contextHint = body.contextSentence
      ? `\nContext sentence where the learner selected it: "${body.contextSentence.slice(0, 220)}"`
      : "";

    const systemPrompt = `You are a concise bidirectional Spain Spanish (es-ES, Madrid) <-> English dictionary and phrase translator.
Detect whether the selected word, phrase, or sentence is Spanish or English:
- If the selected text is SPANISH: set "direction": "es-to-en", "word" to the selected Spanish text, "lemma" to its base form (or the phrase itself if multi-word), "pos" to "phrase" if multi-word, and "meaning" to its natural English translation.
- If the selected text is ENGLISH: set "direction": "en-to-es", translate it into natural Madrid Spain Spanish (es-ES) in "word" (include 'el' or 'la' if it is a single noun), set "lemma" to the lowercase Spanish lemma or phrase, and set "meaning" to the English text.
Always include one short, natural Madrid Spanish example sentence ("example_es") and its English translation ("example_tr").`;

    const userPrompt = `Selected text: "${cleanedWord}"${contextHint}

Return ONLY valid JSON with this exact shape:
{
  "direction": "es-to-en" | "en-to-es",
  "word": "Spain Spanish (es-ES) word or phrase",
  "lemma": "Spanish base dictionary form in lowercase",
  "pos": "n | v | adj | adv | prep | pron | phrase",
  "gender": "el" | "la" | "el/la" | null,
  "meaning": "concise English meaning (under 12 words)",
  "example_es": "short natural Madrid Spanish sentence using the Spanish word",
  "example_tr": "English translation of example_es"
}`;

    const rawAiText = await callGeminiFlashJson({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    });

    const parsed = parseAiLemmaLookupJson(rawAiText);
    const rawObj = extractJsonFromAiText<Record<string, unknown>>(rawAiText);

    const direction: "es-to-en" | "en-to-es" =
      rawObj.direction === "en-to-es" ? "en-to-es" : "es-to-en";

    const entry: WordLookupEntry = {
      direction,
      word:
        direction === "en-to-es"
          ? parsed.word
          : cleanedWord,
      lemma: parsed.lemma,
      pos: parsed.pos,
      gender: parsed.gender,
      meaning: parsed.meaning,
      example_es:
        typeof rawObj.example_es === "string"
          ? rawObj.example_es.trim()
          : undefined,
      example_tr:
        typeof rawObj.example_tr === "string"
          ? rawObj.example_tr.trim()
          : undefined,
      sourceBadge: "ai",
    };

    await fs.mkdir(WORD_CACHE_DIR, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(entry, null, 2), "utf-8");

    return NextResponse.json({
      ...entry,
      cached: false,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to look up word",
      },
      { status: 500 }
    );
  }
}
