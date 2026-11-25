import { describe, expect, it } from "vitest";
import {
  MADRID_ROLEPLAY_SCENARIOS,
  parseSpeakSummaryJson,
  parseSpeakTurnJson,
} from "@/lib/speak/scenarios";

describe("Phase 5 — Madrid Voice Roleplay Parsers & Scenarios", () => {
  it("includes all core Madrid life, business, and city boss scenarios", () => {
    expect(MADRID_ROLEPLAY_SCENARIOS.length).toBeGreaterThanOrEqual(9);
    const ids = MADRID_ROLEPLAY_SCENARIOS.map((s) => s.id);
    expect(ids).toContain("madrid-cafe");
    expect(ids).toContain("madrid-bank");
    expect(ids).toContain("madrid-nie");
    expect(ids).toContain("madrid-gestoria");
    expect(ids).toContain("biz-powerbank-pitch");
  });

  it("parses roleplay turn JSON safely", () => {
    const raw = `\`\`\`json
    {
      "userTranscript": "Hola, quiero un café con leche.",
      "replyEs": "¡Perfecto! ¿Lo quieres en taza o en vaso?",
      "replyEn": "Perfect! Do you want it in a cup or a glass?",
      "quickHintEn": "Say: En taza, por favor."
    }
    \`\`\``;
    const res = parseSpeakTurnJson(raw, "");
    expect(res.userTranscript).toContain("café con leche");
    expect(res.replyEs).toContain("taza");
    expect(res.quickHintEn).toContain("En taza");
  });

  it("parses post-call summary JSON with clamped score, 3 corrections, and 3 phrases", () => {
    const raw = JSON.stringify({
      score: 88,
      summaryEn: "Great job ordering politely in Madrid!",
      corrections: [
        {
          category: "gender",
          wrong: "un agua fría",
          correct: "un vaso de agua fría",
          explanation: "Use un vaso de agua when ordering.",
        },
      ],
      usefulPhrases: [
        { es: "¿Me cobras cuando puedas?", en: "Can you charge me when you can?" },
        { es: "Ponme una tostada con tomate.", en: "Give me toast with tomato." },
        { es: "¡Hasta luego!", en: "See you later!" },
      ],
    });

    const summary = parseSpeakSummaryJson(raw);
    expect(summary.score).toBe(88);
    expect(summary.corrections).toHaveLength(1);
    expect(summary.usefulPhrases).toHaveLength(3);
  });
});
