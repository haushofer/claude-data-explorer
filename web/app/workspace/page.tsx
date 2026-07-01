"use client";
import { useEffect, useRef, useState } from "react";
import { EditableScript, ProgressLog } from "@/components/script";
import AnalysisControls from "@/components/controls";
import { EXAMPLE_PROMPTS, ANALYZE_PLACEHOLDER } from "@/lib/site.config";

type Step = { t: number; label: string; kind: string };
type Analysis = {
  id: string;
  author: string;
  prompt: string;
  status: "running" | "done" | "error" | "stopped";
  summary: string | null;
  error: string | null;
  artifacts: string[];
  cost_usd: number | null;
  published?: boolean;
  uploaded?: boolean;
  progress?: Step[];
};

const EXAMPLES = EXAMPLE_PROMPTS;

export default function Workspace() {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [current, setCurrent] = useState<Analysis | null>(null);
  const [mine, setMine] = useState<Analysis[]>([]);
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<{ id: string; label: string } | null>(null);
  const pollRef = useRef<any>(null);

  useEffect(() => {
    const read = () => setName((localStorage.getItem("explorer_name") || "").trim());
    read();
    window.addEventListener("explorer-name", read);
    const p = new URLSearchParams(window.location.search);
    const id = p.get("section");
    if (id) setSection({ id, label: p.get("label") || id });
    return () => window.removeEventListener("explorer-name", read);
  }, []);

  const refreshMine = async (nm: string) => {
    const r = await fetch("/api/gallery").then((r) => r.json());
    if (r.ok) setMine(r.analyses.filter((a: Analysis) => a.author === nm));
  };

  useEffect(() => {
    if (name) refreshMine(name);
  }, [name]);

  // keep the "past analyses" list live while any of them is running (so Stop /
  // Modify / publish state updates without a manual refresh)
  useEffect(() => {
    if (!name || !mine.some((a) => a.status === "running")) return;
    const t = setInterval(() => refreshMine(name), 2500);
    return () => clearInterval(t);
  }, [name, mine]);

  const submit = async () => {
    setNotice(null);
    if (!name.trim()) return setNotice("Enter your name in the top-right of the header first.");
    if (!prompt.trim()) return setNotice("Describe the analysis you want.");
    setBusy(true);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, prompt, section: section?.id, section_label: section?.label }),
    }).then((r) => r.json());
    if (!res.ok) {
      setNotice(res.reason || "Could not start.");
      setBusy(false);
      return;
    }
    setPrompt("");
    setRunningId(res.id);
    poll(res.id);
  };

  // Stop the in-flight run and free the form so a new analysis can start right
  // away (the poll flips the result card to "stopped" a moment later).
  const stopRun = async () => {
    if (!runningId) return;
    setNotice(null);
    await fetch(`/api/analysis/${runningId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "stop", name }),
    }).catch(() => {});
    setBusy(false);
    setRunningId(null);
  };

  const poll = (id: string) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/analysis/${id}`).then((r) => r.json());
      if (!r.ok) return;
      setCurrent(r.analysis);
      if (r.analysis.status !== "running") {
        clearInterval(pollRef.current);
        setBusy(false);
        setRunningId(null);
        refreshMine(name);
      }
    }, 1500);
  };

  return (
    <div className="container">
      <h1>Your workspace</h1>
      <p className="sub">
        Describe an analysis in plain English. Claude runs it on the de-identified dataset
        and the result appears here, in your workspace. It stays private to you until you
        hit <b>Publish</b> — only then does it appear in the audience gallery under your name.
      </p>

      {section && (
        <div className="card" style={{ marginTop: 10, borderColor: "var(--accent)" }}>
          Adding to section <b>{section.label}</b>. Your result stays private until you Publish it —
          then it appears under that section of the results outline. <a href="/" className="muted">← back to outline</a>
        </div>
      )}

      <div className="card" style={{ marginTop: 10 }}>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
          {name ? <>Posting as <b style={{ color: "var(--ink)" }}>{name}</b> — change your name in the top-right of the header.</>
                : "Enter your name in the top-right of the header to contribute."}
        </p>
        <label className="label">What analysis would you like?</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={ANALYZE_PLACEHOLDER}
          style={{ marginTop: 6 }}
        />
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 6 }}>
            {EXAMPLES.map((ex, i) => (
              <button key={i} className="btn ghost" style={{ fontSize: 12, padding: "6px 9px" }} onClick={() => setPrompt(ex)}>
                {ex.slice(0, 28)}…
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {busy && (
              <button className="btn ghost danger" onClick={stopRun}>■ Stop</button>
            )}
            <button onClick={submit} disabled={busy}>
              {busy ? <><span className="spin" /> Running…</> : "Run analysis"}
            </button>
          </div>
        </div>
        {busy && (
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Only one analysis runs at a time — stop this one to start a new one.
          </p>
        )}
        {notice && <p style={{ color: "var(--danger)", marginTop: 10 }}>{notice}</p>}
      </div>

      {current && (
        <ResultCard
          a={current}
          live
          onStopped={() => poll(current.id)}
          onModified={() => poll(current.id)}
          onPublished={() => refreshMine(name)}
          onDeleted={() => { setCurrent(null); refreshMine(name); }}
        />
      )}

      {mine.length > 0 && (
        <>
          <h2>Your past analyses</h2>
          {mine.map((a) => (
            <ResultCard
              key={a.id}
              a={a}
              onStopped={() => refreshMine(name)}
              onModified={() => refreshMine(name)}
              onPublished={() => refreshMine(name)}
              onDeleted={() => refreshMine(name)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ResultCard({ a, live, onStopped, onDeleted, onModified, onPublished }: {
  a: Analysis; live?: boolean; onStopped?: () => void; onDeleted?: () => void;
  onModified?: () => void; onPublished?: () => void;
}) {
  const [rev, setRev] = useState(0); // cache-bust regenerated figures after a re-run
  const arts = a.artifacts || [];
  const pngs = arts.filter((f) => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f));
  const pdfs = arts.filter((f) => /\.pdf$/i.test(f));
  const pys = arts.filter((f) => /\.py$/i.test(f));
  const dos = arts.filter((f) => /\.do$/i.test(f));
  const downloads = arts.filter((f) => /\.(csv|md|txt)$/i.test(f));
  const bust = (f: string) => `/api/artifact/${f}${rev ? `?rev=${rev}` : ""}`;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b>{a.author}</b>
        <span className="row" style={{ gap: 10, alignItems: "center" }}>
          <span className="tag">
            {a.status === "running" ? (
              <><span className="spin" /> running…</>
            ) : a.status === "error" ? (
              <span style={{ color: "var(--danger)" }}>error</span>
            ) : a.status === "stopped" ? (
              <span className="muted">stopped</span>
            ) : (
              <span style={{ color: "var(--good)" }}>done</span>
            )}
          </span>
          <AnalysisControls id={a.id} status={a.status} author={a.author}
            prompt={a.prompt} published={a.published} uploaded={a.uploaded}
            onStopped={onStopped} onDeleted={onDeleted}
            onModified={onModified} onPublished={onPublished} />
        </span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>“{a.prompt}”</p>

      {a.status === "running" && <ProgressLog steps={a.progress} />}
      {a.status === "error" && <p style={{ color: "var(--danger)" }}>{a.error}</p>}

      {/* main output first: figures / tables, then the narration below */}
      {pngs.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", marginTop: 10 }}>
          {pngs.map((f) => (
            <a key={f + rev} href={bust(f)} target="_blank">
              <img className="artimg" src={bust(f)} alt={f} />
            </a>
          ))}
        </div>
      )}
      {pdfs.length > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          {pdfs.map((f) => (
            <a key={f} className="pill" href={bust(f)} target="_blank">📄 Open PDF ↗</a>
          ))}
        </div>
      )}
      {downloads.length > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          {downloads.map((f) => (
            <a key={f} className="pill" href={bust(f)} target="_blank">⬇ {f.split("/").pop()}</a>
          ))}
        </div>
      )}

      {a.summary && a.status === "done" && <p style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{a.summary}</p>}

      {a.status === "done" && pys.map((f) => (
        <EditableScript key={f} id={a.id} file={f} language="python" onRan={() => setRev((r) => r + 1)} />
      ))}
      {a.status === "done" && dos.map((f) => (
        <EditableScript key={f} id={a.id} file={f} language="stata" />
      ))}
    </div>
  );
}
