/**
 * Server-only Gemini Flash JSON client with automatic multi-model failover.
 * Never import this file in client components — API keys live strictly in server env vars.
 */

export interface GeminiFlashJsonRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

const FAST_FLASH_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash",
];

export async function callGeminiFlashJson({
  systemPrompt,
  userPrompt,
  temperature = 0.4,
  maxOutputTokens,
}: GeminiFlashJsonRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables");
  }

  const envModel = process.env.GEMINI_FLASH_MODEL?.trim();
  const modelChain = Array.from(
    new Set([
      ...FAST_FLASH_MODELS,
      ...(envModel && envModel !== "gemini-3.8-flash" ? [envModel] : []),
    ])
  );

  const errors: string[] = [];
  let saw503 = false;
  let saw429 = false;

  // Up to 2 passes so momentary Google free-tier 503 spikes recover automatically
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) {
      await new Promise((r) => setTimeout(r, 900));
    }

    for (const model of modelChain) {
      // On second pass, only retry the fast lite models that had 503
      if (pass > 0 && !model.includes("lite")) continue;

      const t0 = Date.now();
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature,
              responseMimeType: "application/json",
              ...(typeof maxOutputTokens === "number"
                ? { maxOutputTokens }
                : {}),
            },
          }),
        });

        if (!response.ok) {
          if (response.status === 503) saw503 = true;
          if (response.status === 429) saw429 = true;
          const errBody = await response.text().catch(() => "");
          console.warn(
            `[gemini] ${model} HTTP ${response.status} in ${Date.now() - t0}ms`
          );
          errors.push(`${model} (${response.status}): ${errBody.slice(0, 80)}`);
          continue;
        }

        const data = (await response.json()) as {
          candidates?: {
            content?: {
              parts?: { text?: string }[];
            };
          }[];
        };

        const text =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("\n")
            .trim() ?? "";

        if (text) {
          console.log(
            `[gemini] ${model} OK in ${Date.now() - t0}ms (${text.length} chars)`
          );
          return text;
        }
        errors.push(`${model}: empty response`);
      } catch (err) {
        console.warn(
          `[gemini] ${model} failed in ${Date.now() - t0}ms:`,
          err instanceof Error ? err.message : String(err)
        );
        errors.push(
          `${model}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  console.error("[gemini] All attempts failed:", errors.join(" | "));
  if (saw503) {
    throw new Error(
      "Google Gemini is experiencing a momentary high-demand spike (503). Please tap the button again in a few seconds."
    );
  }
  if (saw429) {
    throw new Error(
      "Gemini free-tier rate limit reached (429). Wait ~30 seconds or enable pay-as-you-go billing on your Google AI Studio key."
    );
  }
  throw new Error("Could not reach Gemini AI right now. Please try again.");
}
