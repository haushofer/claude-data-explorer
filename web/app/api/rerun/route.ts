import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { RUNS_DIR, VENV_PYTHON, LIMITS } from "@/lib/config";
import { getAnalysis, setArtifacts } from "@/lib/db";
import { guardScript, listArtifacts } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Edit-and-re-run: the audience tweaks the Python (or Stata) script of an
// analysis and runs it again. Python is executed here with the same venv +
// content guards the agent uses; Stata is saved for replication (no Stata on
// this server), with the .do file kept up to date for download.
export async function POST(req: NextRequest) {
  const { id, file, code } = await req.json().catch(() => ({}));
  if (!id || !file || typeof code !== "string")
    return NextResponse.json({ ok: false, reason: "Missing id, file, or code." }, { status: 400 });

  const a = getAnalysis(id);
  if (!a) return NextResponse.json({ ok: false, reason: "Unknown analysis." }, { status: 404 });

  // Confine the target to this analysis's own run directory.
  const runDir = path.resolve(RUNS_DIR, a.author_slug, id);
  const target = path.resolve(RUNS_DIR, String(file));
  if (target !== runDir && !target.startsWith(runDir + path.sep))
    return NextResponse.json({ ok: false, reason: "File is outside this analysis." }, { status: 403 });
  if (!fs.existsSync(runDir))
    return NextResponse.json({ ok: false, reason: "This analysis's workspace is no longer available." }, { status: 410 });

  const ext = path.extname(target).toLowerCase();
  if (ext !== ".py" && ext !== ".do")
    return NextResponse.json({ ok: false, reason: "Only .py and .do scripts can be edited." }, { status: 400 });

  const g = guardScript(code);
  if (!g.allow) return NextResponse.json({ ok: false, reason: g.reason }, { status: 400 });

  // Persist the edited script.
  fs.writeFileSync(target, code, "utf8");

  // Stata can't run here — save only, and tell the user.
  if (ext === ".do") {
    return NextResponse.json({
      ok: true,
      ran: false,
      note: "Saved. Stata isn't installed on this server — download the .do file and run it in your own Stata.",
      artifacts: listArtifacts(a.author_slug, id),
    });
  }

  // Run the edited Python with the venv, confined to the run dir, hard-timed.
  const proc = spawnSync(VENV_PYTHON, [target], {
    cwd: runDir,
    timeout: LIMITS.timeoutMs,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    // inherit the server env (the interpreter is a conda env that needs it);
    // force a headless matplotlib backend so charts render without a display.
    env: { ...process.env, MPLBACKEND: "Agg" },
  });

  const stdout = (proc.stdout || "").slice(-6000);
  const stderr = (proc.stderr || "").slice(-6000);
  const timedOut = proc.error && (proc.error as any).code === "ETIMEDOUT";
  const ranOk = !proc.error && proc.status === 0;

  // Always re-scan: a partial run may still have written a figure.
  const artifacts = listArtifacts(a.author_slug, id);
  setArtifacts(id, artifacts);

  return NextResponse.json({
    ok: ranOk,
    ran: true,
    reason: timedOut
      ? "The script exceeded the time limit and was stopped."
      : ranOk
        ? null
        : "The script exited with an error — see the output below.",
    stdout,
    stderr,
    artifacts,
  });
}
