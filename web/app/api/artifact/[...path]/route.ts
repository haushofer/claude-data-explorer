import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { RUNS_DIR } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".py": "text/plain; charset=utf-8",
  ".do": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  // resolve + confine to RUNS_DIR (block path traversal)
  const target = path.resolve(RUNS_DIR, ...parts);
  if (!target.startsWith(path.resolve(RUNS_DIR) + path.sep))
    return new NextResponse("forbidden", { status: 403 });
  if (!fs.existsSync(target) || !fs.statSync(target).isFile())
    return new NextResponse("not found", { status: 404 });
  const ext = path.extname(target).toLowerCase();
  const body = fs.readFileSync(target);
  return new NextResponse(body, {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      // don't let the browser second-guess the declared type (defense for user uploads)
      "x-content-type-options": "nosniff",
    },
  });
}
