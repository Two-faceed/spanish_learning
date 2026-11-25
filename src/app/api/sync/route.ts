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

function sanitizeCardRow(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: raw.id,
    note_id: raw.note_id,
    type: raw.type,
    due: raw.due,
    stability: Number(raw.stability ?? 0),
    difficulty: Number(raw.difficulty ?? 0),
    elapsed_days: Math.round(Number(raw.elapsed_days ?? 0)),
    scheduled_days: Math.round(Number(raw.scheduled_days ?? 0)),
    reps: Math.round(Number(raw.reps ?? 0)),
    lapses: Math.round(Number(raw.lapses ?? 0)),
    state: Math.round(Number(raw.state ?? 0)),
    last_review: raw.last_review ?? null,
    suspended: Boolean(raw.suspended ?? false),
  };
}

function sanitizeRowsForTable(
  tableKey: keyof FullBackupPayload["tables"],
  rows: unknown[]
): Record<string, unknown>[] {
  if (tableKey === "cards") {
    return rows.map((r) => sanitizeCardRow(r as Record<string, unknown>));
  }
  return rows as Record<string, unknown>[];
}

async function fetchAllRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerAdminClient>>,
  table: string,
  orderCol: string = "id"
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderCol, { ascending: true })
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
 * - `?mode=progress`: fast lightweight pull of ONLY reviewed cards (`reps > 0`) +
 *   sessions, lessons, errors, texts, word_status, pron_attempts, settings (<250ms).
 * - `?table=cards&offset=0&limit=1000`: paginated per-table pull under Vercel's 4.5MB limit.
 */
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get("mode");

    if (modeParam === "progress") {
      const [
        minedNotesRes,
        reviewedCardsRes,
        sessionsRes,
        settingsRes,
        lessonsRes,
        errorsRes,
        pronRes,
        textsRes,
        wordStatusRes,
      ] = await Promise.all([
        supabase.from("notes").select("*").neq("source", "deck").limit(2000),
        supabase.from("cards").select("*").gt("reps", 0).limit(5000),
        supabase.from("sessions").select("*").limit(500),
        supabase.from("settings").select("*").limit(5),
        supabase.from("lessons").select("*").limit(200),
        supabase.from("errors").select("*").limit(500),
        supabase.from("pron_attempts").select("*").limit(500),
        supabase.from("texts").select("*").limit(200),
        supabase.from("word_status").select("*").limit(5000),
      ]);

      return NextResponse.json({
        ok: true,
        mode: "supabase",
        progress: {
          notes: minedNotesRes.data ?? [],
          cards: reviewedCardsRes.data ?? [],
          sessions: sessionsRes.data ?? [],
          settings: settingsRes.data ?? [],
          lessons: lessonsRes.data ?? [],
          errors: errorsRes.data ?? [],
          pron_attempts: pronRes.data ?? [],
          texts: textsRes.data ?? [],
          word_status: wordStatusRes.data ?? [],
        },
      });
    }

    const tableParam = searchParams.get("table");

    if (tableParam) {
      const allowed = SYNC_TABLE_CONFLICTS.find((t) => t.key === tableParam);
      if (!allowed) {
        return NextResponse.json(
          { ok: false, error: `Unknown sync table: ${tableParam}` },
          { status: 400 }
        );
      }
      const offset = Math.max(0, Number(searchParams.get("offset") ?? "0") || 0);
      const limit = Math.min(
        1000,
        Math.max(1, Number(searchParams.get("limit") ?? "1000") || 1000)
      );
      const { data, error } = await supabase
        .from(allowed.key)
        .select("*")
        .order(allowed.conflict, { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) {
        return NextResponse.json({
          ok: true,
          mode: "supabase",
          table: allowed.key,
          rows: [],
          hasMore: false,
        });
      }
      const rows = data ?? [];
      return NextResponse.json({
        ok: true,
        mode: "supabase",
        table: allowed.key,
        rows,
        hasMore: rows.length === limit,
      });
    }

    const tables: Record<string, unknown[]> = {};
    for (const { key, conflict } of SYNC_TABLE_CONFLICTS) {
      tables[key] = await fetchAllRows(supabase, key, conflict);
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
          const slice = sanitizeRowsForTable(key, rows.slice(i, i + CHUNK));
          const { error } = await supabase
            .from(key)
            .upsert(slice, {
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
      const updatedCards = pending.map((p) =>
        sanitizeCardRow(p.updatedCard as unknown as Record<string, unknown>)
      );
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
