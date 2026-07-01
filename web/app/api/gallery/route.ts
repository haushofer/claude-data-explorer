import { NextResponse } from "next/server";
import { listAnalyses } from "@/lib/db";
import { readProgress } from "@/lib/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listAnalyses().map((a) => ({
    ...a,
    artifacts: a.artifacts ? JSON.parse(a.artifacts) : [],
    // live activity for in-flight analyses so the outline can show what's happening
    progress: a.status === "running" ? readProgress(a.author_slug, a.id) : [],
  }));
  return NextResponse.json({ ok: true, analyses: rows });
}
