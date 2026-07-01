"use client";
import { useEffect, useRef, useState } from "react";

type Step = { t: number; label: string; kind: string };

// Live "what's happening now" readout for a running analysis. Shows the latest
// step prominently and keeps the full trace one click away.
export function ProgressLog({ steps }: { steps?: Step[] }) {
  const list = steps || [];
  const current = list.length ? list[list.length - 1] : null;
  return (
    <div className="prog">
      <div className="prog-now">
        <span className="spin" />
        <span className="prog-label">{current ? current.label : "Starting up the analysis…"}</span>
      </div>
      {list.length > 1 && (
        <details className="prog-steps">
          <summary>{list.length} steps so far</summary>
          <ol>
            {list.map((s, i) => (
              <li key={i} className={i === list.length - 1 ? "cur" : ""}>{s.label}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

// An analysis script the audience can edit and re-run (Python) or edit and
// download for replication (Stata). `file` is the artifact-relative path
// (slug/id/name); `id` is the analysis id the /api/rerun route keys on.
export function EditableScript({
  id,
  file,
  language,
  onRan,
}: {
  id: string;
  file: string;
  language: "python" | "stata";
  onRan?: (artifacts: string[]) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [orig, setOrig] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const name = file.split("/").pop() || file;
  const isPy = language === "python";

  useEffect(() => {
    let live = true;
    fetch(`/api/artifact/${file}`)
      .then((r) => r.text())
      .then((t) => { if (live) { setCode(t); setOrig(t); } })
      .catch(() => { if (live) setCode(""); });
    return () => { live = false; };
  }, [file]);

  const dirty = code != null && code !== orig;

  const run = async () => {
    if (code == null) return;
    setBusy(true);
    setOut(null);
    const r = await fetch("/api/rerun", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, file, code }),
    }).then((r) => r.json()).catch(() => ({ ok: false, reason: "network error" }));
    setBusy(false);
    setOrig(code); // edits are now persisted server-side
    if (r.artifacts && onRan) onRan(r.artifacts);
    if (!isPy) {
      setOut({ ok: true, text: r.note || "Saved." });
      return;
    }
    const parts: string[] = [];
    if (r.reason) parts.push(r.reason);
    if (r.stdout) parts.push("— output —\n" + r.stdout);
    if (r.stderr) parts.push("— errors —\n" + r.stderr);
    setOut({ ok: !!r.ok, text: parts.join("\n\n") || (r.ok ? "Re-ran successfully." : "Run failed.") });
  };

  const download = () => {
    if (code == null) return;
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <details className="codebox editable" open>
      <summary>
        {isPy ? "Python script — editable & re-runnable" : "Stata script — editable (.do)"}
        <span className={"prov " + (isPy ? "ai" : "human")}>{isPy ? "🤖 Python" : "Σ Stata"}</span>
      </summary>
      <div className="editwrap">
        {code == null ? (
          <p className="muted" style={{ padding: "10px 14px" }}>Loading script…</p>
        ) : (
          <>
            <textarea
              ref={taRef}
              className="codeedit"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="editbar">
              {isPy ? (
                <button onClick={run} disabled={busy}>
                  {busy ? <><span className="spin" /> Running…</> : (dirty ? "▶ Run edited script" : "▶ Re-run")}
                </button>
              ) : (
                <button onClick={run} disabled={busy || !dirty}>
                  {busy ? "Saving…" : "💾 Save edits"}
                </button>
              )}
              <button className="btn ghost" onClick={download}>⬇ Download {name}</button>
              {dirty && <button className="btn ghost" onClick={() => setCode(orig)}>Revert</button>}
              <span className="editnote muted">
                {isPy ? "Runs on the de-identified data with the same limits." : "Runs in your own Stata."}
              </span>
            </div>
            {out && (
              <pre className={"editout" + (out.ok ? "" : " err")}>{out.text}</pre>
            )}
          </>
        )}
      </div>
    </details>
  );
}
