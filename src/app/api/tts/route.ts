import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getSupabaseServerAdminClient } from "@/lib/supabase/server";

const ALLOWED_SPAIN_VOICES = new Set([
  "es-ES-AlvaroNeural",
  "es-ES-ElviraNeural",
  "es-ES-ArnauNeural",
  "es-ES-EstrellaNeural",
]);

/**
 * Maps the app's Spain voice IDs to Gemini Studio Neural TTS voices when AZURE_SPEECH_KEY is not configured.
 */
const GEMINI_VOICE_MAP: Record<string, string> = {
  "es-ES-AlvaroNeural": "Puck", // Warm, clear male voice
  "es-ES-ElviraNeural": "Kore", // Crisp, natural female voice
  "es-ES-ArnauNeural": "Charon", // Deep, calm male voice
  "es-ES-EstrellaNeural": "Aoede", // Expressive female voice
};

const GEMINI_TTS_MODELS = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
  "gemini-2.5-flash-preview-tts",
  "gemini-3.1-flash-tts-preview",
];

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wraps raw 24kHz 16-bit mono signed-LE PCM bytes into a standard 44-byte RIFF WAV container
 * if the buffer is not already a RIFF WAV file.
 */
function ensureWavBuffer(rawBuf: Buffer, sampleRate = 24000): Buffer {
  if (
    rawBuf.length >= 4 &&
    rawBuf.subarray(0, 4).toString("ascii") === "RIFF"
  ) {
    return rawBuf;
  }
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = rawBuf.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM = 1
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, rawBuf]);
}

/**
 * Synthesizes natural human Spain Spanish (`es-ES`, Madrid accent) using Gemini Studio Neural TTS.
 */
async function synthesizeGeminiStudioEsEsWav(
  text: string,
  spainVoiceId: string,
  preferredEngine: string = "gemini-3.8-flash-tts"
): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const geminiVoiceName = GEMINI_VOICE_MAP[spainVoiceId] ?? "Puck";

  const modelChain = [
    preferredEngine,
    ...GEMINI_TTS_MODELS.filter((m) => m !== preferredEngine),
  ];

  for (const model of modelChain) {
    const t0 = Date.now();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text }],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              languageCode: "es-ES",
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: geminiVoiceName,
                },
              },
            },
          },
        }),
      });

      if (!res.ok) {
        console.warn(
          `[tts-gemini] ${model} HTTP ${res.status} in ${Date.now() - t0}ms`
        );
        continue;
      }

      const data = (await res.json()) as {
        candidates?: {
          content?: {
            parts?: {
              inlineData?: {
                mimeType?: string;
                data?: string;
              };
            }[];
          };
        }[];
      };

      const inlineData =
        data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData?.data) {
        const rawBytes = Buffer.from(inlineData.data, "base64");
        if (rawBytes.length > 100) {
          const wavBuffer = ensureWavBuffer(rawBytes, 24000);
          console.log(
            `[tts-gemini] ${model} (${geminiVoiceName}, es-ES) OK in ${
              Date.now() - t0
            }ms (${wavBuffer.length} bytes)`
          );
          return wavBuffer;
        }
      }
    } catch (err) {
      console.warn(
        `[tts-gemini] ${model} failed in ${Date.now() - t0}ms:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return null;
}

/**
 * Splits text > 180 chars on sentence boundaries for emergency fallback synthesis.
 */
function splitIntoChunks(text: string, maxLen = 180): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.split(/(?<=[.!?¡¿,;])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).trim().length <= maxLen) {
      current = (current + " " + s).trim();
    } else {
      if (current) chunks.push(current);
      current = s.slice(0, maxLen);
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
}

async function synthesizeFallbackEsEsMp3(text: string): Promise<Buffer | null> {
  try {
    const chunks = splitIntoChunks(text);
    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es-ES&q=${encodeURIComponent(
        chunk
      )}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      buffers.push(Buffer.from(arr));
    }
    return buffers.length > 0 ? Buffer.concat(buffers) : null;
  } catch {
    return null;
  }
}

/**
 * Server-only Spain Spanish (`es-ES` Madrid accent) Neural TTS endpoint.
 * 1. Checks local disk cache (`data/tts-cache/v3_<hash>.wav` or `.mp3`)
 * 2. Checks Supabase `tts_cache` + `deck-audio` bucket
 * 3. Synthesizes via Azure Cognitive Services Neural TTS (`es-ES-AlvaroNeural` / `es-ES-ElviraNeural`) if AZURE_SPEECH_KEY is set
 * 4. Synthesizes via Gemini Studio Neural TTS (`gemini-3.8-flash-lite-tts` / `gemini-2.5-flash-preview-tts`, `languageCode: "es-ES"`) using GEMINI_API_KEY
 * 5. Caches every generated audio file permanently per AGENTS.md.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      text?: string;
      voice?: string;
      engine?: string;
    };
    const text = (body.text ?? "").trim();
    if (!text || text.length > 600) {
      return NextResponse.json(
        { error: "Text is required and must be under 600 characters." },
        { status: 400 }
      );
    }

    const requestedVoice =
      body.voice ?? process.env.AZURE_TTS_VOICE ?? "es-ES-AlvaroNeural";
    const voice = ALLOWED_SPAIN_VOICES.has(requestedVoice)
      ? requestedVoice
      : "es-ES-AlvaroNeural";

    const engine =
      body.engine === "gemini-3.8-flash-lite-tts"
        ? "gemini-3.8-flash-lite-tts"
        : "gemini-3.8-flash-tts";

    const azureKey = process.env.AZURE_SPEECH_KEY?.trim();
    const azureRegion = process.env.AZURE_SPEECH_REGION?.trim();
    const providerTag = `v5-clean:${engine}:${voice}`;

    const hash = crypto
      .createHash("sha256")
      .update(`es-ES:${providerTag}:${text.toLowerCase()}`)
      .digest("hex");

    // 1. Check local disk cache in `data/tts-cache/`
    const cacheDir = path.join(process.cwd(), "data", "tts-cache");
    const localWavPath = path.join(cacheDir, `v5_${hash}.wav`);
    const localMp3Path = path.join(cacheDir, `v5_${hash}.mp3`);

    if (fs.existsSync(localWavPath)) {
      const cachedBytes = fs.readFileSync(localWavPath);
      return new NextResponse(cachedBytes, {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "X-TTS-Cache": "HIT-LOCAL-WAV",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    if (fs.existsSync(localMp3Path)) {
      const cachedBytes = fs.readFileSync(localMp3Path);
      return new NextResponse(cachedBytes, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "X-TTS-Cache": "HIT-LOCAL-MP3",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // 2. Check Supabase `tts_cache` table if configured
    const supabase = getSupabaseServerAdminClient();
    if (supabase) {
      const { data: cachedRow } = await supabase
        .from("tts_cache")
        .select("storage_path")
        .eq("hash", hash)
        .maybeSingle();

      if (cachedRow?.storage_path) {
        const { data: fileBlob } = await supabase.storage
          .from("deck-audio")
          .download(cachedRow.storage_path);
        if (fileBlob) {
          const arrayBuffer = await fileBlob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const isWav = cachedRow.storage_path.endsWith(".wav");
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(isWav ? localWavPath : localMp3Path, buffer);
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "Content-Type": isWav ? "audio/wav" : "audio/mpeg",
              "X-TTS-Cache": "HIT-SUPABASE",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }
      }
    }

    let audioBuffer: Buffer | null = null;
    let contentType = "audio/wav";
    let sourceHeader = "GEMINI-STUDIO-ES-ES";

    // 3. Synthesize with Azure Speech Neural TTS (`es-ES`) when configured
    if (azureKey && azureRegion) {
      const ssml = `<speak version='1.0' xml:lang='es-ES'><voice xml:lang='es-ES' name='${voice}'>${escapeXml(
        text
      )}</voice></speak>`;

      const ttsEndpoint = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
      const azureRes = await fetch(ttsEndpoint, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": azureKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "EspanolFast-PWA",
        },
        body: ssml,
      });

      if (azureRes.ok) {
        const audioArrayBuffer = await azureRes.arrayBuffer();
        audioBuffer = Buffer.from(audioArrayBuffer);
        contentType = "audio/mpeg";
        sourceHeader = "AZURE-NEURAL-ES-ES";
      }
    }

    // 4. Synthesize with Gemini Studio Neural TTS (`es-ES`, 24kHz WAV)
    if (!audioBuffer) {
      audioBuffer = await synthesizeGeminiStudioEsEsWav(text, voice, engine);
      contentType = "audio/wav";
      sourceHeader = `GEMINI-${engine.toUpperCase()}-ES-ES`;
    }

    // 5. Emergency fallback only if both Azure and Gemini are unreachable
    if (!audioBuffer) {
      audioBuffer = await synthesizeFallbackEsEsMp3(text);
      contentType = "audio/mpeg";
      sourceHeader = "FALLBACK-ES-ES";
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json(
        { error: "Could not synthesize es-ES audio" },
        { status: 503 }
      );
    }

    // 6. Persist to local cache & Supabase Storage + tts_cache table
    const ext = contentType === "audio/wav" ? "wav" : "mp3";
    const targetCachePath = ext === "wav" ? localWavPath : localMp3Path;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(targetCachePath, audioBuffer);
    } catch {
      // Ignore read-only filesystem errors on serverless deployments
    }

    if (supabase) {
      const storagePath = `tts-es-es/v3_${hash}.${ext}`;
      await supabase.storage
        .from("deck-audio")
        .upload(storagePath, audioBuffer, {
          contentType,
          upsert: true,
        });
      const { data: pubUrl } = supabase.storage
        .from("deck-audio")
        .getPublicUrl(storagePath);

      await supabase.from("tts_cache").upsert({
        hash,
        text,
        voice: providerTag,
        storage_path: storagePath,
        audio_url: pubUrl.publicUrl,
        char_count: text.length,
      });
    }

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "X-TTS-Cache": `MISS-${sourceHeader}`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TTS error" },
      { status: 500 }
    );
  }
}
