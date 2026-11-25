import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerAdminClient } from "@/lib/supabase/server";
import { CardRecord, ReviewLogRecord, SessionRecord, SettingsRecord } from "@/types/database";

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
    };

    const supabase = getSupabaseServerAdminClient();
    if (!supabase) {
      // Acknowledge sync locally when Supabase is not configured yet
      return NextResponse.json({
        ok: true,
        mode: "local-only",
        syncedCount: body.pendingReviews?.length ?? 0,
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
