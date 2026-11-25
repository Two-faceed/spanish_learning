import { NextRequest, NextResponse } from "next/server";
import { extractArticleFromHtml } from "@/lib/reading/importers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string };
    const rawUrl = (body.url ?? "").trim();

    if (!rawUrl) {
      return NextResponse.json(
        { error: "Please enter a valid article URL" },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format (include https://)" },
        { status: 400 }
      );
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return NextResponse.json(
        { error: "Only http:// and https:// URLs are supported" },
        { status: 400 }
      );
    }

    const res = await fetch(parsedUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EspanolFastReader/1.0; +https://localhost)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.5",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch URL (HTTP ${res.status})` },
        { status: 400 }
      );
    }

    const html = await res.text();
    const extracted = extractArticleFromHtml(html, parsedUrl.hostname);

    if (!extracted.content || extracted.content.length < 40) {
      return NextResponse.json(
        {
          error:
            "Could not extract readable article text from that URL. Try pasting the text directly.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      title: extracted.title,
      content: extracted.content,
      sourceUrl: parsedUrl.toString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to extract article from URL",
      },
      { status: 500 }
    );
  }
}
