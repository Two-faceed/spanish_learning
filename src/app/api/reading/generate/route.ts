import { NextRequest, NextResponse } from "next/server";
import { callGeminiFlashJson } from "@/lib/ai/gemini";
import { parseGeneratedGradedReaderJson } from "@/lib/reading/importers";

export const runtime = "nodejs";

type GradedLength = "short" | "medium" | "long";
type GradedStyle = "story" | "article" | "dialogue";

const LENGTH_WORD_TARGETS: Record<GradedLength, { min: number; max: number }> = {
  short: { min: 110, max: 150 },
  medium: { min: 220, max: 280 },
  long: { min: 380, max: 460 },
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      topic?: string;
      length?: GradedLength;
      style?: GradedStyle;
      cefr?: string;
      knownWords?: string[];
      learningWords?: string[];
    };

    const topic = (body.topic ?? "").trim();
    if (!topic) {
      return NextResponse.json(
        { error: "Please enter a topic for your personalized Spanish text" },
        { status: 400 }
      );
    }

    const length: GradedLength =
      body.length === "short" || body.length === "long" ? body.length : "medium";
    const style: GradedStyle =
      body.style === "article" || body.style === "dialogue"
        ? body.style
        : "story";
    const cefr = (body.cefr ?? "A1-A2").trim();
    const { min, max } = LENGTH_WORD_TARGETS[length];

    const knownSample = Array.isArray(body.knownWords)
      ? body.knownWords.slice(0, 70).join(", ")
      : "";
    const learningSample = Array.isArray(body.learningWords)
      ? body.learningWords.slice(0, 25).join(", ")
      : "";

    const systemPrompt = `You are a Spain Spanish (es-ES, Madrid) graded reader author.
Write engaging, natural Peninsular Spanish texts tailored to one learner's exact vocabulary so ~95% of words are familiar and 5-10 useful target words are introduced naturally in context.
ALWAYS use Spain Spanish (es-ES): vosotros when plural informal, Peninsular vocabulary (coche, móvil, ordenador, vale, piso, zumo, patatas), and present perfect for today's events.
NEVER use Markdown asterisks (** or *) or bullet lists inside the reading text — write clean paragraphs separated by blank lines.`;

    const userPrompt = `Write a personalized Madrid Spanish (${cefr}) ${style} about:
Topic: "${topic}"
Target length: ${min} to ${max} Spanish words.
Learner's known words (weave these in naturally): ${knownSample || "basic beginner everyday Madrid vocabulary"}
Learner's currently learning words (reinforce several of these): ${learningSample || "none yet"}

Return ONLY valid JSON:
{
  "title": "Catchy Spanish title with CEFR tag, e.g. Un café en Malasaña (${cefr})",
  "content": "The full Spanish ${style} in 2-4 clean paragraphs separated by \\n\\n (no markdown asterisks, no English translation)",
  "targetWords": ["5 to 8 useful Spanish words/phrases introduced in this text"]
}`;

    const rawAiText = await callGeminiFlashJson({
      systemPrompt,
      userPrompt,
      temperature: 0.65,
      maxOutputTokens: length === "long" ? 1100 : 750,
    });

    const result = parseGeneratedGradedReaderJson(rawAiText, topic);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate personalized Spanish text",
      },
      { status: 500 }
    );
  }
}
