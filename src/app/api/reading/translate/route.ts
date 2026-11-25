import { NextRequest, NextResponse } from "next/server";
import { callGeminiFlashJson } from "@/lib/ai/gemini";
import { parseSentenceTranslationsJson } from "@/lib/reading/importers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      sentences?: unknown;
    };

    const rawSentences = Array.isArray(body.sentences) ? body.sentences : [];
    const sentences = rawSentences
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0)
      .slice(0, 30);

    if (sentences.length === 0) {
      return NextResponse.json(
        { error: "Please provide at least one Spanish sentence to translate." },
        { status: 400 }
      );
    }

    const systemPrompt = `You translate Spain Spanish (es-ES, Madrid) reading sections into clear, natural English.
Preserve exact meaning and idiomatic Peninsular Spanish expressions (e.g., piso = flat/apartment, vale = okay, llevar + time + gerund = have been doing for...).
Return ONLY valid JSON with no markdown or extra commentary.`;

    const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
    const userPrompt = `Translate each numbered Spain Spanish sentence below into natural English, keeping the exact same order and count (${sentences.length} items).

${numbered}

Return ONLY valid JSON:
{
  "translations": ["English translation for sentence 1", "..."]
}`;

    const rawAiText = await callGeminiFlashJson({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: Math.min(2400, Math.max(600, sentences.length * 120)),
    });

    const translations = parseSentenceTranslationsJson(
      rawAiText,
      sentences.length
    );

    return NextResponse.json({ translations });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not translate Spanish sections right now.",
      },
      { status: 500 }
    );
  }
}
