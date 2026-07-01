import { NextRequest, NextResponse } from "next/server";
import { startAnalysis } from "@/lib/agent";
import { slugify } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { name, prompt, section, section_label } = await req.json().catch(() => ({}));
  if (!name || !String(name).trim())
    return NextResponse.json({ ok: false, reason: "Enter your name first." }, { status: 400 });
  const author = String(name).trim().slice(0, 60);
  const slug = slugify(author);
  const res = startAnalysis(
    author,
    slug,
    String(prompt ?? ""),
    section ? String(section).slice(0, 40) : null,
    section_label ? String(section_label).slice(0, 80) : null
  );
  if (!res.ok) return NextResponse.json(res, { status: 429 });
  return NextResponse.json(res);
}
