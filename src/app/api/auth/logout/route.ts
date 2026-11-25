import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ authenticated: false });
  res.cookies.delete("ef_session");
  return res;
}
