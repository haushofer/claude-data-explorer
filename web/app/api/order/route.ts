import { NextRequest, NextResponse } from "next/server";
import { getOrder, setOrder, getItemOrder, setItemOrder } from "@/lib/order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, order: getOrder(), items: getItemOrder() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const out: any = { ok: true };
  if (Array.isArray(body.order)) out.order = setOrder(body.order.map(String));
  if (body.items && typeof body.items === "object") {
    const clean: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(body.items))
      if (Array.isArray(v)) clean[String(k)] = (v as any[]).map(String);
    out.items = setItemOrder(clean);
  }
  if (out.order === undefined && out.items === undefined)
    return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json(out);
}
