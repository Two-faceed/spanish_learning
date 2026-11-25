import { unzipSync, strFromU8 } from "fflate";
import { extractJsonFromAiText } from "@/lib/ai/json-parser";

export interface ImportedTextResult {
  title: string;
  content: string;
}

export interface GeneratedGradedReader {
  title: string;
  content: string;
  targetWords: string[];
}

export function parseGeneratedGradedReaderJson(
  rawText: string,
  fallbackTopic: string
): GeneratedGradedReader {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : `Lectura de Madrid: ${fallbackTopic}`;
  const content =
    typeof parsed.content === "string" ? parsed.content.trim() : "";
  const targetWords = Array.isArray(parsed.targetWords)
    ? parsed.targetWords
        .map((w) => String(w).trim())
        .filter((w) => w.length > 0)
        .slice(0, 10)
    : [];

  if (!content) {
    throw new Error("Generated reading text was empty");
  }

  return { title, content, targetWords };
}

/**
 * Strips HTML tags into clean paragraph-separated plain text (works in browser or Node).
 */
export function htmlToCleanParagraphs(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");

  const withBreaks = withoutScripts
    .replace(/<\/(p|div|h1|h2|h3|h4|li|blockquote|section|article)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const decoded = withBreaks
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–");

  return decoded
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0)
    .join("\n\n");
}

/**
 * Extracts title and clean article text from an HTML page string.
 */
export function extractArticleFromHtml(
  html: string,
  fallbackTitle = "Imported Article"
): ImportedTextResult {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch
    ? titleMatch[1].replace(/\s+/g, " ").trim()
    : fallbackTitle;

  // Prefer <article> or <main> body if present
  const articleMatch =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ??
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  const scopeHtml = articleMatch ? articleMatch[1] : html;
  const paragraphs = htmlToCleanParagraphs(scopeHtml)
    .split("\n\n")
    .filter((p) => p.length >= 25);

  const content =
    paragraphs.length > 0
      ? paragraphs.join("\n\n").slice(0, 30000)
      : htmlToCleanParagraphs(scopeHtml).slice(0, 30000);

  return {
    title: rawTitle.slice(0, 120) || fallbackTitle,
    content,
  };
}

/**
 * Parses a plain .txt file in the browser.
 */
export async function parseTxtFile(file: File): Promise<ImportedTextResult> {
  const text = await file.text();
  const title = file.name.replace(/\.txt$/i, "").trim() || "Imported Text";
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 60000);

  return { title, content: cleaned };
}

/**
 * Parses an .epub file directly in the browser using fflate (zero extra libraries).
 * Reads META-INF/container.xml -> OPF spine -> ordered XHTML chapters.
 */
export async function parseEpubFile(file: File): Promise<ImportedTextResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(bytes);
  const fileKeys = Object.keys(files);

  const fallbackTitle =
    file.name.replace(/\.epub$/i, "").trim() || "Imported EPUB";

  // 1. Find OPF path via META-INF/container.xml
  let opfPath = "";
  const containerBytes = files["META-INF/container.xml"];
  if (containerBytes) {
    const containerXml = strFromU8(containerBytes);
    const fullPathMatch = containerXml.match(/full-path="([^"]+)"/i);
    if (fullPathMatch) {
      opfPath = fullPathMatch[1];
    }
  }
  if (!opfPath) {
    opfPath = fileKeys.find((k) => k.toLowerCase().endsWith(".opf")) ?? "";
  }

  let title = fallbackTitle;
  const chapterPaths: string[] = [];

  if (opfPath && files[opfPath]) {
    const opfXml = strFromU8(files[opfPath]);
    const opfDir = opfPath.includes("/")
      ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
      : "";

    const dcTitle = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
    if (dcTitle && dcTitle[1].trim()) {
      title = dcTitle[1].replace(/<[^>]+>/g, "").trim();
    }

    // Map manifest id -> href
    const manifest = new Map<string, string>();
    const itemRegex = /<item\s+([^>]+?)\/?\s*>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(opfXml)) !== null) {
      const attrs = m[1];
      const idMatch = attrs.match(/id="([^"]+)"/i);
      const hrefMatch = attrs.match(/href="([^"]+)"/i);
      if (idMatch && hrefMatch) {
        manifest.set(idMatch[1], decodeURIComponent(hrefMatch[1]));
      }
    }

    // Follow spine reading order
    const itemrefRegex = /<itemref[^>]+idref="([^"]+)"/gi;
    while ((m = itemrefRegex.exec(opfXml)) !== null) {
      const href = manifest.get(m[1]);
      if (href) {
        const resolved = `${opfDir}${href}`.replace(/^\//, "");
        if (files[resolved]) {
          chapterPaths.push(resolved);
        }
      }
    }
  }

  // Fallback: grab all .xhtml / .html files in alphabetical order
  if (chapterPaths.length === 0) {
    chapterPaths.push(
      ...fileKeys
        .filter((k) => /\.(xhtml|html|htm)$/i.test(k))
        .sort()
    );
  }

  const chapterTexts: string[] = [];
  let totalChars = 0;
  const MAX_CHARS = 400000;

  for (const chPath of chapterPaths) {
    if (totalChars >= MAX_CHARS) break;
    const rawHtml = strFromU8(files[chPath]);
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const cleaned = htmlToCleanParagraphs(bodyMatch ? bodyMatch[1] : rawHtml);
    if (cleaned.length > 20) {
      chapterTexts.push(cleaned);
      totalChars += cleaned.length;
    }
  }

  const content = chapterTexts.join("\n\n").slice(0, MAX_CHARS).trim();
  if (!content) {
    throw new Error("Could not extract readable Spanish text from this EPUB.");
  }

  return { title, content };
}

/**
 * Safely parses batched sentence translations returned by Gemini Flash JSON.
 * Accepts `{ translations: string[] }` (or a top-level string array) and strips
 * any Markdown code fences.
 */
export function parseSentenceTranslationsJson(
  rawText: string,
  expectedCount: number
): string[] {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let list: string[] | null = null;

  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { translations?: unknown }).translations)
          ? (parsed as { translations: unknown[] }).translations
          : null;
      if (arr && arr.length > 0) {
        list = arr.map((item) =>
          typeof item === "string" ? item.trim() : String(item ?? "").trim()
        );
      }
    } catch {
      // Fall through to plain-line fallback below
    }
  }

  // Fallback if the model returned plain numbered lines instead of JSON
  if (!list) {
    const lines = cleaned
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").replace(/^["'\-\s]+|["',\s]+$/g, "").trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !/^[\{\}\[\]]+$/.test(l) &&
          !/^"translations"\s*:/.test(l)
      );
    if (lines.length > 0) {
      list = lines;
    }
  }

  if (!list || list.length === 0) {
    throw new Error("AI did not return valid JSON translations.");
  }

  if (expectedCount > 0 && list.length < expectedCount) {
    while (list.length < expectedCount) {
      list.push("");
    }
  }

  return expectedCount > 0 ? list.slice(0, expectedCount) : list;
}
