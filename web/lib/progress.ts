// Reads the per-run _progress.ndjson that lib/agent.ts appends to while an
// analysis is running, and turns each entry into a short human-readable line
// ("Reading data_dictionary.md", "Running the Python analysis…", …) so the UI
// can show what the agent is *currently* doing instead of a bare "running…".
import fs from "fs";
import path from "path";
import { RUNS_DIR } from "./config";

export type Step = { t: number; label: string; kind: string };

function base(p: string): string {
  return p.split("/").pop() || p;
}

function humanize(o: any): string | null {
  switch (o.type) {
    case "tool": {
      const name = String(o.name || "");
      const inp = String(o.input || "");
      if (name === "Bash") {
        if (/\.do\b/.test(inp)) return "Preparing the Stata script…";
        if (/\.py\b/.test(inp) || /python/i.test(inp)) return "Running the Python analysis…";
        return "Running: " + inp.slice(0, 80);
      }
      if (name === "Read") return "Reading " + base(inp);
      if (name === "Write") return "Writing " + base(inp);
      if (name === "Edit") return "Editing " + base(inp);
      if (name === "Glob" || name === "Grep" || name === "LS") return "Looking through the workspace…";
      return name + (inp ? " " + inp.slice(0, 60) : "");
    }
    case "text": {
      const t = String(o.text || "").trim().replace(/\s+/g, " ");
      if (!t) return null;
      return "“" + t.slice(0, 140) + (t.length > 140 ? "…" : "") + "”";
    }
    case "denied":
      return "Skipped a blocked action" + (o.reason ? ` (${o.reason})` : "");
    case "timeout":
      return "Reached the time limit — wrapping up.";
    default:
      return null;
  }
}

export function readProgress(slug: string, id: string): Step[] {
  const p = path.join(RUNS_DIR, slug, id, "_progress.ndjson");
  let raw: string;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch {
    return [];
  }
  const steps: Step[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const label = humanize(o);
    if (label) steps.push({ t: o.t || 0, label, kind: o.type });
  }
  return steps;
}
