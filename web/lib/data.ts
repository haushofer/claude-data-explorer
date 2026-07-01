import fs from "fs";
import path from "path";
import { DATA_DIR } from "./config";
import { DATASET } from "./site.config";

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "anon"
  );
}

export function readDictionary(): { column: string; description: string; non_null: number }[] {
  const md = fs.readFileSync(path.join(DATA_DIR, "data_dictionary.csv"), "utf8");
  const lines = md.trim().split("\n").slice(1);
  return lines.map((l) => {
    // naive CSV split is fine: descriptions here contain no commas-in-quotes
    const [column, description, non_null] = splitCsv(l);
    return { column, description, non_null: Number(non_null) };
  });
}

// Return the first `n` data rows as objects for the explorer table.
export function readSampleRows(n: number): { columns: string[]; rows: string[][] } {
  const csv = fs.readFileSync(path.join(DATA_DIR, DATASET.file), "utf8");
  const lines = csv.split("\n").filter((l) => l.length);
  const columns = splitCsv(lines[0]);
  const rows = lines.slice(1, 1 + n).map(splitCsv);
  return { columns, rows };
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}
