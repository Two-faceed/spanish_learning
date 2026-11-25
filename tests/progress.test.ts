import { describe, expect, it } from "vitest";
import {
  CEFR_LEVEL_CHECK_QUESTIONS,
  estimateCefrFromScore,
  estimateMonthlyCost,
} from "@/lib/telemetry/cost-meter";

describe("Phase 5.4 — Progress Dashboard, CEFR Estimate & Monthly Cost Meter", () => {
  it("estimates CEFR level accurately across score bands", () => {
    expect(CEFR_LEVEL_CHECK_QUESTIONS).toHaveLength(8);
    expect(estimateCefrFromScore(8, 8).cefr).toBe("B1");
    expect(estimateCefrFromScore(6, 8).cefr).toBe("A2+");
    expect(estimateCefrFromScore(5, 8).cefr).toBe("A2");
    expect(estimateCefrFromScore(4, 8).cefr).toBe("A1+");
    expect(estimateCefrFromScore(2, 8).cefr).toBe("A1");
    expect(estimateCefrFromScore(0, 8).cefr).toBe("Pre-A1");
  });

  it("calculates monthly cost under the $30 hard cap with $20 warning threshold", () => {
    const safe = estimateMonthlyCost({
      monthKey: "2026-11",
      voiceMinutesThisMonth: 120, // ~$2.76
      pronAttemptsThisMonth: 50, // under 5h free tier -> $0
      aiLessonsAndChatsThisMonth: 100, // ~$0.80
    });
    expect(safe.totalUsd).toBeLessThan(10);
    expect(safe.status).toBe("safe");

    const warn = estimateMonthlyCost({
      monthKey: "2026-11",
      voiceMinutesThisMonth: 950, // ~$21.85
      pronAttemptsThisMonth: 50,
      aiLessonsAndChatsThisMonth: 100,
    });
    expect(warn.totalUsd).toBeGreaterThanOrEqual(20);
    expect(warn.status).toBe("warning");
  });
});
