"use client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AnalysisControls from "./controls";
import UploadModal from "./upload";

const PdfView = dynamic(() => import("./pdfview"), { ssr: false, loading: () => <p className="muted">Loading PDF…</p> });

type Analysis = {
  id: string;
  author: string;
  prompt: string;
  status: "running" | "done" | "error" | "stopped";
  summary: string | null;
  artifacts: string[];
  cost_usd: number | null;
  created_at: number;
  published?: boolean;
  uploaded?: boolean;
};

const isImg = (f: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f);
const isPdf = (f: string) => /\.pdf$/i.test(f);
const isData = (f: string) => /\.(csv|md|txt|py|do)$/i.test(f);

export default function Gallery() {
  const [items, setItems] = useState<Analysis[]>([]);
  const [enlargedId, setEnlargedId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/gallery").then((r) => r.json());
    if (r.ok) setItems(r.analyses);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  // close the pop-out on Escape
  useEffect(() => {
    if (!enlargedId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEnlargedId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enlargedId]);

  // The gallery shows only analyses the author has chosen to publish.
  const done = items.filter((a) => a.published && a.status !== "error");

  const enlarged = enlargedId ? done.find((a) => a.id === enlargedId) || null : null;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1>Audience gallery</h1>
          <p className="sub">
            Analyses the audience has chosen to publish, newest first. Click an analysis to enlarge it.
          </p>
        </div>
        <button onClick={() => setUploadOpen(true)} style={{ flex: "none", marginTop: 4 }}>⬆ Upload</button>
      </div>

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onDone={load} />}

      {done.length === 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">
            No analyses published yet. Run one in your workspace and hit Publish to show it here.
          </p>
        </div>
      )}

      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", marginTop: 16 }}
      >
        {done.map((a) => (
          <div className="card" key={a.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ fontSize: 15 }}>{a.author}{a.uploaded && <span className="tag" style={{ marginLeft: 8, fontWeight: 400 }}>uploaded</span>}</b>
              <span className="row" style={{ gap: 10, alignItems: "center" }}>
                <span className="tag">
                  {a.status === "running" ? (
                    <><span className="spin" /> running…</>
                  ) : a.status === "stopped" ? (
                    <span className="muted">stopped</span>
                  ) : (
                    <span style={{ color: "var(--good)" }}>✓</span>
                  )}
                </span>
                <button className="btn ghost xs" onClick={() => setEnlargedId(a.id)}>⤢ Enlarge</button>
                <AnalysisControls id={a.id} status={a.status} author={a.author}
                  prompt={a.prompt} published={a.published} uploaded={a.uploaded}
                  onStopped={load} onDeleted={load} onModified={load} onPublished={load} />
              </span>
            </div>
            <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>“{a.prompt}”</p>
            {a.artifacts?.filter(isImg).slice(0, 1).map((f) => (
              <img
                key={f}
                className="artimg zoomable"
                src={`/api/artifact/${f}`}
                alt={f}
                onClick={() => setEnlargedId(a.id)}
              />
            ))}
            {a.artifacts?.some(isPdf) && (
              <p style={{ marginTop: 8 }}>
                <button className="pill" onClick={() => setEnlargedId(a.id)} style={{ cursor: "pointer" }}>📄 View PDF</button>
              </p>
            )}
            {a.summary && a.status === "done" && (
              <p style={{ whiteSpace: "pre-wrap", fontSize: 13.5, marginTop: 8 }}>{a.summary}</p>
            )}
          </div>
        ))}
      </div>

      {enlarged && (
        <div className="modal" onClick={() => setEnlargedId(null)}>
          <div className="modalcard enlarge" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ fontSize: 19 }}>{enlarged.author}</b>
              <span className="row" style={{ gap: 12, alignItems: "center" }}>
                <span className="tag">
                  {enlarged.status === "running" ? (
                    <><span className="spin" /> running…</>
                  ) : enlarged.status === "stopped" ? (
                    <span className="muted">stopped</span>
                  ) : (
                    <span style={{ color: "var(--good)" }}>✓ done</span>
                  )}
                </span>
                <button className="btn ghost xs" onClick={() => setEnlargedId(null)}>✕ Close</button>
              </span>
            </div>
            <p className="muted" style={{ marginTop: 6, fontSize: 14.5 }}>“{enlarged.prompt}”</p>

            {enlarged.artifacts?.filter(isImg).map((f) => (
              <a key={f} href={`/api/artifact/${f}`} target="_blank" rel="noreferrer">
                <img className="artimg" src={`/api/artifact/${f}`} alt={f} style={{ marginTop: 12 }} />
              </a>
            ))}

            {enlarged.artifacts?.filter(isPdf).map((f) => (
              <div key={f} style={{ marginTop: 12 }}>
                <PdfView src={`/api/artifact/${f}`} />
              </div>
            ))}

            {enlarged.summary && (
              <p style={{ whiteSpace: "pre-wrap", fontSize: 15, marginTop: 14, lineHeight: 1.55 }}>
                {enlarged.summary}
              </p>
            )}

            {enlarged.artifacts?.some(isData) && (
              <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {enlarged.artifacts.filter(isData).map((f) => (
                  <a key={f} className="pill" href={`/api/artifact/${f}`} target="_blank" rel="noreferrer">
                    ⬇ {f.split("/").pop()}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
