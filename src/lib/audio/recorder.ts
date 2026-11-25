/**
 * Browser 16 kHz mono 16-bit PCM WAV recorder + waveform peak extractor.
 * Works natively with Web Audio API (zero external libraries) and outputs WAV
 * directly compatible with both Azure Speech Pronunciation Assessment and Gemini Audio.
 */

export interface RecordedAudioResult {
  wavBlob: Blob;
  wavBase64: string;
  objectUrl: string;
  durationMs: number;
  waveformPeaks: number[]; // Normalized 0..1 array (~48 bars)
}

export interface ActiveWavRecorder {
  stop: () => Promise<RecordedAudioResult>;
  cancel: () => void;
}

const TARGET_SAMPLE_RATE = 16000;

function downsampleTo16k(
  input: Float32Array,
  inputSampleRate: number
): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return input;
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : 0;
  }
  return result;
}

function encodeWav16BitMono(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function extractWaveformPeaks(
  samples: Float32Array,
  bars = 48
): number[] {
  if (samples.length === 0) return Array(bars).fill(0.08);
  const chunkSize = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = [];
  let maxPeak = 0.01;

  for (let i = 0; i < bars; i++) {
    const start = i * chunkSize;
    const end = Math.min(samples.length, start + chunkSize);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > peak) peak = abs;
    }
    if (peak > maxPeak) maxPeak = peak;
    peaks.push(peak);
  }

  return peaks.map((p) => Math.max(0.08, Math.min(1, p / maxPeak)));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === "string" ? reader.result : "";
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function startWavRecording(
  onLiveLevel?: (level0to1: number) => void
): Promise<ActiveWavRecorder> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error("Microphone recording is not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AudioCtx();
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);

  const chunks: Float32Array[] = [];
  const startedAt = Date.now();
  let stopped = false;

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const channelData = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(channelData));

    if (onLiveLevel) {
      let sumSq = 0;
      for (let i = 0; i < channelData.length; i++) {
        sumSq += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sumSq / channelData.length);
      onLiveLevel(Math.min(1, rms * 4.5));
    }
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);

  const cleanup = () => {
    stopped = true;
    try {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void audioCtx.close();
    } catch {
      // Ignore cleanup errors
    }
  };

  return {
    cancel: () => {
      cleanup();
    },
    stop: async () => {
      const durationMs = Math.max(200, Date.now() - startedAt);
      const nativeRate = audioCtx.sampleRate;
      cleanup();

      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }

      const samples16k = downsampleTo16k(merged, nativeRate);
      const wavBlob = encodeWav16BitMono(samples16k, TARGET_SAMPLE_RATE);
      const wavBase64 = await blobToBase64(wavBlob);
      const objectUrl = URL.createObjectURL(wavBlob);
      const waveformPeaks = extractWaveformPeaks(samples16k, 48);

      return {
        wavBlob,
        wavBase64,
        objectUrl,
        durationMs,
        waveformPeaks,
      };
    },
  };
}
