"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronsRight,
  FileArchive,
  FolderOpen,
  Headphones,
  Loader2,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  extractMediaBytesFromApkg,
  mergeMultiPartResults,
  parseApkgBuffer,
  ParsedAnkiNote,
  ParsedApkgResult,
} from "@/lib/anki/parser";
import { FIELD_ROLE_LABELS } from "@/lib/anki/field-mapping";
import {
  AudioSource,
  FieldMappingConfig,
  MappedFieldRole,
} from "@/types/database";
import {
  cacheAudioBlobOffline,
  saveImportedDeckLocally,
} from "@/lib/offline/sync-manager";
import { getOrInitSettings, offlineDb } from "@/lib/offline/db";
import { transcodeMp3ToOpusBlob } from "@/lib/anki/media-transcoder";
import { playSpanishAudio } from "@/lib/audio/player";

interface LocalDataFile {
  name: string;
  sizeBytes: number;
  sizeMb: number;
  recommended: boolean;
}

export default function ImportPage() {
  const router = useRouter();
  const [localFiles, setLocalFiles] = useState<LocalDataFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<string | null>(null);
  const [parsedResults, setParsedResults] = useState<ParsedApkgResult[]>([]);
  const [browserApkgBuffers, setBrowserApkgBuffers] = useState<
    Record<string, Uint8Array>
  >({});
  const [fieldMappings, setFieldMappings] = useState<
    Record<string, FieldMappingConfig>
  >({});
  const [audioSourceChoice, setAudioSourceChoice] =
    useState<AudioSource>("deck");
  const [importReviewHistory, setImportReviewHistory] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    phase: string;
    done: number;
    total: number;
  } | null>(null);
  const [importSummary, setImportSummary] = useState<{
    insertedCount: number;
    updatedCount: number;
    totalNotes: number;
    cachedAudioClips: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/local-deck?action=list")
      .then((r) => r.json())
      .then((data: { files?: LocalDataFile[] }) => {
        if (data.files) setLocalFiles(data.files);
      })
      .catch(() => {});
  }, []);

  const applyParsedResults = (results: ParsedApkgResult[]) => {
    setParsedResults(results);
    const mappings: Record<string, FieldMappingConfig> = {};
    for (const res of results) {
      for (const nt of res.noteTypes) {
        mappings[nt.name] = nt.suggestedMapping;
      }
    }
    setFieldMappings(mappings);

    const isTop5000 = results.some((r) => r.fileName.includes("Top_5000"));
    setAudioSourceChoice(isTop5000 ? "deck" : "es-ES TTS");
    setImportSummary(null);
  };

  const handleLoadFromDataFolder = async (fileName: string) => {
    setParsing(true);
    setParseStatus(`Parsing ${fileName} from data/...`);
    try {
      const res = await fetch(
        `/api/local-deck?action=parse&file=${encodeURIComponent(fileName)}`
      );
      if (!res.ok) {
        throw new Error("Could not parse deck file from data/");
      }
      const parsed = (await res.json()) as ParsedApkgResult;
      applyParsedResults([parsed]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to parse deck");
    } finally {
      setParsing(false);
      setParseStatus(null);
    }
  };

  const handleBrowserFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setParsing(true);
    const results: ParsedApkgResult[] = [];
    const buffers: Record<string, Uint8Array> = {};

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setParseStatus(
          `Unzipping & reading SQLite in browser (${i + 1}/${fileList.length}): ${file.name}...`
        );
        const arrayBuf = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuf);
        buffers[file.name] = uint8;

        const parsed = await parseApkgBuffer(uint8, {
          fileName: file.name,
        });
        results.push(parsed);
      }
      setBrowserApkgBuffers(buffers);
      applyParsedResults(results);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to parse .apkg in browser"
      );
    } finally {
      setParsing(false);
      setParseStatus(null);
    }
  };

  const handleFieldRoleChange = (
    modelName: string,
    fieldName: string,
    newRole: MappedFieldRole
  ) => {
    setFieldMappings((prev) => ({
      ...prev,
      [modelName]: {
        ...(prev[modelName] ?? {}),
        [fieldName]: newRole,
      },
    }));
  };

  const handlePlayAccentSample = async (
    sample: ParsedApkgResult["accentSamples"][0],
    fileName: string
  ) => {
    const localBuf = browserApkgBuffers[fileName];
    if (localBuf && sample.wordAudioZipKey) {
      const mp3Bytes = extractMediaBytesFromApkg(
        localBuf,
        sample.wordAudioZipKey
      );
      if (mp3Bytes) {
        const copy = new Uint8Array(mp3Bytes.byteLength);
        copy.set(mp3Bytes);
        const blob = new Blob([copy], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await audio.play();
        return;
      }
    }

    await playSpanishAudio({
      text: sample.noteWord,
      audioFilename: sample.wordAudioFilename,
      audioSource: "deck",
      preferDeckTrack: true,
    });
  };

  const handleConfirmImport = async () => {
    if (parsedResults.length === 0 || importing) return;
    setImporting(true);
    try {
      const mergedNotes: ParsedAnkiNote[] =
        parsedResults.length === 1
          ? parsedResults[0].notes
          : mergeMultiPartResults(parsedResults);

      setImportProgress({
        phase: "Saving notes & generating 4 FSRS card types...",
        done: 0,
        total: mergedNotes.length,
      });

      if (offlineDb) {
        const currentSettings = await getOrInitSettings();
        await offlineDb.settings.put({
          ...currentSettings,
          field_mappings: {
            ...currentSettings.field_mappings,
            ...fieldMappings,
          },
        });
      }

      const saveRes = await saveImportedDeckLocally(
        mergedNotes,
        audioSourceChoice,
        (done, total) => {
          setImportProgress({
            phase: "Saving notes & FSRS cards...",
            done,
            total,
          });
        }
      );

      const initialAudioWindow = mergedNotes.slice(0, 50);
      let cachedAudioClips = 0;

      for (let i = 0; i < initialAudioWindow.length; i++) {
        const note = initialAudioWindow[i];
        setImportProgress({
          phase: "Transcoding & caching initial audio batch (Opus)...",
          done: i + 1,
          total: initialAudioWindow.length,
        });

        if (note.wordAudioFilename) {
          const parentFile =
            parsedResults.find((r) => r.part === note.part)?.fileName ??
            parsedResults[0].fileName;
          const localBuf = browserApkgBuffers[parentFile];

          if (localBuf && note.wordAudioZipKey) {
            const rawMp3 = extractMediaBytesFromApkg(
              localBuf,
              note.wordAudioZipKey
            );
            if (rawMp3) {
              const { blob, mimeType } = await transcodeMp3ToOpusBlob(rawMp3);
              await cacheAudioBlobOffline(note.wordAudioFilename, blob, mimeType);
              cachedAudioClips++;
              continue;
            }
          }

          try {
            const mediaRes = await fetch(
              `/api/local-deck?action=media&filename=${encodeURIComponent(
                note.wordAudioFilename
              )}`
            );
            if (mediaRes.ok) {
              const arrBuf = await mediaRes.arrayBuffer();
              const { blob, mimeType } = await transcodeMp3ToOpusBlob(
                new Uint8Array(arrBuf)
              );
              await cacheAudioBlobOffline(note.wordAudioFilename, blob, mimeType);
              cachedAudioClips++;
            }
          } catch {
            // Continue smoothly if offline
          }
        }
      }

      setImportSummary({
        insertedCount: saveRes.insertedCount,
        updatedCount: saveRes.updatedCount,
        totalNotes: saveRes.totalNotes,
        cachedAudioClips,
      });
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const primaryResult = parsedResults[0] ?? null;
  const totalParsedNotes = parsedResults.reduce(
    (sum, r) => sum + r.notes.length,
    0
  );

  return (
    <div className="space-y-4">
      <div className="pt-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
          DECK ENGINE · ES-ES
        </div>
        <h1 className="font-display text-2xl font-extrabold text-white mt-0.5">
          Anki Deck Importer
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Browser <code className="font-mono">.apkg</code> parser with field mapping, Spain (<code className="font-mono">θ</code>) accent check, and Opus audio caching.
        </p>
      </div>

      {/* Step 1: Select Deck from data/ or Browser File Input */}
      <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-5 space-y-3.5">
        <div className="flex items-center gap-2 text-xs font-bold text-[#FF4F17] uppercase tracking-wider">
          <FolderOpen className="w-4 h-4" />
          <span>1. Choose Deck Package (.apkg)</span>
        </div>

        {localFiles.length > 0 && (
          <div className="space-y-2.5">
            {localFiles.map((file) => (
              <div
                key={file.name}
                className={`rounded-2xl border p-3.5 flex items-center justify-between gap-2 transition ${
                  file.recommended
                    ? "bg-[#FF4F17]/10 border-[#FF4F17]/40"
                    : "bg-[#121418] border-white/[0.06]"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-white truncate">
                      {file.name}
                    </span>
                    {file.recommended && (
                      <span className="shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FF4F17] text-black">
                        es-ES Madrid
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {file.sizeMb} MB · Ready in data/
                  </div>
                </div>
                <button
                  onClick={() => void handleLoadFromDataFolder(file.name)}
                  disabled={parsing || importing}
                  className="shrink-0 px-4 py-2 rounded-full bg-[#FF4F17] hover:bg-[#FF6230] disabled:opacity-50 text-black text-xs font-extrabold transition"
                >
                  Load Deck
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-1">
          <label className="flex flex-col items-center justify-center border border-dashed border-white/15 hover:border-[#FF4F17] rounded-2xl p-5 cursor-pointer bg-[#121418] transition text-center">
            <FileArchive className="w-6 h-6 text-[#FF4F17] mb-1.5" />
            <span className="text-xs font-bold text-white">
              Or select 1–3 .apkg files from your device
            </span>
            <span className="text-[11px] text-zinc-500 mt-0.5">
              Unzips in browser with fflate + fzstd + sql.js WASM
            </span>
            <input
              type="file"
              accept=".apkg"
              multiple
              onChange={(e) => void handleBrowserFileUpload(e)}
              className="hidden"
            />
          </label>
        </div>

        {parsing && (
          <div className="rounded-2xl bg-[#FF4F17]/15 border border-[#FF4F17]/35 p-3.5 flex items-center gap-2.5 text-xs text-orange-200 font-bold">
            <Loader2 className="w-4 h-4 animate-spin text-[#FF4F17] shrink-0" />
            <span>{parseStatus ?? "Parsing Anki SQLite collection..."}</span>
          </div>
        )}
      </section>

      {/* Step 2: Field Mapping & First 5 Notes Preview */}
      {primaryResult && (
        <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-base text-white">
                2. Field Mapping ({totalParsedNotes.toLocaleString()} words)
              </h2>
              <p className="text-[11px] text-zinc-400">
                Pre-filled for{" "}
                <strong className="text-white">
                  {primaryResult.noteTypes[0]?.name}
                </strong>
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#FF4F17]/15 text-[#FF4F17] border border-[#FF4F17]/30">
              {primaryResult.totalMediaFiles.toLocaleString()} clips
            </span>
          </div>

          {primaryResult.noteTypes.map((nt) => {
            const currentMap = fieldMappings[nt.name] ?? nt.suggestedMapping;
            return (
              <div key={nt.id} className="space-y-3.5">
                <div className="grid grid-cols-1 gap-2">
                  {nt.fieldNames.map((fname) => (
                    <div
                      key={fname}
                      className="flex items-center justify-between gap-2 bg-[#121418] rounded-2xl px-3.5 py-2.5 border border-white/[0.05]"
                    >
                      <span className="text-xs font-bold text-zinc-200 truncate">
                        {fname}
                      </span>
                      <select
                        value={currentMap[fname] ?? "ignore"}
                        onChange={(e) =>
                          handleFieldRoleChange(
                            nt.name,
                            fname,
                            e.target.value as MappedFieldRole
                          )
                        }
                        className="text-xs rounded-xl border border-white/10 bg-[#181A1F] px-2.5 py-1.5 font-semibold text-white"
                      >
                        {Object.entries(FIELD_ROLE_LABELS).map(
                          ([roleKey, label]) => (
                            <option key={roleKey} value={roleKey}>
                              {label}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  ))}
                </div>

                {/* First 5 Notes Preview */}
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    First 5 Notes Preview
                  </div>
                  <div className="space-y-2">
                    {primaryResult.notes.slice(0, 5).map((n) => (
                      <div
                        key={n.anki_guid}
                        className="rounded-2xl bg-[#121418] border border-white/[0.05] p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-mono text-[10px] text-zinc-500 mr-1.5">
                              #{n.freq_rank}
                            </span>
                            <span className="font-extrabold text-white">
                              {n.word}
                            </span>
                            {n.gender && (
                              <span className="ml-1.5 text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 font-bold">
                                {n.gender}
                              </span>
                            )}
                            {n.pos && (
                              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 font-mono">
                                {n.pos}
                              </span>
                            )}
                          </div>
                          <span className="font-bold text-[#FF4F17]">
                            {n.meaning}
                          </span>
                        </div>
                        {n.example_es && (
                          <div className="text-[11px] text-zinc-400 truncate">
                            {n.example_es}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Step 3: Spain (Madrid es-ES) Accent Check */}
      {primaryResult && (
        <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-[#FF4F17]" />
            <h2 className="font-display font-bold text-base text-white">
              3. Spain (Madrid) Accent Check
            </h2>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Tap to play <strong>cinco, gracias, zapato, hacer</strong>. A{" "}
            <strong className="text-white">&ldquo;th&rdquo; sound (θ)</strong> means Spain Spanish (<code className="font-mono">es-ES</code>). An{" "}
            <strong className="text-white">&ldquo;s&rdquo; sound</strong> means Latin American audio and will be re-voiced with Madrid neural TTS.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {primaryResult.accentSamples.map((sample) => (
              <div
                key={sample.targetWord}
                className="rounded-2xl bg-[#121418] border border-white/[0.06] p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs text-white truncate">
                    {sample.noteWord}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Test: {sample.targetWord}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void handlePlayAccentSample(sample, primaryResult.fileName)
                  }
                  className="shrink-0 w-9 h-9 rounded-xl bg-[#FF4F17] text-black flex items-center justify-center transition hover:bg-[#FF6230]"
                  title="Play deck audio clip"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-1">
            <label
              className={`flex items-start gap-2.5 p-3.5 rounded-2xl border cursor-pointer text-xs transition ${
                audioSourceChoice === "deck"
                  ? "bg-[#FF4F17]/15 border-[#FF4F17] text-white"
                  : "bg-[#121418] border-white/[0.06] text-zinc-400"
              }`}
            >
              <input
                type="radio"
                name="audioSource"
                checked={audioSourceChoice === "deck"}
                onChange={() => setAudioSourceChoice("deck")}
                className="mt-0.5 accent-[#FF4F17]"
              />
              <div>
                <div className="font-bold text-white">
                  I hear &ldquo;th&rdquo; (θ) — Keep Spain Spanish (es-ES) Audio
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Uses the deck&apos;s native es-ES clips directly.
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-3.5 rounded-2xl border cursor-pointer text-xs transition ${
                audioSourceChoice === "es-ES TTS"
                  ? "bg-[#FF4F17]/15 border-[#FF4F17] text-white"
                  : "bg-[#121418] border-white/[0.06] text-zinc-400"
              }`}
            >
              <input
                type="radio"
                name="audioSource"
                checked={audioSourceChoice === "es-ES TTS"}
                onChange={() => setAudioSourceChoice("es-ES TTS")}
                className="mt-0.5 accent-[#FF4F17]"
              />
              <div>
                <div className="font-bold text-white">
                  I hear &ldquo;s&rdquo; (seseo) — Regenerate with Madrid (es-ES) Neural Voice
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Re-voices with cached es-ES neural TTS and keeps original as secondary track.
                </div>
              </div>
            </label>
          </div>
        </section>
      )}

      {/* Step 4: Confirm & Import */}
      {primaryResult && (
        <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-5 space-y-4">
          <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={importReviewHistory}
              onChange={(e) => setImportReviewHistory(e.target.checked)}
              className="rounded accent-[#FF4F17]"
            />
            <span>
              Import existing Anki review history (unchecked = fresh FSRS start)
            </span>
          </label>

          <button
            onClick={() => void handleConfirmImport()}
            disabled={importing}
            className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] disabled:opacity-60 text-black font-extrabold text-sm py-2 pl-6 pr-2 flex items-center justify-between shadow-[0_10px_30px_rgba(255,79,23,0.35)] transition"
          >
            <span>
              {importing
                ? "Importing Deck into FSRS..."
                : `Import ${totalParsedNotes.toLocaleString()} Words`}
            </span>
            <span className="w-10 h-10 rounded-full bg-[#0D0E11] text-[#FF4F17] flex items-center justify-center shrink-0">
              {importing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ChevronsRight className="w-5 h-5" />
              )}
            </span>
          </button>

          {importProgress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-zinc-300">
                <span>{importProgress.phase}</span>
                <span>
                  {importProgress.done} / {importProgress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-[#121418] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FF4F17] transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (importProgress.done /
                        Math.max(1, importProgress.total)) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {importSummary && (
            <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/35 p-4 space-y-3 text-xs text-emerald-200">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Import Complete!</span>
              </div>
              <p>
                <strong>{importSummary.insertedCount.toLocaleString()}</strong> new notes added,{" "}
                <strong>{importSummary.updatedCount.toLocaleString()}</strong> updated idempotently (total:{" "}
                <strong>{importSummary.totalNotes.toLocaleString()}</strong> words).{" "}
                <strong>{importSummary.cachedAudioClips}</strong> audio clips cached for offline use.
              </p>
              <button
                onClick={() => router.push("/review")}
                className="w-full py-3 px-4 rounded-full bg-[#FF4F17] text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>Start Reviewing Now</span>
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
