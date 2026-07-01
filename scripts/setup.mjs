#!/usr/bin/env node
// Interactive first-time setup. Run from the repo root:  node scripts/setup.mjs
// (or `cd web && npm run setup`). Writes web/.env.local with your secrets and
// prints the remaining checklist. No dependencies.
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = join(ROOT, "web", ".env.local");
const rl = createInterface({ input: stdin, output: stdout });

const ask = async (q, def) => {
  const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
  return a || def || "";
};

console.log("\n  claude-data-explorer — setup\n  " + "-".repeat(30));

if (existsSync(ENV)) {
  const go = await ask("web/.env.local already exists. Overwrite? (y/N)", "N");
  if (go.toLowerCase() !== "y") { console.log("Left it untouched. Bye."); rl.close(); process.exit(0); }
}

const key   = await ask("Anthropic API key (sk-ant-...)");
const pass  = await ask("Site password (the join code you give visitors)", "changeme");
const py    = await ask("Path to a Python with pandas/numpy/matplotlib/seaborn", "/usr/bin/python3");
const port  = await ask("Port for the Next.js server", "3006");

writeFileSync(ENV,
  `ANTHROPIC_API_KEY=${key}\nSITE_PASSWORD=${pass}\nVENV_PYTHON=${py}\nPORT=${port}\n`,
  { mode: 0o600 });
console.log(`\n  ✓ wrote web/.env.local (chmod 600)`);

// friendly reminder about the dataset + config
const cfg = join(ROOT, "web", "lib", "site.config.ts");
const cfgTitle = existsSync(cfg) && /title:\s*"([^"]*)"/.exec(readFileSync(cfg, "utf8"))?.[1];
console.log(`
  Next steps:
   1. Put your dataset at        data/public/<your>.csv
      + a data_dictionary.csv    (columns: column,description,non_null)
      + a data_dictionary.md     (what the agent reads)
   2. Edit web/lib/site.config.ts  (currently title: "${cfgTitle || "Data Explorer"}")
      — set the title, the DATASET.file name, and the agent's DATASET.description.
   3. Rewrite web/public/sections.json to describe your data.
   4. Run it:   cd web && npm install && npm run dev
   5. Deploy:   see README.md and deploy/  (hardened, sandboxed).

  ⚠  Set a spend cap on your Anthropic API key — the agent runs on visitor requests.
`);
rl.close();
