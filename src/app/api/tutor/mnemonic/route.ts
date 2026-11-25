import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { callGeminiFlashJson } from "@/lib/ai/gemini";
import { parseAiMnemonicPayloadJson } from "@/lib/ai/json-parser";
import { LeechMnemonicResult } from "@/types/database";

const MNEMONIC_CACHE_DIR = path.join(process.cwd(), "data", "mnemonic-cache");

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
      word: string;
      meaning: string;
      gender?: string | null;
      pos?: string | null;
    };

    const word = (body.word ?? "").trim();
    const meaning = (body.meaning ?? "").trim();
    if (!word) {
      return NextResponse.json({ error: "Missing word" }, { status: 400 });
    }

    const slug = slugifyWord(word) || "word";
    const cachePath = path.join(MNEMONIC_CACHE_DIR, `${slug}.json`);

    try {
      const cachedRaw = await fs.readFile(cachePath, "utf-8");
      const cached = JSON.parse(cachedRaw) as LeechMnemonicResult;
      return NextResponse.json({ ...cached, cached: true });
    } catch {
      // Cache miss
    }

    const systemPrompt =
      "You are a memory coach and Madrid Spanish (es-ES) tutor. Create vivid, memorable English mnemonics and 3 short Spain Spanish example sentences.";
    const userPrompt = `The learner keeps forgetting this Spanish word (a 'leech' card):
Word: "${word}" (${body.gender ? `gender: ${body.gender}, ` : ""}${
      body.pos ? `POS: ${body.pos}` : ""
    })
Meaning: "${meaning}"

Return ONLY valid JSON with:
1. "mnemonic": A vivid 1-2 sentence memory hook in English linking the sound/spelling of "${word}" to "${meaning}".
2. "examples": Exactly 3 short, natural Madrid Spain Spanish (es-ES) sentences using "${word}" with English translations.

{
  "mnemonic": "...",
  "examples": [
    { "es": "...", "en": "..." },
    { "es": "...", "en": "..." },
    { "es": "...", "en": "..." }
  ]
}`;

    try {
      const rawAiText = await callGeminiFlashJson({
        systemPrompt,
        userPrompt,
        temperature: 0.5,
      });
      const parsed = parseAiMnemonicPayloadJson(rawAiText);
      const result: LeechMnemonicResult = {
        word,
        mnemonic: parsed.mnemonic,
        examples: parsed.examples.slice(0, 3),
      };

      await fs.mkdir(MNEMONIC_CACHE_DIR, { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(result, null, 2), "utf-8");

      return NextResponse.json({ ...result, cached: false });
    } catch {
      const fallback: LeechMnemonicResult = {
        word,
        mnemonic: `Picture "${word}" written in giant neon orange letters in Madrid's Puerta del Sol meaning "${meaning}". Say it aloud 3 times with crisp Castilian pronunciation.`,
        examples: [
          {
            es: `Necesito recordar la palabra «${word}» hoy.`,
            en: `I need to remember the word "${word}" today (${meaning}).`,
          },
          {
            es: `En Madrid usamos mucho «${word}».`,
            en: `In Madrid we use "${word}" a lot.`,
          },
          {
            es: `¿Sabéis qué significa «${word}»?`,
            en: `Do you all know what "${word}" means?`,
          },
        ],
      };
      return NextResponse.json({ ...fallback, cached: false, fallback: true });
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate mnemonic",
      },
      { status: 500 }
    );
  }
}
