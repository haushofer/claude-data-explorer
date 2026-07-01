"use client";
import { useEffect, useMemo, useRef, useState } from "react";

const ROW_H = 30;          // px per body row (must match CSS)
const OVERSCAN = 8;        // extra rows above/below viewport

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

type Dict = Record<string, { description: string; non_null: number }>;

export default function DataTable() {
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [dict, setDict] = useState<Dict>({});
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [q, setQ] = useState("");            // row filter
  const [colQ, setColQ] = useState("");      // column filter
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(560);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/dataset").then((r) => r.text()),
      fetch("/api/dictionary").then((r) => r.json()).catch(() => ({})),
    ]).then(([txt, d]) => {
      const lines = txt.split("\n").filter((l) => l.length);
      setColumns(splitCsv(lines[0]));
      setRows(lines.slice(1).map(splitCsv));
      setDict(d);
      setLoading(false);
    });
  }, []);

  // numeric detection per column
  const numericCols = useMemo(() => {
    const isNum = columns.map(() => true);
    for (let j = 0; j < columns.length; j++) {
      let seen = 0;
      for (let i = 0; i < rows.length && seen < 25; i++) {
        const v = rows[i][j];
        if (v === "" || v == null) continue;
        seen++;
        if (isNaN(Number(v))) { isNum[j] = false; break; }
      }
    }
    return isNum;
  }, [columns, rows]);

  // which columns to show (original indices), filtered by name OR description
  const visibleCols = useMemo(() => {
    const idx = columns.map((_, j) => j);
    if (!colQ.trim()) return idx;
    const n = colQ.toLowerCase();
    return idx.filter((j) =>
      columns[j].toLowerCase().includes(n) ||
      (dict[columns[j]]?.description || "").toLowerCase().includes(n)
    );
  }, [columns, dict, colQ]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => r.some((c) => c.toLowerCase().includes(needle)));
  }, [rows, q]);

  const sorted = useMemo(() => {
    if (sortCol == null) return filtered;
    const j = sortCol, num = numericCols[j], dir = sortDir;
    const arr = filtered.slice();
    arr.sort((a, b) => {
      const av = a[j], bv = b[j];
      const ae = av === "" || av == null, be = bv === "" || bv == null;
      if (ae && be) return 0;
      if (ae) return 1;
      if (be) return -1;
      if (num) return (Number(av) - Number(bv)) * dir;
      return av.localeCompare(bv) * dir;
    });
    return arr;
  }, [filtered, sortCol, sortDir, numericCols]);

  const onSort = (j: number) => {
    if (sortCol === j) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortCol(j); setSortDir(1); }
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const total = sorted.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const visible = sorted.slice(start, end);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, [loading]);

  if (loading) return <p className="muted" style={{ marginTop: 18 }}><span className="spin" /> loading dataset…</p>;

  return (
    <div className="dt">
      <div className="dt-bar">
        <input className="dt-search" placeholder="Filter rows…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="dt-search" placeholder="Filter columns…" value={colQ} onChange={(e) => setColQ(e.target.value)} />
        <span className="muted">
          {total.toLocaleString()}{q ? ` of ${rows.length.toLocaleString()}` : ""} rows ·{" "}
          {visibleCols.length}{colQ ? ` of ${columns.length}` : ""} columns
        </span>
        {sortCol != null && <button className="btn ghost dt-clear" onClick={() => setSortCol(null)}>clear sort</button>}
      </div>

      <div className="dt-scroll" ref={scrollRef}>
        <table className="dt-table">
          <thead>
            <tr>
              {visibleCols.map((j) => (
                <th key={columns[j]} onClick={() => onSort(j)}
                  className={`${numericCols[j] ? "num" : ""} ${sortCol === j ? "sorted" : ""}`}>
                  <div className="dt-h">
                    <span className="dt-name">{columns[j]}</span>
                    <span className="dt-arrow">{sortCol === j ? (sortDir === 1 ? "▲" : "▼") : "↕"}</span>
                  </div>
                  <div className="dt-desc">{dict[columns[j]]?.description || ""}</div>
                  <div className="dt-nn">
                    {dict[columns[j]] != null ? `${dict[columns[j]].non_null.toLocaleString()} non-null` : ""}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: start * ROW_H }} aria-hidden />
            {visible.map((r, i) => (
              <tr key={start + i}>
                {visibleCols.map((j) => (
                  <td key={j} className={numericCols[j] ? "num" : ""}>{r[j]}</td>
                ))}
              </tr>
            ))}
            <tr style={{ height: (total - end) * ROW_H }} aria-hidden />
          </tbody>
        </table>
      </div>
    </div>
  );
}
