"use client";
import { useEffect, useState, ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { parseTexTable, TRow } from "@/lib/textable";

// Render one esttab cell's LaTeX as HTML. Content comes from the repo's curated
// Stata .tex deliverables (trusted), so dangerouslySetInnerHTML is safe here.
function texInline(raw: string): string {
  let s = raw;
  // Protect $…$ math behind a sentinel so the text replacements below can't touch
  // it, and so the placeholder can't collide with real data numbers like 0.08.
  const math: string[] = [];
  s = s.replace(/\$([^$]*)\$/g, (_m, m) => `@@M${math.push(m) - 1}@@`);
  s = s.replace(/\\specialcell(?:\[[^\]]*\])?\{([\s\S]*?)\}/g, "$1"); // multi-line header
  s = s.replace(/\\emph\{([^{}]*)\}/g, "<em>$1</em>");
  s = s.replace(/\\textbf\{([^{}]*)\}/g, "<strong>$1</strong>");
  s = s.replace(/\\textit\{([^{}]*)\}/g, "<em>$1</em>");
  s = s.replace(/\\&/g, "&");
  s = s.replace(/\\[,:;!> ]/g, " ").replace(/~/g, " "); // spacing macros
  s = s.replace(/\\\\/g, "<br>"); // line breaks inside specialcell
  s = s.replace(/\{([^{}]*)\}/g, "$1"); // braced plain values, e.g. {524}
  s = s.replace(/\^\{([^{}]*)\}/g, "<sup>$1</sup>"); // bare superscript stars
  s = s.replace(/\\[a-zA-Z]+/g, ""); // drop any leftover commands (\sym, …)
  s = s.replace(/@@M(\d+)@@/g, (_m, i) => {
    try { return katex.renderToString(math[+i], { throwOnError: false, displayMode: false }); }
    catch { return math[+i]; }
  });
  return s.trim();
}

// Render an esttab LaTeX table as real HTML (so it shows even where the PNG
// doesn't, and works for tables that have no PNG). Falls back to `fallback`
// (the PNG) if the .tex can't be fetched or parsed.
export default function TexTable({ tex, fallback }: { tex: string; fallback: ReactNode }) {
  const [rows, setRows] = useState<TRow[] | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    let live = true;
    fetch(tex)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch"))))
      .then((t) => { if (live) setRows(parseTexTable(t)); })
      .catch(() => { if (live) setRows(null); });
    return () => { live = false; };
  }, [tex]);

  if (rows === undefined)
    return <div className="textable-wrap"><p className="muted" style={{ padding: 10 }}>Loading table…</p></div>;
  if (!rows || rows.length === 0) return <>{fallback}</>;

  const width = Math.max(...rows.map((r) => r.cells.reduce((a, c) => a + c.colspan, 0)));

  return (
    <div className="textable-wrap">
      <table className="textable">
        <tbody>
          {rows.map((r, i) => {
            if (r.kind === "panel") {
              const label = r.cells.find((c) => c.raw !== "")?.raw ?? "";
              return (
                <tr key={i} className="tt-panel">
                  <td colSpan={width} dangerouslySetInnerHTML={{ __html: texInline(label) }} />
                </tr>
              );
            }
            const head = r.kind === "head";
            return (
              <tr key={i} className={head ? "tt-head" : "tt-body"}>
                {r.cells.map((c, j) => {
                  const cls = "tt-" + (j === 0 ? "label" : c.align);
                  const html = { __html: texInline(c.raw) };
                  return head
                    ? <th key={j} colSpan={c.colspan} className={cls} dangerouslySetInnerHTML={html} />
                    : <td key={j} colSpan={c.colspan} className={cls} dangerouslySetInnerHTML={html} />;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
