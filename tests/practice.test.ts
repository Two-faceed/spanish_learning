import { describe, expect, it } from "vitest";
import {
  computeCharDiff,
  parseJournalCorrectionJson,
  SPAIN_CONJUGATION_VERBS,
} from "@/lib/practice/drills";

describe("Phase 5.3 — Practice Lab (Dictation, Vosotros Verbs & Writing Journal)", () => {
  it("computes character-level diff accurately for exact and near-exact Spanish dictation", () => {
    const exact = computeCharDiff("Ponme un café.", "Ponme un café.");
    expect(exact.exactMatch).toBe(true);
    expect(exact.accuracyPct).toBe(100);

    const partial = computeCharDiff("Ponme un café.", "Ponme cafe");
    expect(partial.exactMatch).toBe(false);
    expect(partial.accuracyPct).toBeGreaterThan(50);
    expect(partial.segments.some((s) => s.status === "missing")).toBe(true);
  });

  it("includes Spain vosotros conjugations across all tenses", () => {
    const ser = SPAIN_CONJUGATION_VERBS.find((v) => v.infinitive === "ser");
    const hacer = SPAIN_CONJUGATION_VERBS.find((v) => v.infinitive === "hacer");
    expect(ser?.forms.present[4]).toBe("sois");
    expect(ser?.forms.present_perfect[4]).toBe("habéis sido");
    expect(hacer?.forms.present[4]).toBe("hacéis");
    expect(hacer?.forms.present_perfect[4]).toBe("habéis hecho");
  });

  it("parses Writing Journal AI correction JSON safely", () => {
    const raw = `\`\`\`json
    {
      "score": 86,
      "correctedEs": "Hoy voy al centro de Madrid con mis amigos.",
      "feedbackEn": "Great flow! Watch the gender of 'amigos'.",
      "changes": [
        {
          "category": "prepositions",
          "wrong": "a el centro",
          "correct": "al centro",
          "explanation": "Always contract a + el into al."
        }
      ]
    }
    \`\`\``;
    const parsed = parseJournalCorrectionJson(raw, "Hoy voy a el centro");
    expect(parsed.score).toBe(86);
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].correct).toBe("al centro");
  });
});
