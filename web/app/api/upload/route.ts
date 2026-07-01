import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { RUNS_DIR } from "@/lib/config";
import { slugify } from "@/lib/data";
import { createUpload } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Raster images + PDF only — no SVG/HTML (those can carry scripts when opened directly).
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT = 5000;

// Accept a user-contributed image and/or text (multipart/form-data) and add it to
// the gallery — an alternative to running a Claude analysis.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid upload." }, { status: 400 });
  }

  const name = String(form.get("name") || "").trim();
  if (!name) return NextResponse.json({ ok: false, reason: "Enter your name first." }, { status: 400 });

  const title = String(form.get("title") || "").trim().slice(0, 120);
  const text = String(form.get("text") || "").trim().slice(0, MAX_TEXT);
  const file = form.get("file");
  const hasFile = !!file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0;

  if (!text && !hasFile)
    return NextResponse.json({ ok: false, reason: "Add an image or some text." }, { status: 400 });

  const author = name.slice(0, 60);
  const slug = slugify(author);
  const id = `${slug}-up-${Date.now().toString(36)}`;
  const runDir = path.join(RUNS_DIR, slug, id);

  const artifacts: string[] = [];
  let ext = "";
  if (hasFile) {
    const f = file as File;
    ext = MIME_EXT[f.type];
    if (!ext)
      return NextResponse.json({ ok: false, reason: "Files must be an image (PNG, JPEG, GIF, WebP) or a PDF." }, { status: 400 });
    if (f.size > MAX_BYTES)
      return NextResponse.json({ ok: false, reason: "File is too large (max 10 MB)." }, { status: 400 });
    const buf = Buffer.from(await f.arrayBuffer());
    fs.mkdirSync(runDir, { recursive: true });
    // fixed, server-chosen filename (never the client's) so there's no path traversal
    fs.writeFileSync(path.join(runDir, `upload.${ext}`), buf);
    artifacts.push(`${slug}/${id}/upload.${ext}`);
  }

  const defaultTitle = ext === "pdf" ? "Uploaded document" : hasFile ? "Uploaded image" : "Uploaded note";
  createUpload({
    id,
    author,
    author_slug: slug,
    title: title || defaultTitle,
    text: text || null,
    artifacts,
  });
  return NextResponse.json({ ok: true, id });
}
