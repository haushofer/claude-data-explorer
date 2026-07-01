import { NextRequest, NextResponse } from "next/server";
import { SITE_PASSWORD, AUTH_COOKIE, AUTH_TOKEN } from "@/lib/siteauth";

// Shared-password gate for the live audience. A correct password (entered on the
// /login page) sets an httpOnly cookie; every other request must carry it. Set
// SITE_PASSWORD empty in the server env to disable the gate entirely.
export function middleware(req: NextRequest) {
  if (!SITE_PASSWORD) return NextResponse.next(); // gate disabled

  const { pathname, search } = req.nextUrl;

  // The login page and its API must be reachable unauthenticated.
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  if (req.cookies.get(AUTH_COOKIE)?.value === AUTH_TOKEN) return NextResponse.next();

  // Unauthenticated: APIs get a 401, page requests bounce to the login screen
  // (preserving where they were headed so we can return them there afterwards).
  if (pathname.startsWith("/api/"))
    return NextResponse.json({ ok: false, reason: "Not authenticated." }, { status: 401 });

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

// Gate everything except Next's static assets and the favicon/app icon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
