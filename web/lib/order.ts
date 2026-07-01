import fs from "fs";
import path from "path";

// Curator-controlled ordering, shared with everyone viewing the site.
//   sections: array of section ids (top-level order)
//   items:    { [containerId]: orderedAnalysisIds[] }  — order of display items
//             within a section ("sec:<id>") or subsection ("sub:<id>")
const STORE = path.join(process.cwd(), "order.json");

type Store = { sections: string[]; items: Record<string, string[]> };

function read(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
    if (Array.isArray(raw)) return { sections: raw, items: {} }; // legacy: bare array
    return { sections: raw.sections ?? [], items: raw.items ?? {} };
  } catch {
    return { sections: [], items: {} };
  }
}

function write(s: Store) {
  fs.writeFileSync(STORE, JSON.stringify(s));
}

export function getOrder(): string[] {
  return read().sections;
}

export function setOrder(ids: string[]): string[] {
  const s = read();
  s.sections = ids;
  write(s);
  return ids;
}

export function getItemOrder(): Record<string, string[]> {
  return read().items;
}

export function setItemOrder(items: Record<string, string[]>): Record<string, string[]> {
  const s = read();
  s.items = items;
  write(s);
  return items;
}
