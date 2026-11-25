import { NextRequest, NextResponse } from "next/server";
import {
  parseAzurePronunciationResponse,
  parseGeminiPronunciationJson,
} from "@/lib/pronunciation/spain-sounds";

export const runtime = "nodejs";
export const maxDuration = 30;

async function assessWithAzureSpeech(
  wavBuffer: Buffer,
  referenceText: string,
  azureKey: string,
  azureRegion: string
) {
  const assessmentConfig = {
    ReferenceText: referenceText,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    PhonemeAlphabet: "IPA",
    EnableMiscue: true,
  };

  const assessmentHeader = Buffer.from(
    JSON.stringify(assessmentConfig),
    "utf-8"
  ).toString("base64");

  const endpoint = `https://${encodeURIComponent(
    azureRegion
  )}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=es-ES&format=detailed`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": azureKey,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
      "Pronunciation-Assessment": assessmentHeader,
    },
    body: new Uint8Array(wavBuffer),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Azure Speech HTTP ${res.status}: ${errText.slice(0, 180)}`);
  }

  const rawJson = (await res.json()) as Record<string, unknown>;
  return parseAzurePronunciationResponse(rawJson, referenceText);
}

async function assessWithGeminiAudio(
  wavBase64: string,
  referenceText: string,
  geminiKey: string
) {
  const models: { name: string; timeoutMs: number; allowThinkingZero?: boolean }[] = [
    { name: "gemini-3.5-flash-lite", timeoutMs: 12000 },
    { name: "gemini-3.1-flash-lite", timeoutMs: 12000 },
    { name: "gemini-2.5-flash-lite", timeoutMs: 12000 },
    { name: "gemini-3.7-flash", timeoutMs: 16000, allowThinkingZero: true },
    { name: "gemini-3.8-flash", timeoutMs: 16000, allowThinkingZero: true },
    { name: "gemini-3.5-flash", timeoutMs: 16000, allowThinkingZero: true },
  ];

  const prompt = `You are a strict, encouraging Spain Spanish (es-ES, Madrid accent) pronunciation coach.
Listen carefully to the learner's audio recording and compare it against this reference Spanish text:
"${referenceText}"

Evaluate:
1. What the learner actually said ("recognizedText").
2. Overall, accuracy, fluency, and completeness scores (0 to 100). If the recording is silent or completely unrelated, give low scores (< 25).
3. Word-by-word scores for each word in the reference text, including key IPA phonemes (use Castilian IPA: r for trill rr, ɾ for single tap r, θ for z/ce/ci, x for j/ge/gi, ʝ for ll/y, β for soft b/v, and pure vowels a/e/i/o/u).
4. Scores (0 to 100) only for the Spain sound groups actually present in the sentence ("rr", "r", "theta", "j_g", "ll_y", "vowels", "b_v").
5. One short, actionable Madrid accent/rhythm tip in English ("rhythmTip", under 24 words).

Return ONLY valid JSON:
{
  "recognizedText": "what you heard",
  "overall": 82,
  "accuracy": 84,
  "fluency": 80,
  "completeness": 85,
  "words": [
    {
      "word": "cinco",
      "accuracy": 85,
      "errorType": "None",
      "phonemes": [
        {"phoneme": "θ", "accuracy": 80},
        {"phoneme": "i", "accuracy": 92}
      ]
    }
  ],
  "soundScores": {
    "theta": 80,
    "vowels": 90
  },
  "rhythmTip": "Short coaching tip in English."
}`;

  const errors: string[] = [];

  for (const modelCfg of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelCfg.name
    )}:generateContent?key=${encodeURIComponent(geminiKey)}`;

    const maxAttempts = modelCfg.name.includes("lite") ? 2 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(modelCfg.timeoutMs),
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: "audio/wav",
                      data: wavBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
              ...(modelCfg.allowThinkingZero
                ? { thinkingConfig: { thinkingBudget: 0 } }
                : {}),
            },
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          errors.push(`${modelCfg.name} (${res.status}): ${errBody.slice(0, 120)}`);
          // Retry once on transient 503 high demand
          if (res.status === 503 && attempt + 1 < maxAttempts) {
            await new Promise((r) => setTimeout(r, 700));
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
          return parseGeminiPronunciationJson(text, referenceText);
        }
        errors.push(`${modelCfg.name}: empty response`);
        break;
      } catch (err) {
        errors.push(
          `${modelCfg.name}: ${err instanceof Error ? err.message : String(err)}`
        );
        break;
      }
    }
  }

  throw new Error(`Gemini audio assessment failed: ${errors.join(" | ")}`);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      wavBase64?: string;
      referenceText?: string;
    };

    const referenceText = (body.referenceText ?? "").trim();
    const wavBase64 = (body.wavBase64 ?? "").trim();

    if (!referenceText || !wavBase64) {
      return NextResponse.json(
        { error: "Both referenceText and wavBase64 are required" },
        { status: 400 }
      );
    }

    const wavBuffer = Buffer.from(wavBase64, "base64");
    if (wavBuffer.length < 200) {
      return NextResponse.json(
        { error: "Recording is too short. Please speak clearly and try again." },
        { status: 400 }
      );
    }

    const azureKey = process.env.AZURE_SPEECH_KEY?.trim() ?? "";
    const azureRegion = process.env.AZURE_SPEECH_REGION?.trim() || "westeurope";
    const hasAzureKey =
      azureKey.length > 8 && !azureKey.toLowerCase().includes("your-");

    // 1. Primary Spec Engine: Azure AI Speech Pronunciation Assessment (es-ES, phoneme level)
    if (hasAzureKey) {
      try {
        const azureResult = await assessWithAzureSpeech(
          wavBuffer,
          referenceText,
          azureKey,
          azureRegion
        );
        return NextResponse.json(azureResult);
      } catch (azureErr) {
        console.warn("[api/pronunciation/assess] Azure fallback to Gemini:", azureErr);
      }
    }

    // 2. Seamless Fallback: Gemini Multimodal Audio Assessment (works immediately with GEMINI_API_KEY)
    const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    if (!geminiKey) {
      return NextResponse.json(
        {
          error:
            "Neither AZURE_SPEECH_KEY nor GEMINI_API_KEY is configured in .env.local",
        },
        { status: 500 }
      );
    }

    const geminiResult = await assessWithGeminiAudio(
      wavBase64,
      referenceText,
      geminiKey
    );
    return NextResponse.json(geminiResult);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to assess pronunciation",
      },
      { status: 500 }
    );
  }
}
