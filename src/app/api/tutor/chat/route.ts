import { NextRequest, NextResponse } from "next/server";
import { callGeminiFlashJson } from "@/lib/ai/gemini";
import { parseAiChatPayloadJson } from "@/lib/ai/json-parser";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      messages: { role: "user" | "tutor"; content: string }[];
      memorySummary?: string;
      cefr?: string;
      topic?: string;
      knownLemmasSample?: string[];
      recentErrors?: { category: string; wrong: string; correct: string }[];
      spanishOnlyMode?: boolean;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUserMessage =
      [...messages].reverse().find((m) => m.role === "user")?.content?.trim() ??
      "";

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: "No user message provided" },
        { status: 400 }
      );
    }

    const errorsList =
      Array.isArray(body.recentErrors) && body.recentErrors.length > 0
        ? body.recentErrors
            .slice(0, 5)
            .map((e) => `[${e.category}] "${e.wrong}"->"${e.correct}"`)
            .join("; ")
        : "none";

    const packedMemory = body.memorySummary?.trim()
      ? `Past conversation memory: ${body.memorySummary.trim().slice(0, 500)}`
      : "";

    const systemPrompt = [
      `You are a fast, friendly Spanish tutor from Madrid (es-ES). Level: ${body.cefr ?? "A1-A2"}.`,
      `Recent learner errors: ${errorsList}.`,
      packedMemory,
      body.spanishOnlyMode
        ? "Reply in simple Spain Spanish (es-ES)."
        : "Reply in natural Spain Spanish (es-ES) with brief English translations.",
      "RULES: 1) Directly answer the learner's last message. 2) No markdown asterisks (** or *). 3) Keep reply under 65 words and end with a short Spanish follow-up question.",
    ]
      .filter(Boolean)
      .join("\n");

    const recentTranscript = messages
      .slice(-4)
      .map(
        (m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`
      )
      .join("\n");

    const userPrompt = `Recent turns:
${recentTranscript}

Respond to: "${lastUserMessage}".
If the learner wrote Spanish with a mistake, list each in "corrections" as {"category","wrong","correct","explanation"} (categories: "gender","ser/estar","tense choice","agreement","vocabulary","spelling","pronouns","prepositions","other"). Otherwise "corrections": [].
Return JSON: {"reply":"...","corrections":[]}`;

    try {
      const rawAiText = await callGeminiFlashJson({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
        maxOutputTokens: 250,
      });
      const parsed = parseAiChatPayloadJson(rawAiText);
      return NextResponse.json(parsed);
    } catch (aiErr) {
      console.warn("[api/tutor/chat] AI unavailable:", aiErr);
      const message =
        aiErr instanceof Error && aiErr.message
          ? aiErr.message
          : "Gemini API is temporarily busy (high demand 503). Tap Retry in a moment.";
      return NextResponse.json(
        { error: message },
        { status: message.includes("GEMINI_API_KEY") ? 500 : 503 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to run tutor chat",
      },
      { status: 500 }
    );
  }
}
