"use client";
import { useEffect, useState } from "react";

// Add a user-contributed image/PDF and/or text to the gallery — an alternative to
// running a Claude analysis. Posts to /api/upload and publishes under the session
// name. The file can be chosen, pasted (Cmd/Ctrl+V), or dragged in.
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,application/pdf";
const OK_TYPE = (t: string) => /^image\/(png|jpeg|gif|webp)$/.test(t) || t === "application/pdf";

export default function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [myName, setMyName] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null); // object URL for image previews
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setMyName((localStorage.getItem("explorer_name") || "").trim());
    read();
    window.addEventListener("explorer-name", read);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("explorer-name", read);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // keep an object-URL preview for images; revoke it when the file changes/unmounts
  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [file]);

  const take = (f: File | null | undefined) => {
    if (!f) return;
    if (!OK_TYPE(f.type)) return setErr("That file type isn’t supported — use an image or a PDF.");
    setErr(null);
    setFile(f);
  };

  // grab the first image/PDF from a clipboard paste or a drag-drop
  const fromTransfer = (dt: DataTransfer | null): File | null => {
    if (!dt) return null;
    for (const f of Array.from(dt.files || [])) if (OK_TYPE(f.type)) return f;
    for (const it of Array.from(dt.items || [])) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && OK_TYPE(f.type)) return f;
      }
    }
    return null;
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const f = fromTransfer(e.clipboardData);
    if (f) { e.preventDefault(); take(f); }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(fromTransfer(e.dataTransfer));
  };

  const submit = async () => {
    setErr(null);
    if (!myName) return setErr("Set your name in the top-right of the header first.");
    if (!text.trim() && !file) return setErr("Add an image, a PDF, or some text.");
    setBusy(true);
    const fd = new FormData();
    fd.append("name", myName);
    fd.append("title", title);
    fd.append("text", text);
    if (file) fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd })
      .then((r) => r.json())
      .catch(() => ({ ok: false, reason: "Network error." }));
    setBusy(false);
    if (!r.ok) return setErr(r.reason || "Upload failed.");
    onDone();
    onClose();
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modalcard" onClick={(e) => e.stopPropagation()} onPaste={onPaste}>
        <h3 style={{ margin: "0 0 4px" }}>Add your own</h3>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 13.5 }}>
          Upload, paste, or drag in an image or PDF — or paste text — instead of running an
          analysis. It’s published to the audience gallery under your name{myName ? <> (<b>{myName}</b>)</> : ""}.
        </p>

        <label className="label">Title (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="A short caption" style={{ marginTop: 4 }} />

        <label className="label" style={{ marginTop: 12, display: "block" }}>Text (optional)</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste text to share…" style={{ marginTop: 4 }} />

        <label className="label" style={{ marginTop: 12, display: "block" }}>Image or PDF (optional)</label>
        <div
          className={"dropzone" + (dragging ? " over" : "")}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {file ? (
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              {preview
                ? <img src={preview} alt="preview" style={{ maxHeight: 64, maxWidth: 96, borderRadius: 6 }} />
                : <span style={{ fontSize: 26 }}>📄</span>}
              <span style={{ fontSize: 13 }}>{file.name || "pasted file"}</span>
              <button className="btn ghost xs" onClick={() => setFile(null)}>Remove</button>
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              Drag a file here, paste it (⌘/Ctrl+V), or{" "}
              <label className="picklink">
                choose one
                <input type="file" accept={ACCEPT}
                  onChange={(e) => take(e.target.files?.[0])}
                  style={{ display: "none" }} />
              </label>
            </span>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>PNG, JPEG, GIF, WebP, or PDF — up to 10 MB.</p>

        {err && <p style={{ color: "var(--danger)", marginTop: 10, fontSize: 13.5 }}>{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button onClick={submit} disabled={busy}>
            {busy ? <><span className="spin" /> Uploading…</> : "Add to gallery"}
          </button>
        </div>
      </div>
    </div>
  );
}
