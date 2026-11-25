import { NextRequest, NextResponse } from "next/server";
import { callGeminiFlashJson } from "@/lib/ai/gemini";
import { parseJournalCorrectionJson } from "@/lib/practice/drills";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      prompt?: string;
      entryEs?: string;
      cefr?: string;
    };

    const entryEs = (body.entryEs ?? "").trim();
    if (!entryEs || entryEs.length < 10) {
      return NextResponse.json(
        { error: "Write at least a couple of Spanish sentences to grade." },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a Spain Spanish (es-ES, Madrid) writing tutor.
Correct the learner's short Spanish journal entry into natural Peninsular Spanish (Madrid), keeping their meaning intact.
List each concrete grammar, spelling, gender, tense, or phrasing improvement in "changes" (empty array if already perfect).`;

    const userPrompt = `Prompt: "${body.prompt ?? "Daily Madrid journal"}" (${body.cefr ?? "A1-A2"})
Learner's Spanish entry:
"${entryEs}"

Return ONLY valid JSON:
{
  "score": 84,
  "correctedEs": "The full natural Spain Spanish (es-ES) corrected version without markdown asterisks",
  "feedbackEn": "2 short sentences in English: what was strong and the main focus for next time.",
  "changes": [
    {
      "category": "gender | ser/estar | tense choice | agreement | vocabulary | spelling | prepositions | other",
      "wrong": "exact phrase with mistake",
      "correct": "natural Spain Spanish correction",
      "explanation": "one-line English rule"
    }
  ]
}`;

    const rawText = await callGeminiFlashJson({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxOutputTokens: 1200,
    });

    const parsed = parseJournalCorrectionJson(rawText, entryEs);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to correct writing journal entry",
      },
      { status: 500 }
    );
  }
}
