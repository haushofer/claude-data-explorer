import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/config";
import { DATASET } from "@/lib/site.config";

export const runtime = "nodejs";

// Serve the full dataset as CSV text (parsed client-side for the table view).
// With ?download=1 it's sent as a file attachment instead.
export async function GET(req: Request) {
  const csv = fs.readFileSync(path.join(DATA_DIR, DATASET.file), "utf8");
  const headers: Record<string, string> = {
    "content-type": "text/csv; charset=utf-8",
    "cache-control": "public, max-age=3600",
  };
  if (new URL(req.url).searchParams.has("download"))
    headers["content-disposition"] = `attachment; filename="${DATASET.downloadAs}"`;
  return new NextResponse(csv, { headers });
}
