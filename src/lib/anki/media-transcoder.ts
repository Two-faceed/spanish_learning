/**
 * Transcodes raw MP3 bytes to Opus in the browser using Web Audio API + MediaRecorder
 * (`audio/webm;codecs=opus` or `audio/ogg;codecs=opus`) to shrink deck audio ~3-4x
 * for Supabase free-tier storage and IndexedDB offline caching.
 * Gracefully falls back to the original MP3 blob if Opus MediaRecorder is unavailable.
 */
export async function transcodeMp3ToOpusBlob(
  mp3Bytes: Uint8Array
): Promise<{ blob: Blob; mimeType: string; extension: "opus" | "mp3" }> {
  const copy = new Uint8Array(mp3Bytes.byteLength);
  copy.set(mp3Bytes);

  if (
    typeof window === "undefined" ||
    typeof MediaRecorder === "undefined" ||
    typeof AudioContext === "undefined"
  ) {
    return {
      blob: new Blob([copy], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg",
      extension: "mp3",
    };
  }

  const opusMimeCandidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
  ];
  const supportedMime = opusMimeCandidates.find((m) =>
    MediaRecorder.isTypeSupported(m)
  );

  if (!supportedMime) {
    return {
      blob: new Blob([copy], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg",
      extension: "mp3",
    };
  }

  const audioCtx = new AudioContext();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(copy.buffer.slice(0));
    const dest = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    // Speed up real-time playback slightly only if short, or play at 1x for fidelity
    source.connect(dest);

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(dest.stream, {
      mimeType: supportedMime,
      audioBitsPerSecond: 32000, // 32 kbps Opus is transparent for single-voice speech and ~4x smaller than 128 kbps MP3
    });

    const finishedPromise = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      recorder.onerror = (err) => reject(err);
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: supportedMime }));
      };
    });

    recorder.start();
    source.start(0);
    source.onended = () => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    };

    const opusBlob = await finishedPromise;
    if (opusBlob.size > 0 && opusBlob.size < copy.byteLength) {
      return {
        blob: opusBlob,
        mimeType: supportedMime,
        extension: "opus",
      };
    }
  } catch {
    // Fall back to MP3 if decoding/recording fails
  } finally {
    void audioCtx.close().catch(() => {});
  }

  return {
    blob: new Blob([copy], { type: "audio/mpeg" }),
    mimeType: "audio/mpeg",
    extension: "mp3",
  };
}
