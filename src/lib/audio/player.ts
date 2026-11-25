import {
  cacheAudioBlobOffline,
  getCachedAudioBlobOffline,
} from "@/lib/offline/sync-manager";

let currentAudio: HTMLAudioElement | null = null;
const AUDIO_SPEED_STORAGE_KEY = "espanol_fast_audio_speed";
const TTS_ENGINE_STORAGE_KEY = "espanol_fast_tts_engine_v1";
const TTS_VOICE_STORAGE_KEY = "espanol_fast_tts_voice_v1";

export type AudioPlaybackSpeed = 0.6 | 0.8 | 1.0;
export type TtsEngineId = "gemini-3.8-flash-tts" | "gemini-3.8-flash-lite-tts";

export function getTtsEngine(): TtsEngineId {
  if (typeof window === "undefined") return "gemini-3.8-flash-tts";
  const raw = window.localStorage.getItem(TTS_ENGINE_STORAGE_KEY);
  if (
    raw === "gemini-3.8-flash-tts" ||
    raw === "gemini-3.8-flash-lite-tts"
  ) {
    return raw;
  }
  return "gemini-3.8-flash-tts";
}

export function setTtsEngine(engine: TtsEngineId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TTS_ENGINE_STORAGE_KEY, engine);
}

export function getPreferredTtsVoice(): string {
  if (typeof window === "undefined") return "es-ES-AlvaroNeural";
  return (
    window.localStorage.getItem(TTS_VOICE_STORAGE_KEY) || "es-ES-AlvaroNeural"
  );
}

export function setPreferredTtsVoice(voice: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, voice);
}

export function getAudioPlaybackSpeed(): AudioPlaybackSpeed {
  if (typeof window === "undefined") return 1.0;
  const raw = window.localStorage.getItem(AUDIO_SPEED_STORAGE_KEY);
  const parsed = Number(raw);
  if (parsed === 0.6 || parsed === 0.8 || parsed === 1.0) {
    return parsed;
  }
  return 1.0;
}

export function setAudioPlaybackSpeed(speed: AudioPlaybackSpeed): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUDIO_SPEED_STORAGE_KEY, String(speed));
  if (currentAudio) {
    currentAudio.playbackRate = speed;
  }
}

function stopCurrentPlayback() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

async function playBlob(blob: Blob): Promise<void> {
  stopCurrentPlayback();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const speed = getAudioPlaybackSpeed();
  audio.playbackRate = speed;
  audio.preservesPitch = true;
  currentAudio = audio;
  try {
    await audio.play();
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function getLoadedBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return existing;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(window.speechSynthesis.getVoices());
    }, 600);
    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timeout);
      resolve(window.speechSynthesis.getVoices());
    };
  });
}

/**
 * Fallback Web Speech API speaker strictly forced to `es-ES` (Madrid/Spain locale)
 * when offline without a cached blob. Prefers neural/network voices (like "Google español" es-ES)
 * over macOS's robotic compact localService voices.
 */
export async function speakWithBrowserEsEs(text: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  stopCurrentPlayback();
  const voices = await getLoadedBrowserVoices();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-ES";
  utterance.rate = Math.max(0.5, getAudioPlaybackSpeed() * 0.96);

  const isEsEs = (v: SpeechSynthesisVoice) =>
    v.lang.toLowerCase().replace("_", "-") === "es-es";

  const spainVoice =
    voices.find(
      (v) =>
        isEsEs(v) &&
        (v.name.includes("Google") ||
          v.name.includes("Natural") ||
          v.name.includes("Neural") ||
          v.name.includes("Alvaro") ||
          v.name.includes("Elvira") ||
          !v.localService)
    ) ??
    voices.find(isEsEs) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("es"));

  if (spainVoice) {
    utterance.voice = spainVoice;
  }

  return new Promise((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Plays Spanish audio (`es-ES`) using:
 * 1. Offline IndexedDB cached blob (`audioFilename` or `tts:es-ES:<text>`)
 * 2. Local/Supabase deck audio file if `audioSource === 'deck'` and `audioFilename` is present
 * 3. Server `/api/tts` (Azure Neural `es-ES` or cached server `es-ES` neural MP3)
 * 4. Browser `es-ES` SpeechSynthesis fallback only if completely offline with no cached MP3
 */
export async function playSpanishAudio(params: {
  text: string;
  audioFilename?: string | null;
  audioSource?: "deck" | "es-ES TTS";
  voice?: string;
  engine?: TtsEngineId;
  preferDeckTrack?: boolean;
}): Promise<{
  sourceUsed: "indexeddb" | "deck" | "neural-es-ES" | "browser-es-ES";
}> {
  const cleanText = params.text.trim();
  const voice = params.voice ?? getPreferredTtsVoice();
  const engine = params.engine ?? getTtsEngine();
  const ttsCacheKey = `tts:v5:${engine}:${voice}:${cleanText.toLowerCase()}`;
  const useDeckAudio =
    (params.audioSource === "deck" || params.preferDeckTrack) &&
    Boolean(params.audioFilename);

  // 1. Check IndexedDB for deck audio blob
  if (useDeckAudio && params.audioFilename) {
    const cachedDeckBlob = await getCachedAudioBlobOffline(
      params.audioFilename
    );
    if (cachedDeckBlob) {
      await playBlob(cachedDeckBlob);
      return { sourceUsed: "indexeddb" };
    }
  }

  // 2. Check IndexedDB for cached es-ES TTS blob
  const cachedTtsBlob = await getCachedAudioBlobOffline(ttsCacheKey);
  if (cachedTtsBlob) {
    await playBlob(cachedTtsBlob);
    return { sourceUsed: "indexeddb" };
  }

  // 3. If online and deck audio is requested, fetch from /api/local-deck media endpoint and cache in IndexedDB
  if (
    useDeckAudio &&
    params.audioFilename &&
    typeof navigator !== "undefined" &&
    navigator.onLine
  ) {
    try {
      const res = await fetch(
        `/api/local-deck?action=media&filename=${encodeURIComponent(
          params.audioFilename
        )}`
      );
      if (res.ok) {
        const blob = await res.blob();
        await cacheAudioBlobOffline(params.audioFilename, blob, blob.type);
        await playBlob(blob);
        return { sourceUsed: "deck" };
      }
    } catch {
      // Fall through to TTS
    }
  }

  // 4. Request cached/generated Spain es-ES Neural TTS from server route `/api/tts`
  if (cleanText && typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          voice,
          engine,
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) {
          await cacheAudioBlobOffline(ttsCacheKey, blob, blob.type);
          await playBlob(blob);
          return { sourceUsed: "neural-es-ES" };
        }
      }
    } catch {
      // Fall through to browser es-ES voice
    }
  }

  // 5. Offline fallback: browser es-ES voice
  if (cleanText) {
    await speakWithBrowserEsEs(cleanText);
  }
  return { sourceUsed: "browser-es-ES" };
}

/**
 * Pre-fetches and caches BOTH word audio AND example sentence neural es-ES audio in IndexedDB
 * for a batch of cards so both words and sentences play with natural es-ES audio offline!
 */
export async function prefetchQueueAudioForOffline(
  items: {
    word: string;
    example_es: string;
    audio_word_url: string | null;
    audio_example_url: string | null;
    deck_audio_word_url: string | null;
    audio_source: "deck" | "es-ES TTS";
  }[],
  onProgress?: (done: number, total: number) => void,
  voice: string = "es-ES-AlvaroNeural"
): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;

  let cachedCount = 0;
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const wordFilename = item.audio_word_url ?? item.deck_audio_word_url;

    // 1. Cache word audio
    if (item.audio_source === "deck" && wordFilename) {
      const existing = await getCachedAudioBlobOffline(wordFilename);
      if (!existing) {
        try {
          const res = await fetch(
            `/api/local-deck?action=media&filename=${encodeURIComponent(
              wordFilename
            )}`
          );
          if (res.ok) {
            const blob = await res.blob();
            await cacheAudioBlobOffline(wordFilename, blob, blob.type);
            cachedCount++;
          }
        } catch {
          // Ignore individual fetch errors
        }
      } else {
        cachedCount++;
      }
    }

    // 2. Cache sentence audio (from deck if present, or synthesize es-ES studio neural audio via /api/tts)
    if (item.example_es) {
      const engine = getTtsEngine();
      const sentCacheKey = `tts:v5:${engine}:${voice}:${item.example_es.trim().toLowerCase()}`;
      const existingSent = await getCachedAudioBlobOffline(sentCacheKey);
      if (!existingSent) {
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: item.example_es.trim(),
              voice,
              engine,
            }),
          });
          if (res.ok) {
            const blob = await res.blob();
            if (blob.size > 0) {
              await cacheAudioBlobOffline(sentCacheKey, blob, blob.type);
              cachedCount++;
            }
          }
        } catch {
          // Ignore individual fetch errors
        }
      } else {
        cachedCount++;
      }
    }

    onProgress?.(i + 1, total);
  }

  return cachedCount;
}
