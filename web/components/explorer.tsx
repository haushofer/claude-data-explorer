"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Rich, Code } from "./rich";
import { EditableScript, ProgressLog } from "./script";
import DataTable from "./datatable";
import AnalysisControls from "./controls";
import TexTable from "./textable";

const PdfView = dynamic(() => import("./pdfview"), { ssr: false, loading: () => <p className="muted">Loading PDF…</p> });

type Analysis = {
  id: string;
  title: string;
  kind: "figure" | "table" | "pdf" | "participant";
  src?: string | null;
  table?: { columns: string[]; rows: string[][] } | null;
  writeup?: string | null;
  code?: string | null;
  provenance?: "human" | "ai" | null;
  stata_code?: string | null;
  python_code?: string | null;
  stata_source?: string | null; // path to the .do file the Stata code came from
  tex?: string | null;          // served path to the raw LaTeX source of a table
  archive?: boolean;
  author?: string;
  prompt?: string;
  summary?: string;
  artifacts?: string[];
  status?: string;
  source?: string | null;
  published?: boolean;
  featured?: boolean; // shown in the talk -> expanded by default
  progress?: { t: number; label: string; kind: string }[];
};
type Sub = { id: string; title: string; desc?: string; analyses?: Analysis[] };
type Photo = { src: string; caption?: string; source?: string | null };
type Section = {
  id: string; n: number | ""; title: string; intro?: string;
  photos?: Photo[]; analyses?: Analysis[]; subsections?: Sub[];
};

export default function Explorer() {
  const [sections, setSections] = useState<Section[]>([]);
  const [participant, setParticipant] = useState<any[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selId, setSelId] = useState<string>("design");
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [hidden, setHiddenSet] = useState<Set<string>>(new Set());
  const [curator, setCurator] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [itemOrder, setItemOrder] = useState<Record<string, string[]>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<{ cid: string; id: string } | null>(null);
  const [bulk, setBulk] = useState({ sig: 0, expand: true }); // expand/collapse-all signal
  const [navOpen, setNavOpen] = useState(false); // mobile outline drawer
  const [myName, setMyName] = useState(""); // viewer's name, to show their own unpublished work
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => setMyName((localStorage.getItem("explorer_name") || "").trim());
    read();
    window.addEventListener("explorer-name", read);
    return () => window.removeEventListener("explorer-name", read);
  }, []);

  useEffect(() => {
    fetch("/sections.json").then((r) => r.json()).then((d) => {
      setSections(d.sections);
      // expand every top-level section by default (first level only; subsections stay collapsed)
      const o: Record<string, boolean> = {};
      for (const s of d.sections) o[s.id] = true;
      setOpen(o);
    });
    setCurator(new URLSearchParams(window.location.search).has("curate"));
    fetch("/api/order").then((r) => r.json()).then((d) => {
      if (!d.ok) return;
      setOrder(d.order || []);
      setItemOrder(d.items || {});
    });
  }, []);

  const loadHidden = () =>
    fetch("/api/hidden").then((r) => r.json()).then((d) => d.ok && setHiddenSet(new Set(d.hidden)));
  useEffect(() => {
    loadHidden();
    const t = setInterval(loadHidden, 5000);
    return () => clearInterval(t);
  }, []);

  const toggleHide = (id: string, hide: boolean) => {
    setHiddenSet((s) => {
      const n = new Set(s);
      if (hide) n.add(id); else n.delete(id);
      return n;
    });
    fetch("/api/hidden", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, hidden: hide }) }).catch(() => {});
  };

  const loadParticipant = () =>
    fetch("/api/gallery").then((r) => r.json()).then((d) => {
      if (d.ok) setParticipant(d.analyses.filter((a: any) => a.section));
    });
  useEffect(() => {
    loadParticipant();
    const t = setInterval(loadParticipant, 4000);
    return () => clearInterval(t);
  }, []);

  const partBySection = useMemo(() => {
    const m: Record<string, Analysis[]> = {};
    for (const p of participant) {
      // a contribution is public only once published; until then only its author sees it
      if (!p.published && !(myName && p.author === myName)) continue;
      (m[p.section] ||= []).push({
        id: p.id, title: p.prompt?.slice(0, 70) || "Analysis", kind: "participant",
        author: p.author, prompt: p.prompt, summary: p.summary, artifacts: p.artifacts,
        status: p.status, progress: p.progress, published: p.published,
      });
    }
    return m;
  }, [participant, myName]);

  // apply saved curator order (unknown ids keep original position)
  const ordered = useMemo(() => {
    if (!order.length) return sections;
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...sections].sort((a, b) =>
      (pos.has(a.id) ? pos.get(a.id)! : 1e9) - (pos.has(b.id) ? pos.get(b.id)! : 1e9));
  }, [sections, order]);

  const num = (id: string) => ordered.findIndex((s) => s.id === id) + 1;
  const sel = ordered.find((s) => s.id === selId) || ordered[0];

  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(scrollTo);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setScrollTo(null);
  }, [scrollTo, selId]);

  const pick = (sectionId: string, domId?: string) => {
    setSelId(sectionId);
    setOpen((o) => ({ ...o, [sectionId]: true }));
    if (domId) setScrollTo(domId);
    else viewerRef.current?.scrollTo({ top: 0 });
    setNavOpen(false); // close the mobile drawer after choosing
  };

  const reorder = (drag: string, target: string) => {
    if (drag === target) return;
    const ids = ordered.map((s) => s.id).filter((x) => x !== drag);
    const at = ids.indexOf(target);
    ids.splice(at, 0, drag);
    setOrder(ids);
    fetch("/api/order", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: ids }) }).catch(() => {});
  };

  // ----- per-container item ordering (drag display items within a section/subsection) -----
  const ordItems = (cid: string, analyses: Analysis[]) => {
    const ord = itemOrder[cid];
    if (!ord || !ord.length) return analyses;
    const pos = new Map(ord.map((id, i) => [id, i]));
    return [...analyses].sort((a, b) =>
      (pos.has(a.id) ? pos.get(a.id)! : 1e9) - (pos.has(b.id) ? pos.get(b.id)! : 1e9));
  };
  const reorderItem = (cid: string, drag: string, target: string, analyses: Analysis[]) => {
    if (drag === target) return;
    const ids = ordItems(cid, analyses).map((a) => a.id).filter((x) => x !== drag);
    const at = ids.indexOf(target);
    ids.splice(at < 0 ? ids.length : at, 0, drag);
    const next = { ...itemOrder, [cid]: ids };
    setItemOrder(next);
    fetch("/api/order", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: next }) }).catch(() => {});
  };
  // a draggable sidebar row for a curated display item (table/figure/pdf)
  const itemRow = (a: Analysis, cid: string, list: Analysis[], sectionId: string, nested: boolean) => (
    <div key={cid + a.id}
      className={"sb-item" + (nested ? " nested" : "") +
        (dragItem && dragItem.cid === cid && dragItem.id === a.id ? " dragging" : "")}
      draggable
      onDragStart={(e) => { e.stopPropagation(); setDragItem({ cid, id: a.id }); }}
      onDragEnd={(e) => { e.stopPropagation(); setDragItem(null); }}
      onDragOver={(e) => { if (dragItem && dragItem.cid === cid) { e.preventDefault(); e.stopPropagation(); } }}
      onDrop={(e) => { if (dragItem && dragItem.cid === cid) { e.stopPropagation(); reorderItem(cid, dragItem.id, a.id, list); } setDragItem(null); }}
      onClick={() => pick(sectionId, "a-" + a.id)}>
      <span className="sb-grip mini" title="drag to reorder">⠿</span>{ic(a.kind)} {a.title}
    </div>
  );

  if (!sel) return <div className="viewer"><p className="muted">Loading…</p></div>;

  return (
    <div className="explorer">
      <button className="navtoggle" onClick={() => setNavOpen((v) => !v)} aria-label="toggle outline">
        ☰ <span>{sel.title}</span>
      </button>
      {navOpen && <div className="navscrim" onClick={() => setNavOpen(false)} />}
      <aside className={"sidebar" + (navOpen ? " open" : "")}>
        <div className="sb-title">Results outline{curator && <span className="curtag"> · curator</span>}</div>
        {ordered.map((s) => {
          const subs = s.subsections || [];
          const direct = s.analyses || [];
          const part = partBySection[s.id] || [];
          const hasChildren = subs.length + direct.length + part.length > 0 || s.id === "raw";
          const isOpen = open[s.id];
          return (
            <div key={s.id} className={"sb-sec" + (dragId === s.id ? " dragging" : "")}
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={() => { if (dragId) reorder(dragId, s.id); setDragId(null); }}>
              <div className={`sb-sechead ${selId === s.id ? "active" : ""}`}
                onClick={() => {
                  setSelId(s.id);
                  viewerRef.current?.scrollTo({ top: 0 });
                  if (hasChildren) setOpen((o) => ({ ...o, [s.id]: !o[s.id] }));
                  else setNavOpen(false); // leaf section: close the mobile drawer
                }}>
                <span className="sb-grip" title="drag to reorder">⠿</span>
                <span className="sb-caret">{hasChildren ? (isOpen ? "▾" : "▸") : ""}</span>
                <span className="sb-n">{num(s.id)}.</span>
                <span className="sb-sectitle">{s.title}</span>
              </div>
              {isOpen && (
                <div className="sb-children">
                  {ordItems("sec:" + s.id, direct).map((a) => itemRow(a, "sec:" + s.id, direct, s.id, false))}
                  {subs.map((sub) => {
                    const subKids = (sub.analyses || []).length;
                    const subOpen = open["sub:" + sub.id];
                    const showKids = s.id !== "other" && subKids > 0;
                    return (
                      <div key={sub.id} className="sb-subgroup">
                        <div className="sb-sub-item" onClick={() => {
                          pick(s.id, "sub-" + sub.id);
                          if (showKids) setOpen((o) => ({ ...o, ["sub:" + sub.id]: !o["sub:" + sub.id] }));
                        }}>
                          <span className="sb-caret sub">{showKids ? (subOpen ? "▾" : "▸") : ""}</span>
                          {sub.title}{s.id === "other" ? ` (${subKids})` : ""}
                        </div>
                        {showKids && subOpen && ordItems("sub:" + sub.id, sub.analyses || []).map((a) => itemRow(a, "sub:" + sub.id, sub.analyses || [], s.id, true))}
                      </div>
                    );
                  })}
                  {part.map((a) => (
                    <div key={a.id} className="sb-item part" onClick={() => pick(s.id, "a-" + a.id)}>
                      {a.status === "running" ? <span className="spin" /> : "★"} {a.author}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="sb-hint">Drag the ⠿ handle to reorder sections — or items within a section.</div>
      </aside>

      <section className="viewer" ref={viewerRef}>
        <div className="vwrap">
          <h1>{num(sel.id)}. {sel.title}</h1>
          {sel.intro && <Rich text={sel.intro} />}
          {sel.photos && sel.photos.length > 0 && <PhotoGallery photos={sel.photos} />}

          {sel.id === "raw" && (
            <>
              <p className="muted" style={{ marginTop: 6 }}>
                Click any column header to sort. Use the filters to narrow rows or columns; each column
                shows its description and non-null count.
              </p>
              <div className="dlrow" style={{ margin: "10px 0 4px" }}>
                <a className="pill" href="/api/dataset?download=1" download="dataset.csv">
                  ⬇ Download raw dataset (CSV)
                </a>
              </div>
              <DataTable />
            </>
          )}
          {(() => {
            const label = `${num(sel.id)}. ${sel.title}`;
            const seen = new Set<string>();
            const block = (a: Analysis) => {
              if (seen.has(a.id)) return null;
              seen.add(a.id);
              return (
                <AnalysisBlock key={a.id} a={a} hidden={hidden.has(a.id)} curator={curator}
                  onToggleHide={() => toggleHide(a.id, !hidden.has(a.id))}
                  onChanged={loadParticipant} myName={myName}
                  bulkSig={bulk.sig} bulkExpand={bulk.expand} />
              );
            };
            const allA = [...(sel.analyses || []),
              ...(sel.subsections || []).flatMap((s) => s.analyses || []),
              ...(partBySection[sel.id] || [])];
            const hasCollapsible = allA.some((a) => a.archive || a.kind === "pdf") || allA.length > 3;
            return (
              <>
                {hasCollapsible && (
                  <div className="bulkbar">
                    <button className="btn ghost" onClick={() => setBulk((b) => ({ sig: b.sig + 1, expand: true }))}>▾ Expand all</button>
                    <button className="btn ghost" onClick={() => setBulk((b) => ({ sig: b.sig + 1, expand: false }))}>▸ Collapse all</button>
                  </div>
                )}
                {ordItems("sec:" + sel.id, sel.analyses || []).map(block)}
                {(sel.subsections || []).map((sub) => (
                  <div key={sub.id} className="subsec">
                    <h2 id={"sub-" + sub.id} className="subhead">{sub.title}</h2>
                    {sub.desc && <Rich text={sub.desc} />}
                    {ordItems("sub:" + sub.id, sub.analyses || []).map(block)}
                  </div>
                ))}
                {(partBySection[sel.id] || []).map(block)}
                {sel.id !== "other" && sel.id !== "raw" &&
                  <InlineAdd sectionId={sel.id} sectionLabel={label} onSubmitted={loadParticipant} />}
              </>
            );
          })()}
        </div>
      </section>
    </div>
  );
}

function ic(k: string) {
  return k === "figure" ? "📊" : k === "table" ? "▦" : k === "pdf" ? "📄" : k === "participant" ? "★" : "•";
}

// Session photo gallery with a click-to-enlarge lightbox.
function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="photogrid">
        {photos.map((p, i) => (
          <figure key={p.src} className="photo" onClick={() => setOpen(i)}>
            <img src={p.src} alt={p.caption || "session photo"} loading="lazy" />
            {p.caption && <figcaption>{p.caption}{p.source && <span className="srcpath"><span className="srclbl">Source</span> <code>{p.source}</code></span>}</figcaption>}
          </figure>
        ))}
      </div>
      {open != null && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <img src={photos[open].src} alt={photos[open].caption || ""} />
          {photos[open].caption && <p>{photos[open].caption}</p>}
          <a className="lb-dl" href={photos[open].src} download onClick={(e) => e.stopPropagation()}>⬇ Download photo</a>
        </div>
      )}
    </>
  );
}

function ProvBadge({ a }: { a: Analysis }) {
  if (a.kind === "pdf") return null; // documents aren't "Stata" analyses
  if (a.kind === "participant") return <span className="prov ai">🤖 AI</span>;
  if (a.provenance === "human") return <span className="prov human">👤 Human · Stata</span>;
  return null;
}

// Download link for a displayed artifact (PDF, Word doc, figure/table image).
function downloadFor(src?: string | null): { url: string; label: string } | null {
  if (!src) return null;
  if (src.endsWith(".html")) return { url: src.replace(/\.html$/, ".docx"), label: "Download Word (.docx)" };
  if (src.endsWith(".pdf")) return { url: src, label: "Download PDF" };
  if (/\.(png|jpe?g|svg)$/i.test(src)) return { url: src, label: "Download image" };
  return { url: src, label: "Download" };
}

// Label for a display item's source path, so it's distinct from the code path.
function srcLabel(a: Analysis): string {
  if (a.src?.startsWith("/stata/tab")) return "Table source";
  if (a.kind === "figure") return "Figure source";
  if (a.kind === "pdf") return "Document source";
  return "Source file";
}

function AnalysisBlock({ a, hidden, curator, onToggleHide, onChanged, myName, bulkSig, bulkExpand }: {
  a: Analysis; hidden: boolean; curator: boolean; onToggleHide: () => void;
  onChanged?: () => void; myName?: string; bulkSig: number; bulkExpand: boolean;
}) {
  // the author sees their own contribution before it's published; flag that it's private
  const ownedUnpublished = a.kind === "participant" && !a.published && !!myName && a.author === myName;
  // Only the figures/tables shown in the talk (featured) are expanded by default;
  // every other figure/table — plus PDFs and hidden items — starts collapsed.
  // Audience-run (participant) analyses keep their own default so live runs show.
  const isFigTable = a.kind === "figure" || a.kind === "table";
  const collapsedByDefault =
    hidden || a.kind === "pdf" || (isFigTable && !a.featured);
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const [rev, setRev] = useState(0); // bumped after a re-run to cache-bust regenerated images
  useEffect(() => { if (bulkSig > 0) setExpanded(bulkExpand); }, [bulkSig]); // expand/collapse all
  const pngs = (a.artifacts || []).filter((f) => /\.(png|jpg|jpeg|svg)$/i.test(f));
  const pys = (a.artifacts || []).filter((f) => /\.py$/i.test(f));
  const dos = (a.artifacts || []).filter((f) => /\.do$/i.test(f));
  const data = (a.artifacts || []).filter((f) => /\.(csv|md|txt)$/i.test(f));
  const bust = (f: string) => `/api/artifact/${f}${rev ? `?rev=${rev}` : ""}`;
  const titleText = a.kind === "participant" ? `${a.author}: ${a.title}` : a.title;

  return (
    <article id={"a-" + a.id} className={"ablock" + (hidden ? " hiddenitem" : "") + (a.archive ? " archiveitem" : "")}>
      <div className="ahead">
        <button className="atoggle" onClick={() => setExpanded((e) => !e)} aria-label="toggle">
          {expanded ? "▾" : "▸"}
        </button>
        <h2 className="atitle" onClick={() => setExpanded((e) => !e)}>
          {a.kind === "participant" ? <span className="star">★</span> : null}
          {titleText}
          <ProvBadge a={a} />
          {hidden && <span className="prov hide">🚫 obsolete (hidden)</span>}
          {ownedUnpublished && <span className="prov hide" title="Only you can see this until you publish it">🔒 not published</span>}
          {a.status === "running" && <span className="running"><span className="spin" /> running…</span>}
        </h2>
        {curator && a.kind !== "participant" && (
          <button className="curbtn" onClick={(e) => { e.stopPropagation(); onToggleHide(); }}>
            {hidden ? "Unhide" : "Hide"}
          </button>
        )}
        {a.kind === "participant" && (
          <AnalysisControls id={a.id} status={a.status} author={a.author}
            prompt={a.prompt} published={a.published}
            onStopped={onChanged} onDeleted={onChanged} onModified={onChanged} onPublished={onChanged} />
        )}
      </div>

      {expanded && (
        <div className="abody">
          {a.kind === "participant" && a.prompt && <p className="prompt">“{a.prompt}”</p>}
          {a.kind === "participant" && a.status === "running" && <ProgressLog steps={a.progress} />}

          {a.kind === "pdf" && a.src && (
            a.src.toLowerCase().endsWith(".pdf")
              ? <PdfView src={a.src} />
              : <iframe className="pdfframe" src={a.src} title={a.title} />
          )}
          {(a.kind === "figure" || a.kind === "table") && (() => {
            const isTable = a.src ? a.src.startsWith("/stata/tab") : !!a.tex;
            if (isTable) {
              // render the table from its LaTeX; fall back to the PNG if that fails
              const png = a.src ? <div className="tabwrap"><img src={a.src} alt={a.title} /></div> : null;
              return a.tex ? <TexTable tex={a.tex} fallback={png} /> : png;
            }
            return a.src ? <img className="bigfig" src={a.src} alt={a.title} /> : null;
          })()}
          {pngs.map((f) => <img key={f + rev} className="bigfig" src={bust(f)} alt={a.title} />)}
          {a.table && <TableView t={a.table} />}

          {a.kind !== "participant" && (a.src || a.tex) && (() => {
            const dl = a.src ? downloadFor(a.src) : null;
            return (
              <div className="dlrow">
                {dl && <a className="pill" href={dl.url} download>⬇ {dl.label}</a>}
                {a.tex && <a className="pill" href={a.tex} download>⬇ Download LaTeX (.tex)</a>}
              </div>
            );
          })()}

          {a.writeup && a.kind !== "participant" && <Rich text={a.writeup} />}
          {a.source && a.kind !== "participant" && (
            <p className="srcpath"><span className="srclbl">{srcLabel(a)}</span> <code>{a.source}</code></p>
          )}
          {a.kind === "participant" && a.summary && <p className="psummary">{a.summary}</p>}

          {a.stata_code && (
            <details className="codebox" open>
              <summary>
                {a.provenance === "ai"
                  ? <>Stata equivalent <span className="prov ai">🤖 AI</span></>
                  : <>Stata code — original <span className="prov human">👤 Human</span></>}
              </summary>
              <Code code={a.stata_code} language="stata" />
              {a.stata_source && (
                <p className="srcpath codesrc"><span className="srclbl">{a.provenance === "ai" ? "Source" : "Stata code"}</span> <code>{a.stata_source}</code></p>
              )}
            </details>
          )}
          {a.python_code && (
            <details className="codebox">
              <summary>
                {a.provenance === "ai"
                  ? <>Python — implementation <span className="prov ai">🤖 AI</span></>
                  : <>Python translation <span className="prov ai">🤖 AI</span></>}
              </summary>
              <Code code={a.python_code} language="python" />
            </details>
          )}
          {a.code && (
            <details className="codebox" open>
              <summary>Analysis script (Python)</summary>
              <Code code={a.code} />
            </details>
          )}
          {pys.map((f) => (
            <EditableScript key={f} id={a.id} file={f} language="python"
              onRan={() => setRev((r) => r + 1)} />
          ))}
          {dos.map((f) => (
            <EditableScript key={f} id={a.id} file={f} language="stata" />
          ))}
          {data.length > 0 && (
            <div className="dlrow">
              {data.map((f) => (
                <a key={f} className="pill" href={bust(f)} target="_blank">⬇ {f.split("/").pop()}</a>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function TableView({ t }: { t: { columns: string[]; rows: string[][] } }) {
  return (
    <div className="tablewrap">
      <table>
        <thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j} className={j === 0 ? "lab" : "mono"}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Inline "add your own analysis" form (no page navigation). The contributor's name
// comes from the session-wide name widget in the header (not entered here).
function InlineAdd({ sectionId, sectionLabel, onSubmitted }: {
  sectionId: string; sectionLabel: string; onSubmitted: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [poster, setPoster] = useState("");

  useEffect(() => {
    const read = () => setPoster((localStorage.getItem("explorer_name") || "").trim());
    read();
    window.addEventListener("explorer-name", read);
    return () => window.removeEventListener("explorer-name", read);
  }, []);

  const submit = async () => {
    const name = (localStorage.getItem("explorer_name") || "").trim();
    if (!name) return setNote("Enter your name in the top-right corner first.");
    if (!prompt.trim()) return setNote("Describe the analysis you want.");
    setBusy(true); setNote(null);
    const r = await fetch("/api/analyze", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, prompt, section: sectionId, section_label: sectionLabel }),
    }).then((r) => r.json()).catch(() => ({ ok: false, reason: "network error" }));
    setBusy(false);
    if (!r.ok) return setNote(r.reason || "Could not start.");
    setPrompt("");
    setNote("Submitted — it'll appear below in a moment, visible only to you until you Publish it.");
    onSubmitted();
  };

  return (
    <div className="inlineadd">
      <div className="inlineadd-h">+ Add your own analysis to this section</div>
      <textarea placeholder="Describe the analysis in plain English — Claude runs it on the de-identified data."
        value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {note || (poster ? `Posting as ${poster}` : "Set your name in the top-right to contribute.")}
        </span>
        <button onClick={submit} disabled={busy}>
          {busy ? <><span className="spin" /> Running…</> : "Run analysis"}
        </button>
      </div>
    </div>
  );
}
