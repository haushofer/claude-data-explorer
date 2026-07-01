// Pure-JS, single-process JSON-file store for the gallery.
// Chosen over sqlite so the app runs unchanged on EC2 Node 20 (no node:sqlite,
// no native better-sqlite3 build) and local Node 25 alike. The scale (a talk
// gallery) is tiny; reads come from memory, every mutation is persisted
// synchronously, and pm2 runs a single fork (no cross-process races).
import fs from "fs";
import path from "path";
import { DB_PATH } from "./config";

const STORE_PATH = DB_PATH.replace(/\.db$/, ".json");

export type Analysis = {
  id: string;
  author: string;
  author_slug: string;
  prompt: string;
  section: string | null; // section id this analysis was added under (or null)
  section_label: string | null;
  status: "running" | "done" | "error" | "stopped";
  summary: string | null;
  error: string | null;
  artifacts: string | null; // JSON array string (kept for API shape compatibility)
  cost_usd: number | null;
  created_at: number;
  finished_at: number | null;
  published?: boolean; // shown in the audience gallery only when true (optional: older rows lack it)
  uploaded?: boolean; // a user-uploaded image/text rather than a Claude-generated analysis
};

let _rows: Analysis[] | null = null;

function load(): Analysis[] {
  if (_rows) return _rows;
  try {
    _rows = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    _rows = [];
  }
  return _rows!;
}

function persist() {
  fs.writeFileSync(STORE_PATH, JSON.stringify(_rows ?? [], null, 0));
}

export function createAnalysis(row: {
  id: string;
  author: string;
  author_slug: string;
  prompt: string;
  section?: string | null;
  section_label?: string | null;
}) {
  const rows = load();
  rows.unshift({
    id: row.id,
    author: row.author,
    author_slug: row.author_slug,
    prompt: row.prompt,
    section: row.section ?? null,
    section_label: row.section_label ?? null,
    status: "running",
    summary: null,
    error: null,
    artifacts: null,
    cost_usd: null,
    created_at: Date.now(),
    finished_at: null,
    published: false,
  });
  persist();
}

// A user-contributed image/text (no Claude run). Lands in the gallery right away
// (published) under the contributor's name; they can unpublish or delete it.
export function createUpload(row: {
  id: string;
  author: string;
  author_slug: string;
  title: string;
  text: string | null;
  artifacts: string[];
}) {
  const rows = load();
  const now = Date.now();
  rows.unshift({
    id: row.id,
    author: row.author,
    author_slug: row.author_slug,
    prompt: row.title,
    section: null,
    section_label: null,
    status: "done",
    summary: row.text,
    error: null,
    artifacts: row.artifacts.length ? JSON.stringify(row.artifacts) : null,
    cost_usd: null,
    created_at: now,
    finished_at: now,
    published: true,
    uploaded: true,
  });
  persist();
}

// Reset a row so its analysis can be re-run in place with a (possibly new)
// prompt. Keeps created_at and the published flag; clears prior outputs.
export function restartAnalysis(id: string, prompt: string): boolean {
  const a = load().find((r) => r.id === id);
  if (!a) return false;
  a.prompt = prompt;
  a.status = "running";
  a.summary = null;
  a.error = null;
  a.artifacts = null;
  a.cost_usd = null;
  a.finished_at = null;
  persist();
  return true;
}

// Publish / unpublish an analysis to the audience gallery.
export function setPublished(id: string, published: boolean): boolean {
  const a = load().find((r) => r.id === id);
  if (!a) return false;
  a.published = published;
  persist();
  return true;
}

export function finishAnalysis(
  id: string,
  patch: Partial<Pick<Analysis, "status" | "summary" | "error" | "artifacts" | "cost_usd">>
) {
  const rows = load();
  const a = rows.find((r) => r.id === id);
  if (!a) return;
  a.status = patch.status ?? "done";
  a.summary = patch.summary ?? a.summary ?? null;
  a.error = patch.error ?? null;
  a.artifacts = patch.artifacts ?? a.artifacts ?? null;
  a.cost_usd = patch.cost_usd ?? a.cost_usd ?? null;
  a.finished_at = Date.now();
  persist();
}

export function setArtifacts(id: string, artifacts: string[]) {
  const a = load().find((r) => r.id === id);
  if (!a) return;
  a.artifacts = JSON.stringify(artifacts);
  persist();
}

export function getAnalysis(id: string): Analysis | undefined {
  return load().find((r) => r.id === id);
}

// Remove an analysis row entirely (the run directory is purged separately).
export function deleteAnalysis(id: string): boolean {
  const rows = load();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return false;
  rows.splice(i, 1);
  persist();
  return true;
}

export function listAnalyses(): Analysis[] {
  // newest first (createAnalysis unshifts, so already ordered, but sort to be safe)
  return [...load()].sort((a, b) => b.created_at - a.created_at);
}
