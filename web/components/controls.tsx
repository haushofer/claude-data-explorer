"use client";
import { useEffect, useState } from "react";

// Owner-only controls for an analysis: Stop a running one, Modify (re-prompt and
// re-run in place), Publish/Unpublish to the audience gallery, and Delete. Shown
// only to the person who ran it (matched by the session-wide name). Used on the
// workspace, in the results outline, and in the audience gallery.
export default function AnalysisControls({
  id,
  status,
  author,
  prompt,
  published,
  uploaded,
  onStopped,
  onDeleted,
  onModified,
  onPublished,
}: {
  id: string;
  status?: string;
  author?: string;
  prompt?: string;
  published?: boolean;
  uploaded?: boolean;
  onStopped?: () => void;
  onDeleted?: () => void;
  onModified?: () => void;
  onPublished?: () => void;
}) {
  const [myName, setMyName] = useState("");
  const [busy, setBusy] = useState<null | "stop" | "delete" | "modify" | "publish">(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prompt || "");
  const [pub, setPub] = useState(!!published);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setMyName((localStorage.getItem("explorer_name") || "").trim());
    read();
    window.addEventListener("explorer-name", read);
    return () => window.removeEventListener("explorer-name", read);
  }, []);
  useEffect(() => setPub(!!published), [published]);

  const mine = !!author && !!myName && author === myName;
  if (!mine) return null;

  const running = status === "running";

  const post = (body: object) =>
    fetch(`/api/analysis/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, name: myName }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, reason: "Network error." }));

  const stop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy("stop");
    await post({ action: "stop" });
    setBusy(null);
    onStopped?.();
  };

  const del = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this analysis? It will be removed for everyone and can't be undone.")) return;
    setBusy("delete");
    const r = await fetch(`/api/analysis/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: myName }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false }));
    setBusy(null);
    if (r.ok) onDeleted?.();
  };

  const togglePublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !pub;
    setBusy("publish");
    const r = await post({ action: next ? "publish" : "unpublish" });
    setBusy(null);
    if (r.ok) {
      setPub(next);
      onPublished?.();
    }
  };

  const openModify = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(prompt || "");
    setErr(null);
    setEditing(true);
  };

  const submitModify = async () => {
    if (!draft.trim()) return setErr("Describe the analysis you want.");
    setBusy("modify");
    const r = await post({ action: "modify", prompt: draft });
    setBusy(null);
    if (!r.ok) return setErr(r.reason || "Could not re-run.");
    setEditing(false);
    onModified?.();
  };

  return (
    <>
      <span className="actrls" onClick={(e) => e.stopPropagation()}>
        {pub && <span className="onair" title="Showing in the audience gallery">● published</span>}
        {running && (
          <button className="btn ghost xs" onClick={stop} disabled={busy !== null}>
            {busy === "stop" ? "Stopping…" : "■ Stop"}
          </button>
        )}
        {!running && !uploaded && (
          <button className="btn ghost xs" onClick={openModify} disabled={busy !== null}>
            ✎ Modify
          </button>
        )}
        <button className="btn ghost xs" onClick={togglePublish} disabled={busy !== null}>
          {busy === "publish" ? "…" : pub ? "Unpublish" : "📡 Publish"}
        </button>
        <button className="btn ghost xs danger" onClick={del} disabled={busy !== null}>
          {busy === "delete" ? "Deleting…" : "🗑 Delete"}
        </button>
      </span>

      {editing && (
        <div className="modal" onClick={() => setEditing(false)}>
          <div className="modalcard" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px" }}>Modify this analysis</h3>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: 13.5 }}>
              Edit the request and re-run it. This replaces the current scripts, figures, and summary.
            </p>
            <textarea
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Describe the analysis in plain English."
            />
            {err && <p style={{ color: "var(--danger)", marginTop: 8, fontSize: 13.5 }}>{err}</p>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn ghost" onClick={() => setEditing(false)} disabled={busy === "modify"}>
                Cancel
              </button>
              <button onClick={submitModify} disabled={busy === "modify"}>
                {busy === "modify" ? <><span className="spin" /> Re-running…</> : "Re-run"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
