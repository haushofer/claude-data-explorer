import fs from "fs";
import path from "path";

// Curator-controlled set of analysis ids marked obsolete/hidden. Server-side so the
// curated (collapsed) state is shared with everyone viewing the site.
const STORE = path.join(process.cwd(), "hidden.json");

export function getHidden(): string[] {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return [];
  }
}

export function setHidden(id: string, hidden: boolean): string[] {
  const s = new Set(getHidden());
  if (hidden) s.add(id);
  else s.delete(id);
  const arr = [...s];
  fs.writeFileSync(STORE, JSON.stringify(arr));
  return arr;
}
