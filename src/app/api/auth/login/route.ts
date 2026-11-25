import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    const password = (body.password ?? "").trim();
    const email = (body.email ?? "").trim();

    if (!password) {
      return NextResponse.json(
        { error: "Please enter your password." },
        { status: 400 }
      );
    }

    // 1. Check Supabase Auth if configured and email is provided
    const supabase = getSupabaseServerAdminClient();
    if (supabase && email) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!error && data.session) {
        const res = NextResponse.json({
          authenticated: true,
          mode: "supabase",
          user: { email: data.user.email },
        });
        res.cookies.set("ef_session", "authenticated", {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 90, // 90 days (12-week course)
        });
        return res;
      }
    }

    // 2. Single-learner local password protection (defaults to LEARNER_PASSWORD or "madrid-b1")
    const expectedPassword = process.env.LEARNER_PASSWORD || "madrid-b1";
    if (password === expectedPassword) {
      const res = NextResponse.json({
        authenticated: true,
        mode: "single-user",
      });
      res.cookies.set("ef_session", "authenticated", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });
      return res;
    }

    return NextResponse.json(
      { error: "Invalid credentials. (Default local passcode: madrid-b1)" },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid login request." },
      { status: 400 }
    );
  }
}
