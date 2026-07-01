// Parse an esttab LaTeX table fragment (booktabs + siunitx S columns, as exported
// by Stata's esttab) into rows of cells, so the site can render the table as real
// HTML instead of relying on a pre-rendered PNG. Pure string processing — no DOM,
// no KaTeX — so it can be unit-tested in Node. The component does the per-cell
// LaTeX→HTML rendering (KaTeX for $…$).

export type TAlign = "left" | "center" | "right";
export type TCell = { raw: string; colspan: number; align: TAlign };
export type TRow = { kind: "head" | "panel" | "body"; cells: TCell[] };

// Index just past the brace group that starts at s[i] === "{".
function skipBraceGroup(s: string, i: number): number {
  if (s[i] !== "{") return i;
  let depth = 0;
  for (; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return i;
}

// Content of the n-th (1-based) brace group found at/after index i.
function nthBraceContent(s: string, i: number, n: number): { content: string; end: number } {
  let start = i;
  for (let k = 0; k < n; k++) {
    while (start < s.length && s[start] !== "{") start++;
    const end = skipBraceGroup(s, start);
    if (k === n - 1) return { content: s.slice(start + 1, end - 1), end };
    start = end;
  }
  return { content: "", end: start };
}

// Split a row on unescaped & (esttab uses \& for a literal ampersand).
function splitCells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "&") { cur += "\\&"; i++; continue; }
    if (line[i] === "&") { out.push(cur); cur = ""; continue; }
    cur += line[i];
  }
  out.push(cur);
  return out;
}

function parseCell(raw: string): TCell {
  let s = raw.trim();
  let colspan = 1;
  let align: TAlign = "right";
  if (s.startsWith("\\multicolumn")) {
    const m = s.match(/^\\multicolumn\s*\{(\d+)\}\s*\{([^}]*)\}/);
    if (m) {
      colspan = parseInt(m[1], 10) || 1;
      const a = m[2];
      align = a.includes("l") ? "left" : a.includes("r") ? "right" : "center";
      const { content } = nthBraceContent(s, "\\multicolumn".length, 3);
      s = content;
    }
  }
  return { raw: s.trim(), colspan, align };
}

const RULE_ONLY = /^(\\(hline|toprule|bottomrule|midrule|cmidrule\b\(?[^){]*\)?\{[^}]*\}|cline\{[^}]*\})\s*)+$/;

export function parseTexTable(tex: string): TRow[] | null {
  const bi = tex.indexOf("\\begin{tabular}");
  const ei = tex.indexOf("\\end{tabular}");
  if (bi < 0 || ei < 0 || ei < bi) return null;

  // Skip the column-spec argument: \begin{tabular}{ l*{8}{SSS} }
  let i = bi + "\\begin{tabular}".length;
  while (i < ei && tex[i] !== "{") i++;
  i = skipBraceGroup(tex, i);

  const rows: TRow[] = [];
  for (let line of tex.slice(i, ei).split("\n")) {
    line = line.trim();
    if (!line || RULE_ONLY.test(line)) continue;

    // A row may be prefixed by \midrule / \hline (panel separators).
    let panelPrefix = false;
    line = line.replace(/^(?:\\(hline|midrule)\s*)+/, (m) => {
      if (m.includes("midrule")) panelPrefix = true;
      return "";
    }).trim();
    if (!line) continue;

    // Drop the trailing \\ (and anything after it, e.g. a \cmidrule).
    const dbl = line.indexOf("\\\\");
    if (dbl >= 0) line = line.slice(0, dbl).trim();
    if (!line) continue;

    const cells = splitCells(line).map(parseCell);
    const first = cells[0]?.raw ?? "";
    const restNonEmpty = cells.slice(1).some((c) => c.raw !== "");

    let kind: TRow["kind"];
    if (first === "" && restNonEmpty) kind = "head"; // column-label rows have an empty stub cell
    else if (panelPrefix || (first !== "" && !restNonEmpty)) kind = "panel"; // a stressor-arm title
    else kind = "body";

    rows.push({ kind, cells });
  }
  return rows.length ? rows : null;
}
