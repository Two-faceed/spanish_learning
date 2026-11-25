import { describe, expect, it } from "vitest";
import {
  computeWeakSoundTracker,
  mapPhonemeToSpainSoundGroup,
  parseAzurePronunciationResponse,
  parseGeminiPronunciationJson,
} from "@/lib/pronunciation/spain-sounds";
import { PronunciationAttemptRecord } from "@/types/database";

describe("Phase 3 Pronunciation Coach — Parsers & Spain Sound Tracker", () => {
  it("maps Castilian IPA phonemes to the 7 Spain sound groups", () => {
    expect(mapPhonemeToSpainSoundGroup("θ")).toBe("theta");
    expect(mapPhonemeToSpainSoundGroup("r")).toBe("rr");
    expect(mapPhonemeToSpainSoundGroup("ɾ")).toBe("r");
    expect(mapPhonemeToSpainSoundGroup("x")).toBe("j_g");
    expect(mapPhonemeToSpainSoundGroup("ʝ")).toBe("ll_y");
    expect(mapPhonemeToSpainSoundGroup("β")).toBe("b_v");
    expect(mapPhonemeToSpainSoundGroup("a")).toBe("vowels");
  });

  it("parses Azure AI Speech Pronunciation Assessment JSON with IPA phonemes", () => {
    const azurePayload = {
      DisplayText: "Cinco cervezas.",
      NBest: [
        {
          PronunciationAssessment: {
            AccuracyScore: 84,
            FluencyScore: 80,
            CompletenessScore: 100,
            PronScore: 86,
          },
          Words: [
            {
              Word: "Cinco",
              PronunciationAssessment: {
                AccuracyScore: 78,
                ErrorType: "None",
              },
              Phonemes: [
                { Phoneme: "θ", PronunciationAssessment: { AccuracyScore: 62 } },
                { Phoneme: "i", PronunciationAssessment: { AccuracyScore: 95 } },
              ],
            },
            {
              Word: "cervezas",
              PronunciationAssessment: {
                AccuracyScore: 90,
                ErrorType: "None",
              },
              Phonemes: [
                { Phoneme: "θ", PronunciationAssessment: { AccuracyScore: 74 } },
                { Phoneme: "ɾ", PronunciationAssessment: { AccuracyScore: 88 } },
                { Phoneme: "β", PronunciationAssessment: { AccuracyScore: 92 } },
              ],
            },
          ],
        },
      ],
    };

    const result = parseAzurePronunciationResponse(
      azurePayload,
      "Cinco cervezas."
    );
    expect(result.engine).toBe("azure-es-ES");
    expect(result.overall).toBe(86);
    expect(result.words).toHaveLength(2);
    expect(result.soundScores.theta).toBe(68);
    expect(result.soundScores.r).toBe(88);
    expect(result.soundScores.b_v).toBe(92);
    expect(result.rhythmTip).toContain("Castilian Z");
  });

  it("parses Gemini multimodal audio pronunciation JSON safely even with fenced markdown", () => {
    const raw = `\`\`\`json
    {
      "recognizedText": "El perro rojo corre",
      "overall": 79,
      "accuracy": 81,
      "fluency": 76,
      "completeness": 82,
      "words": [
        {
          "word": "perro",
          "accuracy": 68,
          "errorType": "Mispronunciation",
          "phonemes": [
            {"phoneme": "r", "accuracy": 58},
            {"phoneme": "o", "accuracy": 90}
          ]
        }
      ],
      "soundScores": {"rr": 58, "vowels": 90},
      "rhythmTip": "Trill the rr in perro a bit longer."
    }
    \`\`\``;

    const result = parseGeminiPronunciationJson(raw, "El perro rojo corre");
    expect(result.engine).toBe("gemini-audio-es-ES");
    expect(result.overall).toBe(79);
    expect(result.words[0].word).toBe("perro");
    expect(result.soundScores.rr).toBe(58);
    expect(result.rhythmTip).toContain("Trill");
  });

  it("ranks the 2 weakest Spain sound groups from attempt history", () => {
    const attempts: PronunciationAttemptRecord[] = [
      {
        id: "a1",
        reference_text: "Cinco perros",
        mode: "shadowing",
        engine: "azure-es-ES",
        overall: 75,
        accuracy: 75,
        fluency: 75,
        completeness: 100,
        words_phonemes: [],
        sound_scores: { rr: 52, theta: 61, vowels: 92, j_g: 84 },
        rhythm_tip: "",
        created_at: new Date().toISOString(),
      },
      {
        id: "a2",
        reference_text: "Jamón y cerezas",
        mode: "shadowing",
        engine: "azure-es-ES",
        overall: 78,
        accuracy: 78,
        fluency: 80,
        completeness: 100,
        words_phonemes: [],
        sound_scores: { rr: 60, theta: 65, vowels: 94, j_g: 55 },
        rhythm_tip: "",
        created_at: new Date().toISOString(),
      },
    ];

    const { weakestTwo, stats } = computeWeakSoundTracker(attempts);
    // Averages: rr = 56, theta = 63, j_g = 70 (69.5->70), vowels = 93
    expect(weakestTwo).toEqual(["rr", "theta"]);
    const rrStat = stats.find((s) => s.group === "rr");
    expect(rrStat?.averageScore).toBe(56);
    expect(rrStat?.attemptsCount).toBe(2);
  });
});
