import fs from "fs";
import path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { LIMITS, RUNS_DIR, DATA_DIR, VENV_PYTHON } from "./config";
import { DATASET } from "./site.config";
import {
  createAnalysis,
  finishAnalysis,
  getAnalysis,
  restartAnalysis,
} from "./db";

const ARTIFACT_EXT = new Set([".png", ".jpg", ".jpeg", ".svg", ".csv", ".md", ".html", ".txt", ".py"]);
const SEED_FILES = new Set([DATASET.file, "data_dictionary.md"]);

// ---------------------------------------------------------------------------
// Tool guard: confine every agent action to its own run directory. This stops a
// crafted prompt from reading anything else on the host (SSH keys, other projects,
// raw data, etc.). Heuristic, not a full OS sandbox — see SECURITY note in README.
// ---------------------------------------------------------------------------
const VENV_DIR = path.dirname(VENV_PYTHON);
// Path-traversal and sensitive-file references. Each alternative is anchored so it
// only matches a real path/secret, not incidental substrings in ordinary analysis
// code:  '..' must be followed by a separator (path traversal, not 'cortisol1..7');
// '~' must be followed by a separator (home dir, not pandas boolean masks df[~m]);
// '.key' needs a word boundary (a key file, not '.keys()').
export const SENSITIVE =
  /(\.\.[\/\\]|\/etc\/|\/home\/|\/root\/|\/var\/|\/usr\/|\/opt\/|~[\/\\]|\.ssh|id_ed25519|id_rsa|\.p8|\.pem|\.key\b|\.credentials|\.aws|authorized_keys|\.bashrc|\.bash_profile|\.env\b|\/proc\/|\/sys\/|ANTHROPIC_API_KEY)/i;
export const NETWORK =
  /\b(curl|wget|nc|ncat|netcat|ssh|scp|sftp|rsync|ftp|telnet|aws|gh|git|pip|npm|brew|apt|yum|dnf)\b|requests\.|urllib|http\.client|socket\.|\.connect\(/i;

// A leading shebang ("#!/usr/bin/env python3") is an interpreter directive, not a
// file reference. Strip it before scanning written content so a normal shebang
// doesn't trip the /usr/ rule. Scripts here are executed via VENV_PYTHON (the
// shebang is inert) and Bash commands are vetted separately, so this is safe.
function stripShebang(s: string): string {
  return s.replace(/^#![^\n]*\n?/, "");
}

// Guard a user-edited script before we execute it on re-run. Mirrors the
// content checks guardTool() applies to agent Writes: no network calls, no
// references to files outside the workspace.
export function guardScript(code: string): { allow: boolean; reason?: string } {
  const body = stripShebang(code);
  if (NETWORK.test(body)) return { allow: false, reason: "scripts may not access the network or run package/VCS commands" };
  if (SENSITIVE.test(body)) return { allow: false, reason: "scripts may not reference files outside the analysis workspace" };
  return { allow: true };
}

function insideRun(p: string, runDir: string): boolean {
  if (!p) return false;
  const abs = path.resolve(runDir, p);
  return abs === runDir || abs.startsWith(runDir + path.sep) || abs.startsWith("/tmp/");
}

function guardTool(name: string, input: any, runDir: string): { allow: boolean; reason?: string } {
  if (name === "Read" || name === "Write" || name === "Edit" || name === "NotebookEdit") {
    const p = String(input?.file_path || input?.path || input?.notebook_path || "");
    if (!insideRun(p, runDir)) return { allow: false, reason: "file access is confined to the analysis workspace" };
    const content = stripShebang(String(input?.content ?? "") + "\n" + String(input?.new_string ?? ""));
    if (SENSITIVE.test(content) || NETWORK.test(content))
      return { allow: false, reason: "content references files or network resources outside the workspace" };
    return { allow: true };
  }
  if (name === "Glob" || name === "Grep" || name === "LS") {
    const p = String(input?.path || ".");
    return insideRun(p, runDir) ? { allow: true } : { allow: false, reason: "search is confined to the workspace" };
  }
  if (name === "Bash") {
    const cmd = String(input?.command || "");
    if (NETWORK.test(cmd)) return { allow: false, reason: "network / package / VCS commands are not allowed" };
    const stripped = cmd.split(VENV_PYTHON).join(" "); // the venv python is the one allowed absolute path
    if (SENSITIVE.test(stripped)) return { allow: false, reason: "command references paths outside the workspace" };
    for (const tok of stripped.match(/(?:^|[\s'"`(=])\/[^\s'"`;:|&)]+/g) || []) {
      const t = tok.replace(/^[\s'"`(=]+/, "");
      if (!t.startsWith(runDir) && !t.startsWith(VENV_DIR) && !t.startsWith("/tmp/"))
        return { allow: false, reason: `command references a path outside the workspace: ${t}` };
    }
    return { allow: true };
  }
  return { allow: false, reason: `tool '${name}' is not permitted in the analysis workspace` };
}

// in-process state (single self-hosted node server)
const running = new Set<string>();
const inflight = new Map<string, Promise<void>>(); // keep refs so background work isn't GC'd
const live = new Map<string, { interrupt?: () => Promise<void> }>(); // in-flight agent queries, for Stop
const stopped = new Set<string>(); // ids the user asked to stop, so the run finalizes as "stopped"

export function activeCount() {
  return running.size;
}

// Stop a running analysis: interrupt the agent and mark it so it finalizes as
// "stopped" rather than "done"/"error". Returns false if nothing was running.
export async function stopAnalysis(id: string): Promise<boolean> {
  const q = live.get(id);
  if (!q) return false;
  stopped.add(id);
  try { await q.interrupt?.(); } catch { /* already finishing */ }
  return true;
}

// Permanently remove an analysis's run directory (its scripts, figures, data).
export function purgeRunDir(slug: string, id: string) {
  fs.rmSync(path.join(RUNS_DIR, slug, id), { recursive: true, force: true });
}

export type StartResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

export function startAnalysis(
  author: string,
  slug: string,
  prompt: string,
  section?: string | null,
  section_label?: string | null
): StartResult {
  if (!prompt.trim()) return { ok: false, reason: "Describe the analysis you want first." };

  const id = `${slug}-${Date.now().toString(36)}`;
  createAnalysis({ id, author, author_slug: slug, prompt, section, section_label });
  track(id, slug, prompt);
  return { ok: true, id };
}

// Kick off (or re-kick) a run and wire up its lifecycle bookkeeping. Shared by
// startAnalysis (fresh) and modifyAnalysis (re-run an existing analysis).
function track(id: string, slug: string, prompt: string) {
  running.add(id);
  const p = runAnalysis(id, slug, prompt)
    .catch((e) => {
      // interrupting the agent can surface as a thrown abort — record it as stopped
      finishAnalysis(id, stopped.has(id)
        ? { status: "stopped", summary: "(stopped by the user)" }
        : { status: "error", error: String(e?.message ?? e) });
    })
    .finally(() => {
      running.delete(id);
      inflight.delete(id);
      live.delete(id);
      stopped.delete(id);
    });
  inflight.set(id, p);
}

// Modify an existing analysis: replace its prompt and re-run the agent in place,
// regenerating its scripts, figures, and summary. Owner-checked at the API layer.
export function modifyAnalysis(id: string, prompt: string): StartResult {
  const a = getAnalysis(id);
  if (!a) return { ok: false, reason: "Unknown analysis." };
  if (running.has(id)) return { ok: false, reason: "This analysis is still running — stop it first." };
  if (!prompt.trim()) return { ok: false, reason: "Describe the analysis you want first." };

  purgeRunDir(a.author_slug, id); // clear the previous run's scripts/figures
  restartAnalysis(id, prompt.trim()); // reset the row to running with the new prompt
  track(id, a.author_slug, prompt.trim());
  return { ok: true, id };
}

const SYSTEM_APPEND = `
You are a data-analysis assistant embedded in an interactive data explorer. A visitor
has asked you to analyze a dataset.

${DATASET.description}

WORKING RULES — follow exactly:
- The dataset is in your working directory: ./${DATASET.file}
  The column reference is ./data_dictionary.md. Read it before analyzing.
- ALWAYS use this exact Python interpreter (it has pandas, numpy, matplotlib, seaborn):
    ${VENV_PYTHON}
  Run analyses with: ${VENV_PYTHON} analysis.py
- Write your Python analysis to a file named exactly 'analysis.py' in the working
  directory, then run it. The visitor can edit this file and re-run it, so keep it
  self-contained and readable (it loads ./${DATASET.file}, comments the key steps).
- Produce at least one chart saved as a .png in the working directory (matplotlib,
  dpi=120, clear title + axis labels). Save any result tables as .csv.
- Finish with a concise plain-language summary (3-6 sentences) of what you found, written
  for a general audience — state the actual numbers. This summary is shown publicly, so be
  accurate and never invent results not supported by the data.
- Do not access the network or any files outside this working directory.
`;

async function runAnalysis(id: string, slug: string, prompt: string): Promise<void> {
  const runDir = path.join(RUNS_DIR, slug, id);
  fs.mkdirSync(runDir, { recursive: true });
  // seed inputs into the isolated run directory
  fs.copyFileSync(path.join(DATA_DIR, DATASET.file), path.join(runDir, DATASET.file));
  fs.copyFileSync(path.join(DATA_DIR, "data_dictionary.md"), path.join(runDir, "data_dictionary.md"));

  const progressPath = path.join(runDir, "_progress.ndjson");
  const logProgress = (obj: any) =>
    fs.appendFileSync(progressPath, JSON.stringify({ t: Date.now(), ...obj }) + "\n");

  let finalText = "";
  let cost: number | null = null;

  const response = query({
    prompt,
    options: {
      cwd: runDir,
      // NOT bypassPermissions: every tool call is vetted by guardTool() so the agent
      // is confined to its own run directory (it cannot read other files on the host).
      permissionMode: "default",
      maxTurns: LIMITS.maxTurns,
      settingSources: [],
      systemPrompt: { type: "preset", preset: "claude_code", append: SYSTEM_APPEND },
      canUseTool: async (toolName: string, input: any) => {
        const g = guardTool(toolName, input, runDir);
        if (!g.allow) {
          logProgress({ type: "denied", tool: toolName, reason: g.reason });
          return { behavior: "deny" as const, message: g.reason || "not permitted" };
        }
        return { behavior: "allow" as const, updatedInput: input };
      },
    },
  });

  live.set(id, response); // expose interrupt() so the user can Stop this run

  // hard timeout: interrupt the agent if it runs too long
  const timer = setTimeout(() => {
    logProgress({ type: "timeout" });
    response.interrupt?.().catch(() => {});
  }, LIMITS.timeoutMs);

  try {
    for await (const msg of response) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            finalText = block.text;
            logProgress({ type: "text", text: block.text });
          } else if (block.type === "tool_use") {
            logProgress({ type: "tool", name: block.name, input: summarizeTool(block.input) });
          }
        }
      } else if (msg.type === "result") {
        cost = (msg as any).total_cost_usd ?? null;
        if ((msg as any).subtype === "success" && (msg as any).result) {
          finalText = (msg as any).result;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  const artifacts = collectArtifacts(runDir, slug, id);
  const wasStopped = stopped.has(id);
  finishAnalysis(id, {
    status: wasStopped ? "stopped" : "done",
    summary: finalText || (wasStopped ? "(stopped by the user)" : "(no summary produced)"),
    artifacts: JSON.stringify(artifacts),
    cost_usd: cost,
  });
}

function summarizeTool(input: any): string {
  if (!input) return "";
  if (typeof input.command === "string") return input.command.slice(0, 160);
  if (typeof input.file_path === "string") return input.file_path;
  return JSON.stringify(input).slice(0, 160);
}

// Re-scan a run directory for artifacts (used after a user edits + re-runs a script).
export function listArtifacts(slug: string, id: string): string[] {
  const runDir = path.join(RUNS_DIR, slug, id);
  if (!fs.existsSync(runDir)) return [];
  return collectArtifacts(runDir, slug, id);
}

// relative artifact paths (served via /api/artifact/<slug>/<id>/<file>)
function collectArtifacts(runDir: string, slug: string, id: string): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(runDir)) {
    if (f.startsWith("_") || SEED_FILES.has(f)) continue;
    if (ARTIFACT_EXT.has(path.extname(f).toLowerCase())) out.push(`${slug}/${id}/${f}`);
  }
  // images first so the gallery leads with a picture
  return out.sort((a, b) => rank(a) - rank(b));
}
function rank(p: string) {
  const e = path.extname(p).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".svg"].includes(e)) return 0;
  if (e === ".md" || e === ".txt") return 1;
  return 2;
}
