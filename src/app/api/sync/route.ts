import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerAdminClient } from "@/lib/supabase/server";
import {
  CardRecord,
  ReviewLogRecord,
  SessionRecord,
  SettingsRecord,
} from "@/types/database";
import { FullBackupPayload } from "@/lib/offline/backup";

export const runtime = "nodejs";

const SYNC_TABLE_CONFLICTS: {
  key: keyof FullBackupPayload["tables"];
  conflict: string;
}[] = [
  { key: "notes", conflict: "id" },
  { key: "cards", conflict: "id" },
  { key: "review_logs", conflict: "id" },
  { key: "sessions", conflict: "date" },
  { key: "settings", conflict: "id" },
  { key: "lessons", conflict: "id" },
  { key: "errors", conflict: "id" },
  { key: "pron_attempts", conflict: "id" },
  { key: "texts", conflict: "id" },
  { key: "word_status", conflict: "lemma" },
  { key: "journey", conflict: "week" },
  { key: "rewards", conflict: "id" },
  { key: "quests", conflict: "id" },
];

async function fetchAllRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerAdminClient>>,
  table: string
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      // Table might not exist yet if a later migration wasn't run
      return rows;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

/**
 * GET /api/sync
 * Pulls full user progress & deck state from Supabase so a new device (e.g. phone on Vercel)
 * can restore all learned words, cards, streak, lessons, and reading texts in 1 click.
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerAdminClient();
    if (!supabase) {
      return NextResponse.json(
        {
          ok: false,
          mode: "local-only",
          error:
            "Supabase is not configured on this server. Add NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY, or use Export/Restore .json Backup.",
        },
        { status: 400 }
      );
    }

    const tables: Record<string, unknown[]> = {};
    for (const { key } of SYNC_TABLE_CONFLICTS) {
      tables[key] = await fetchAllRows(supabase, key);
    }

    const backup: FullBackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tables: tables as unknown as FullBackupPayload["tables"],
    };

    return NextResponse.json({
      ok: true,
      mode: "supabase",
      backup,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cloud pull failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      pendingReviews?: {
        id: string;
        reviewLog: ReviewLogRecord;
        updatedCard: CardRecord;
      }[];
      session?: SessionRecord;
      settings?: SettingsRecord;
      fullBackup?: FullBackupPayload;
    };

    const supabase = getSupabaseServerAdminClient();
    if (!supabase) {
      if (body.fullBackup) {
        return NextResponse.json(
          {
            ok: false,
            mode: "local-only",
            error:
              "Supabase is not configured on this server. Use Export/Restore .json Backup instead.",
          },
          { status: 400 }
        );
      }
      // Acknowledge incremental sync locally when Supabase is not configured yet
      return NextResponse.json({
        ok: true,
        mode: "local-only",
        syncedCount: body.pendingReviews?.length ?? 0,
      });
    }

    // Full cloud backup push (chunked upserts)
    if (body.fullBackup?.tables) {
      let totalRows = 0;
      const warnings: string[] = [];

      for (const { key, conflict } of SYNC_TABLE_CONFLICTS) {
        const rows = body.fullBackup.tables[key];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK);
          const { error } = await supabase
            .from(key)
            .upsert(slice as unknown as Record<string, unknown>[], {
              onConflict: conflict,
            });
          if (error) {
            warnings.push(`${key}: ${error.message}`);
            break;
          }
          totalRows += slice.length;
        }
      }

      return NextResponse.json({
        ok: true,
        mode: "supabase",
        syncedCount: totalRows,
        warnings,
      });
    }

    const pending = body.pendingReviews ?? [];
    if (pending.length > 0) {
      const updatedCards = pending.map((p) => p.updatedCard);
      const reviewLogs = pending.map((p) => p.reviewLog);

      await supabase.from("cards").upsert(updatedCards, { onConflict: "id" });
      await supabase
        .from("review_logs")
        .upsert(reviewLogs, { onConflict: "id" });
    }

    if (body.session) {
      await supabase
        .from("sessions")
        .upsert(body.session, { onConflict: "date" });
    }

    if (body.settings) {
      await supabase
        .from("settings")
        .upsert(body.settings, { onConflict: "id" });
    }

    return NextResponse.json({
      ok: true,
      mode: "supabase",
      syncedCount: pending.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
