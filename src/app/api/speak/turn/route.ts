import { NextRequest, NextResponse } from "next/server";
import { parseSpeakTurnJson } from "@/lib/speak/scenarios";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      scenarioTitle?: string;
      goalEn?: string;
      characterName?: string;
      characterRole?: string;
      setting?: string;
      cefr?: string;
      history?: { role: "user" | "assistant"; text: string }[];
      userText?: string;
      wavBase64?: string;
      slowMode?: boolean;
    };

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured in .env.local" },
        { status: 500 }
      );
    }

    const historyText = Array.isArray(body.history)
      ? body.history
          .slice(-6)
          .map((m) => `${m.role === "user" ? "Learner" : body.characterName ?? "Partner"}: ${m.text}`)
          .join("\n")
      : "";

    const prompt = `You are ${body.characterName ?? "Carlos"}, ${body.characterRole ?? "a friendly local in Madrid, Spain"}.
Setting: ${body.setting ?? "Everyday life in Madrid"}.
Learner CEFR level: ${body.cefr ?? "A1-A2"}.
${body.slowMode ? "IMPORTANT: Speak extra simply and clearly using short sentences." : ""}

Conversation so far:
${historyText || "(start of call)"}

${
  body.wavBase64
    ? "Listen to the learner's attached audio clip, transcribe what they said in Spanish into 'userTranscript', then reply naturally IN CHARACTER."
    : `The learner just said: "${(body.userText ?? "").trim()}". Reply naturally IN CHARACTER.`
}

RULES:
- Stay 100% in character as a real Madrid local (Spain Spanish es-ES: vale, vosotros if plural, natural Peninsular phrasing).
- Keep 'replyEs' concise (1-2 natural spoken sentences, under 35 words) and ask a realistic follow-up question to keep the roleplay moving.
- Provide a brief English translation in 'replyEn'.
- Optionally provide a 1-line 'quickHintEn' suggesting what the learner could say next.
- Check the learner's Spanish in 'userTranscript':
  * ONLY if it has a grammar mistake OR sounds unnatural/non-native in Madrid, set 'correctionSuggestion' to a short, natural Madrid correction + 1-line English reason (e.g., 'More native: "Ponme un café con leche, por favor" (natural way to order in Spain)').
  * If what the learner said is already correct and natural, set 'correctionSuggestion' to "" (empty string — do NOT force a suggestion!).
- Scenario goal: "${body.goalEn ?? "Complete the conversation naturally"}".
  * Set 'goalCompleted': true as soon as the learner has achieved the scenario goal and the interaction has reached a natural wrap-up (e.g., ordered & said goodbye/thanks, agreed on terms, etc.). When 'goalCompleted' is true, give a warm natural farewell in 'replyEs' and leave 'quickHintEn' empty "". Otherwise set 'goalCompleted': false.

Return ONLY valid JSON:
{
  "userTranscript": "what the learner said",
  "replyEs": "Your natural Spain Spanish reply in character",
  "replyEn": "English translation of replyEs",
  "quickHintEn": "Short suggestion in English for how to answer (empty if goalCompleted is true)",
  "correctionSuggestion": "",
  "goalCompleted": false
}`;

    const models: { name: string; timeoutMs: number; allowThinkingZero?: boolean }[] = [
      { name: "gemini-3.5-flash-lite", timeoutMs: 12000 },
      { name: "gemini-3.1-flash-lite", timeoutMs: 12000 },
      { name: "gemini-flash-lite-latest", timeoutMs: 12000 },
      { name: "gemini-3.6-flash", timeoutMs: 15000, allowThinkingZero: true },
      { name: "gemini-3.7-flash", timeoutMs: 15000, allowThinkingZero: true },
      { name: "gemini-3.8-flash", timeoutMs: 15000, allowThinkingZero: true },
      { name: "gemini-3-flash-preview", timeoutMs: 15000, allowThinkingZero: true },
      { name: "gemini-flash-latest", timeoutMs: 15000, allowThinkingZero: true },
      { name: "gemini-3.5-flash", timeoutMs: 15000, allowThinkingZero: true },
    ];

    const parts: Record<string, unknown>[] = [{ text: prompt }];
    if (body.wavBase64) {
      parts.push({
        inlineData: {
          mimeType: "audio/wav",
          data: body.wavBase64,
        },
      });
    }

    const errors: string[] = [];
    for (const modelCfg of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelCfg.name
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const maxAttempts = modelCfg.name === "gemini-3.5-flash-lite" ? 2 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(modelCfg.timeoutMs),
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: {
                temperature: 0.55,
                responseMimeType: "application/json",
                ...(modelCfg.allowThinkingZero
                  ? { thinkingConfig: { thinkingBudget: 0 } }
                  : {}),
              },
            }),
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            errors.push(`${modelCfg.name} (${res.status}): ${errText.slice(0, 100)}`);
            if (res.status === 503 && attempt + 1 < maxAttempts) {
              await new Promise((r) => setTimeout(r, 600));
              continue;
            }
            break;
          }

          const data = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const text =
            data.candidates?.[0]?.content?.parts
              ?.map((p) => p.text ?? "")
              .join("\n")
              .trim() ?? "";

          if (text) {
            return NextResponse.json(
              parseSpeakTurnJson(
                text,
                (body.userText ?? "").trim() || "(spoken)"
              )
            );
          }
          break;
        } catch (err) {
          errors.push(
            `${modelCfg.name}: ${err instanceof Error ? err.message : String(err)}`
          );
          break;
        }
      }
    }

    return NextResponse.json(
      { error: `Voice roleplay turn failed: ${errors.join(" | ")}` },
      { status: 500 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Roleplay turn failed" },
      { status: 500 }
    );
  }
}
