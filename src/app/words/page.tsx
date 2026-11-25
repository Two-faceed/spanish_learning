"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Plus,
  Search,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Gender, NoteRecord } from "@/types/database";
import { offlineDb } from "@/lib/offline/db";
import { addOrPromoteWordInDeck, isLeechCard } from "@/lib/fsrs/scheduler";
import { parseWordGenderAndLemma } from "@/lib/anki/field-mapping";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import {
  extractWordAtClickPoint,
  splitBilingualExample,
  triggerWordPopup,
} from "@/components/WordSelectionPopup";

export default function WordsPage() {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [leechNoteIds, setLeechNoteIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "el" | "la" | "leech" | "promoted"
  >("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWordInput, setNewWordInput] = useState("");
  const [newMeaningInput, setNewMeaningInput] = useState("");
  const [newExampleEsInput, setNewExampleEsInput] = useState("");
  const [newExampleTrInput, setNewExampleTrInput] = useState("");
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const loadWords = useCallback(async () => {
    if (!offlineDb) return;
    const [allNotes, allCards] = await Promise.all([
      offlineDb.notes.toArray(),
      offlineDb.cards.toArray(),
    ]);
    allNotes.sort((a, b) => a.part - b.part || a.freq_rank - b.freq_rank);
    setNotes(allNotes);

    const leeches = new Set<string>();
    for (const c of allCards) {
      if (isLeechCard(c)) {
        leeches.add(c.note_id);
      }
    }
    setLeechNoteIds(leeches);
  }, []);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  const handleAddOrPromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offlineDb || !newWordInput.trim() || !newMeaningInput.trim()) return;

    const [allNotes, allCards] = await Promise.all([
      offlineDb.notes.toArray(),
      offlineDb.cards.toArray(),
    ]);

    const parsed = parseWordGenderAndLemma(newWordInput);
    const res = addOrPromoteWordInDeck(allNotes, allCards, {
      word: parsed.word,
      lemma: parsed.lemma,
      meaning: newMeaningInput.trim(),
      example_es: newExampleEsInput.trim(),
      example_tr: newExampleTrInput.trim(),
      gender: parsed.gender,
      pos: parsed.pos,
      source: "manual",
    });

    await offlineDb.notes.put(res.targetNote);
    if (!res.promotedExisting) {
      const addedCards = res.cards.filter(
        (c) => c.note_id === res.targetNote.id
      );
      await offlineDb.cards.bulkPut(addedCards);
    }

    setStatusBanner(
      res.promotedExisting
        ? `"${res.targetNote.word}" already exists in the deck — promoted to the front of your new-card queue!`
        : `Added "${res.targetNote.word}" to the front of your new-card queue!`
    );
    setNewWordInput("");
    setNewMeaningInput("");
    setNewExampleEsInput("");
    setNewExampleTrInput("");
    setShowAddForm(false);
    await loadWords();
  };

  const filteredNotes = notes.filter((n) => {
    if (filter === "el" && n.gender !== "el" && n.gender !== "los") return false;
    if (filter === "la" && n.gender !== "la" && n.gender !== "las") return false;
    if (filter === "leech" && !leechNoteIds.has(n.id)) return false;
    if (filter === "promoted" && n.freq_rank > 0 && n.source === "deck")
      return false;

    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      n.word.toLowerCase().includes(q) ||
      n.lemma.toLowerCase().includes(q) ||
      n.meaning.toLowerCase().includes(q) ||
      n.example_es.toLowerCase().includes(q)
    );
  });

  const visibleNotes = filteredNotes.slice(0, 100);

  const genderColor = (g: Gender) => {
    if (g === "el" || g === "los") return "gender-el";
    if (g === "la" || g === "las") return "gender-la";
    if (g === "el/la") return "gender-both";
    return "text-white";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            LEXICON · {notes.length.toLocaleString()} WORDS
          </div>
          <h1 className="font-display text-2xl font-extrabold text-white mt-0.5">
            Vocabulary Vault
          </h1>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="px-4 py-2.5 rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black text-xs font-extrabold inline-flex items-center gap-1.5 shadow-[0_6px_20px_rgba(255,79,23,0.3)] transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add Word</span>
        </button>
      </div>

      {statusBanner && (
        <div className="rounded-2xl bg-[#FF4F17]/15 border border-[#FF4F17]/35 p-3.5 text-xs text-orange-200 flex items-center gap-2 font-bold">
          <Sparkles className="w-4 h-4 text-[#FF4F17] shrink-0" />
          <span>{statusBanner}</span>
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={(e) => void handleAddOrPromote(e)}
          className="rounded-[28px] bg-[#181A1F] border border-white/[0.08] p-5 space-y-3"
        >
          <div className="text-xs font-bold text-white">
            Add or Promote Word to Front of Queue
          </div>
          <p className="text-[11px] text-zinc-400">
            If the word is already in the deck, it moves to the front of your new-word queue without creating a duplicate.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              required
              value={newWordInput}
              onChange={(e) => setNewWordInput(e.target.value)}
              placeholder="Spanish (e.g. el ordenador)"
              className="rounded-2xl bg-[#101216] border border-white/10 text-white px-3.5 py-2.5 text-xs"
            />
            <input
              type="text"
              required
              value={newMeaningInput}
              onChange={(e) => setNewMeaningInput(e.target.value)}
              placeholder="English (e.g. computer)"
              className="rounded-2xl bg-[#101216] border border-white/10 text-white px-3.5 py-2.5 text-xs"
            />
          </div>
          <input
            type="text"
            value={newExampleEsInput}
            onChange={(e) => setNewExampleEsInput(e.target.value)}
            placeholder="Spanish example sentence (optional)"
            className="w-full rounded-2xl bg-[#101216] border border-white/10 text-white px-3.5 py-2.5 text-xs"
          />
          <input
            type="text"
            value={newExampleTrInput}
            onChange={(e) => setNewExampleTrInput(e.target.value)}
            placeholder="English translation (optional)"
            className="w-full rounded-2xl bg-[#101216] border border-white/10 text-white px-3.5 py-2.5 text-xs"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-full bg-[#22252C] text-zinc-300 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-full bg-[#FF4F17] text-black text-xs font-extrabold"
            >
              Save to Queue
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Controls */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Spanish word, lemma, or meaning..."
            className="w-full rounded-2xl bg-[#181A1F] border border-white/[0.07] text-white pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-[#FF4F17]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { key: "all", label: "All" },
            { key: "el", label: "el (Masculine)" },
            { key: "la", label: "la (Feminine)" },
            { key: "promoted", label: "Promoted / Custom" },
            { key: "leech", label: `Leeches (${leechNoteIds.size})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                filter === tab.key
                  ? "bg-[#FF4F17] text-black border-[#FF4F17]"
                  : "bg-[#181A1F] text-zinc-400 border-white/[0.07] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Word List */}
      <div className="space-y-2.5">
        {visibleNotes.map((note) => {
          const isLeech = leechNoteIds.has(note.id);
          const splitEx = splitBilingualExample(
            note.example_es,
            note.example_tr
          );

          const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
            const targetEl = e.target as HTMLElement | null;
            if (targetEl?.closest("button")) return;

            // If user clicked directly on the headword badge, open the full headword (e.g. "la hoja")
            const headwordEl = targetEl?.closest("[data-headword='true']");
            if (headwordEl) {
              triggerWordPopup({
                word: note.word,
                rect: headwordEl.getBoundingClientRect(),
                contextSentence: splitEx.es || note.word,
              });
              return;
            }

            // If user clicked a specific word inside the example sentence or meaning, open that word
            const clickedWord = extractWordAtClickPoint(e.clientX, e.clientY);
            if (clickedWord) {
              triggerWordPopup(clickedWord);
              return;
            }

            // Otherwise open the card's main headword
            triggerWordPopup({
              word: note.word,
              rect: e.currentTarget.getBoundingClientRect(),
              contextSentence: splitEx.es || note.word,
            });
          };

          return (
            <div
              key={note.id}
              onClick={handleCardClick}
              className="rounded-2xl bg-[#181A1F] border border-white/[0.06] hover:border-[#FF4F17]/40 p-3.5 flex items-start justify-between gap-2.5 cursor-pointer transition"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center flex-wrap gap-1.5">
                  <span className="text-[10px] font-mono text-zinc-500">
                    #{note.freq_rank}
                  </span>
                  <span
                    data-headword="true"
                    className={`font-display font-extrabold text-sm underline decoration-white/20 underline-offset-2 ${genderColor(
                      note.gender
                    )}`}
                  >
                    {note.word}
                  </span>
                  <span
                    data-headword="true"
                    className="font-mono text-[11px] font-semibold text-[#FF4F17]/85"
                  >
                    [{toMadridEnglishPhonetics(note.word)}]
                  </span>
                  {note.pos && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#22252C] text-zinc-300 font-mono">
                      {note.pos}
                    </span>
                  )}
                  {isLeech && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                      <AlertTriangle className="w-3 h-3" />
                      Leech
                    </span>
                  )}
                  <span className="text-xs font-bold text-zinc-300">
                    — {note.meaning}
                  </span>
                </div>

                {splitEx.es && (
                  <p className="text-xs text-zinc-400 leading-snug">
                    {splitEx.es}
                    {splitEx.tr && (
                      <span className="text-zinc-500 ml-1">
                        ({splitEx.tr})
                      </span>
                    )}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void playSpanishAudio({
                    text: note.word,
                    audioFilename:
                      note.audio_word_url ?? note.deck_audio_word_url,
                    audioSource: note.audio_source,
                  });
                }}
                className="shrink-0 w-9 h-9 rounded-xl bg-[#22252C] hover:bg-[#FF4F17] text-[#FF4F17] hover:text-black border border-white/[0.07] flex items-center justify-center transition"
                title="Play es-ES audio"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {filteredNotes.length > 100 && (
          <p className="text-center text-xs text-zinc-500 py-2">
            Showing first 100 of {filteredNotes.length.toLocaleString()} matching words.
          </p>
        )}
      </div>
    </div>
  );
}
