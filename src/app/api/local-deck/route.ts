import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { unzipSync } from "fflate";
import {
  extractMediaBytesFromApkg,
  parseApkgBuffer,
  parseMediaManifest,
} from "@/lib/anki/parser";

const DATA_DIR = path.join(process.cwd(), "data");

interface CachedApkgIndex {
  apkgBuffers: Map<string, Uint8Array>;
  filenameToLocation: Map<string, { file: string; zipKey: string }>;
}

const globalForDeckCache = globalThis as unknown as {
  __efDeckCache?: CachedApkgIndex;
};

function getOrBuildMediaIndex(): CachedApkgIndex {
  if (globalForDeckCache.__efDeckCache) {
    return globalForDeckCache.__efDeckCache;
  }

  const apkgBuffers = new Map<string, Uint8Array>();
  const filenameToLocation = new Map<string, { file: string; zipKey: string }>();

  if (fs.existsSync(DATA_DIR)) {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.toLowerCase().endsWith(".apkg"));

    for (const file of files) {
      const fullPath = path.join(DATA_DIR, file);
      const buf = new Uint8Array(fs.readFileSync(fullPath));
      apkgBuffers.set(file, buf);

      const mediaOnly = unzipSync(buf, {
        filter: (entry) => entry.name === "media",
      });
      if (mediaOnly["media"]) {
        const manifest = parseMediaManifest(mediaOnly["media"]);
        for (const [audioName, zipKey] of Object.entries(manifest)) {
          if (!filenameToLocation.has(audioName)) {
            filenameToLocation.set(audioName, { file, zipKey });
          }
        }
      }
    }
  }

  globalForDeckCache.__efDeckCache = { apkgBuffers, filenameToLocation };
  return globalForDeckCache.__efDeckCache;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "list";

  // 1. List .apkg files in `data/`
  if (action === "list") {
    if (!fs.existsSync(DATA_DIR)) {
      return NextResponse.json({ files: [] });
    }
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.toLowerCase().endsWith(".apkg"))
      .map((name) => {
        const stat = fs.statSync(path.join(DATA_DIR, name));
        return {
          name,
          sizeBytes: stat.size,
          sizeMb: Math.round((stat.size / (1024 * 1024)) * 10) / 10,
          recommended: name.includes("Top_5000"),
        };
      })
      .sort((a, b) => Number(b.recommended) - Number(a.recommended));

    return NextResponse.json({ files });
  }

  // 2. Parse a deck from `data/` and return structured notes + accent samples
  if (action === "parse") {
    const fileName = searchParams.get("file");
    if (!fileName || fileName.includes("..") || fileName.includes("/")) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }
    const fullPath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "Deck file not found in data/" }, { status: 404 });
    }

    const index = getOrBuildMediaIndex();
    let apkgBytes = index.apkgBuffers.get(fileName);
    if (!apkgBytes) {
      apkgBytes = new Uint8Array(fs.readFileSync(fullPath));
      index.apkgBuffers.set(fileName, apkgBytes);
    }

    const parsed = await parseApkgBuffer(apkgBytes, { fileName });
    return NextResponse.json(parsed);
  }

  // 3. Stream an individual audio clip by filename from `data/*.apkg`
  if (action === "media") {
    const filename = searchParams.get("filename");
    if (!filename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    const index = getOrBuildMediaIndex();
    const loc = index.filenameToLocation.get(filename);
    if (!loc) {
      return NextResponse.json(
        { error: `Audio ${filename} not found in data/ decks` },
        { status: 404 }
      );
    }

    const apkgBytes = index.apkgBuffers.get(loc.file);
    if (!apkgBytes) {
      return NextResponse.json({ error: "Deck buffer unavailable" }, { status: 404 });
    }

    const mediaBytes = extractMediaBytesFromApkg(apkgBytes, loc.zipKey);
    if (!mediaBytes) {
      return NextResponse.json({ error: "Zip key not found" }, { status: 404 });
    }

    return new NextResponse(Buffer.from(mediaBytes), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
