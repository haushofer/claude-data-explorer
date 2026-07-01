import { NextRequest, NextResponse } from "next/server";
import { SITE_PASSWORD, AUTH_COOKIE, AUTH_TOKEN } from "@/lib/siteauth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  if (SITE_PASSWORD && String(password ?? "") !== SITE_PASSWORD)
    return NextResponse.json({ ok: false, reason: "Incorrect password." }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, AUTH_TOKEN, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // one week
  });
  return res;
}
