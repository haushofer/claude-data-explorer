import { NextRequest, NextResponse } from "next/server";
import { getAnalysis, deleteAnalysis, setPublished } from "@/lib/db";
import { readProgress } from "@/lib/progress";
import { stopAnalysis, purgeRunDir, modifyAnalysis } from "@/lib/agent";
import { slugify } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = getAnalysis(id);
  if (!a) return NextResponse.json({ ok: false }, { status: 404 });
  const progress = a.status === "running" ? readProgress(a.author_slug, id) : [];
  return NextResponse.json({
    ok: true,
    analysis: { ...a, artifacts: a.artifacts ? JSON.parse(a.artifacts) : [], progress },
  });
}

// Ownership is by the contributor's name (the app's trust model — no accounts):
// the submitted name must slugify to the same author_slug the analysis was run under.
function owns(name: unknown, slug: string): boolean {
  return !!name && slugify(String(name)) === slug;
}

// Owner actions on an analysis (POST { action, name, ... }):
//   stop      — interrupt a running analysis
//   modify    — replace the prompt and re-run in place ({ prompt })
//   publish   — show it in the audience gallery
//   unpublish — hide it from the audience gallery
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { action, name, prompt } = await req.json().catch(() => ({}));
  const a = getAnalysis(id);
  if (!a) return NextResponse.json({ ok: false, reason: "Unknown analysis." }, { status: 404 });
  if (!owns(name, a.author_slug))
    return NextResponse.json({ ok: false, reason: "You can only control analyses you ran." }, { status: 403 });

  if (action === "stop") {
    const stopped = await stopAnalysis(id);
    return NextResponse.json({ ok: true, stopped });
  }
  if (action === "modify") {
    const res = modifyAnalysis(id, String(prompt ?? ""));
    return NextResponse.json(res, res.ok ? {} : { status: 400 });
  }
  if (action === "publish" || action === "unpublish") {
    const published = action === "publish";
    setPublished(id, published);
    return NextResponse.json({ ok: true, published });
  }
  return NextResponse.json({ ok: false, reason: "Unknown action." }, { status: 400 });
}

// Delete an analysis (DELETE { name }) — stops it first if still running, then
// removes the gallery row and its run directory for everyone.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { name } = await req.json().catch(() => ({}));
  const a = getAnalysis(id);
  if (!a) return NextResponse.json({ ok: true }); // already gone — idempotent
  if (!owns(name, a.author_slug))
    return NextResponse.json({ ok: false, reason: "You can only delete analyses you ran." }, { status: 403 });

  await stopAnalysis(id).catch(() => {});
  deleteAnalysis(id);
  purgeRunDir(a.author_slug, id);
  return NextResponse.json({ ok: true });
}
