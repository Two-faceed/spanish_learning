/**
 * End-to-End User Journey Simulation against the live local Next.js server (http://localhost:3000).
 * Verifies every major screen loads (HTTP 200) and exercises live AI API flows
 * so broken JSON, truncated maxOutputTokens, or dead models are caught before the user tests.
 */

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

async function checkPage(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Page ${path} returned HTTP ${res.status}`);
  }
  console.log(`  ✓ GET ${path} -> ${res.status}`);
}

async function checkPostJson(path, body, validator) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `POST ${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 180)}`
    );
  }
  if (!res.ok) {
    throw new Error(
      `POST ${path} failed (HTTP ${res.status}): ${json.error || text.slice(0, 180)}`
    );
  }
  validator(json);
  console.log(`  ✓ POST ${path} -> ${res.status} (${Date.now() - t0}ms)`);
}

async function main() {
  console.log(`\n🚀 Running E2E User Journey Simulation against ${BASE}\n`);

  console.log("1. Checking all app routes...");
  const pages = [
    "/",
    "/today",
    "/review",
    "/tutor",
    "/pronunciation",
    "/read",
    "/speak",
    "/practice",
    "/progress",
    "/words",
    "/more",
    "/settings",
  ];
  for (const p of pages) {
    await checkPage(p);
  }

  console.log("\n2. Simulating Madrid AI Chat turn...");
  await checkPostJson(
    "/api/tutor/chat",
    {
      messages: [{ role: "user", content: 'how to say "a coffee please"?' }],
      cefr: "A1",
      topic: "Madrid café",
    },
    (json) => {
      if (!json.reply || json.reply.includes("He recibido tu mensaje")) {
        throw new Error(`Invalid chat reply: ${JSON.stringify(json)}`);
      }
    }
  );

  console.log("\n3. Simulating Madrid Voice Roleplay turn + Mission Summary...");
  await checkPostJson(
    "/api/speak/turn",
    {
      scenarioTitle: "Order Coffee & Tostada",
      goalEn: "Order a drink and food politely, ask for the bill, and say thank you.",
      characterName: "Carlos",
      characterRole: "Barista in Malasaña, Madrid",
      setting: "Morning café in Madrid",
      cefr: "A1",
      history: [{ role: "assistant", text: "¡Buenos días! ¿Qué te pongo hoy?" }],
      userText: "Hola, ponme un café con leche y una tostada, por favor.",
    },
    (json) => {
      if (!json.replyEs || typeof json.goalCompleted !== "boolean") {
        throw new Error(`Invalid speak turn payload: ${JSON.stringify(json)}`);
      }
    }
  );

  await checkPostJson(
    "/api/speak/summary",
    {
      scenarioTitle: "Order Coffee & Tostada",
      goalEn: "Order a drink and food politely, ask for the bill, and say thank you.",
      cefr: "A1",
      transcript: [
        { role: "assistant", text: "¡Buenos días! ¿Qué te pongo hoy?" },
        { role: "user", text: "Ponme un café con leche y una tostada, por favor." },
        { role: "assistant", text: "¡Perfecto! Son cuatro euros." },
        { role: "user", text: "Aquí tienes, muchas gracias y hasta luego." },
      ],
    },
    (json) => {
      if (
        typeof json.score !== "number" ||
        !Array.isArray(json.usefulPhrases) ||
        json.usefulPhrases.length === 0
      ) {
        throw new Error(`Invalid speak summary payload: ${JSON.stringify(json)}`);
      }
    }
  );

  console.log("\n4. Simulating Word/Phrase Lookup...");
  await checkPostJson(
    "/api/tutor/word-lookup",
    {
      word: "¿De qué color es tu mesa?",
      contextSentence: "¿De qué color es tu mesa?",
    },
    (json) => {
      if (!json.meaning) {
        throw new Error(`Invalid word lookup payload: ${JSON.stringify(json)}`);
      }
    }
  );

  console.log("\n5. Simulating Practice Lab Writing Journal correction...");
  await checkPostJson(
    "/api/practice/journal",
    {
      prompt: "Describe your morning routine in Madrid.",
      entryEs: "Hoy me levanto a las ocho y voy a el bar para tomar un cafe con leche.",
      cefr: "A1-A2",
    },
    (json) => {
      if (typeof json.score !== "number" || !json.correctedEs) {
        throw new Error(`Invalid journal payload: ${JSON.stringify(json)}`);
      }
    }
  );

  console.log("\n6. Simulating Reader batched section translation...");
  await checkPostJson(
    "/api/reading/translate",
    {
      sentences: [
        "Llevo dos semanas buscando un piso de alquiler en Madrid.",
        "El piso está en una tercera planta con ascensor.",
      ],
    },
    (json) => {
      if (
        !Array.isArray(json.translations) ||
        json.translations.length !== 2 ||
        !json.translations[0]
      ) {
        throw new Error(`Invalid translation payload: ${JSON.stringify(json)}`);
      }
    }
  );

  console.log("\n✅ All E2E User Journey checks passed!\n");
}

main().catch((err) => {
  console.error("\n❌ E2E User Journey FAILED:", err.message);
  process.exit(1);
});
