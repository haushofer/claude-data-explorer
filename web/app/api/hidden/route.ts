import { NextRequest, NextResponse } from "next/server";
import { getHidden, setHidden } from "@/lib/hidden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, hidden: getHidden() });
}

export async function POST(req: NextRequest) {
  const { id, hidden } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, reason: "missing id" }, { status: 400 });
  const arr = setHidden(String(id), !!hidden);
  return NextResponse.json({ ok: true, hidden: arr });
}
