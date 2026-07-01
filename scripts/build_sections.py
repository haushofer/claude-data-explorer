#!/usr/bin/env python3
"""Generate web/public/sections.json from content/sections.json + the Stata manifest.

You author `content/sections.json` — a list of sections. Inside a section's
"analyses" you can reference compiled Stata outputs by name:

    {"table": "my_table"}     -> renders web/public/stata/tab/my_table.tex (live LaTeX)
    {"figure": "my_figure"}   -> shows   web/public/stata/fig/my_figure.<png|svg|...>

Extra keys on a reference (e.g. "writeup", "title") are kept. Any tables/figures
in the manifest that you did NOT place are collected into auto-generated "Tables"
and "Figures" sections so nothing is lost. Sections with no "analyses" (or an
empty list) just render their Markdown "intro"; the section with id "raw" also
renders the interactive data table.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content", "sections.json")
STATA = os.path.join(ROOT, "web", "public", "stata")
MANIFEST = os.path.join(STATA, "manifest.json")
OUT = os.path.join(ROOT, "web", "public", "sections.json")

manifest = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {"tables": [], "figures": []}
tab_by = {t["name"]: t for t in manifest.get("tables", [])}
fig_by = {f["name"]: f for f in manifest.get("figures", [])}


def tab_analysis(name):
    has_png = os.path.exists(os.path.join(STATA, "tab", name + ".png"))
    return {"id": "tab__" + name, "title": name, "kind": "table",
            "src": f"/stata/tab/{name}.png" if has_png else None,
            "tex": f"/stata/tab/{name}.tex", "provenance": "human"}


def fig_analysis(name):
    file = fig_by.get(name, {}).get("file", name + ".png")
    return {"id": "fig__" + name, "title": name, "kind": "figure",
            "src": f"/stata/fig/{file}", "provenance": "human"}


used_tab, used_fig, missing = set(), set(), []


def resolve(analyses):
    out = []
    for a in analyses or []:
        if isinstance(a, dict) and "table" in a:
            n = a["table"]; used_tab.add(n)
            if n not in tab_by:
                missing.append(f"table '{n}'")
            out.append({**tab_analysis(n), **{k: v for k, v in a.items() if k != "table"}})
        elif isinstance(a, dict) and "figure" in a:
            n = a["figure"]; used_fig.add(n)
            if n not in fig_by:
                missing.append(f"figure '{n}'")
            out.append({**fig_analysis(n), **{k: v for k, v in a.items() if k != "figure"}})
        else:
            out.append(a)  # inline analysis (pdf/photo/etc.) passed through unchanged
    return out


sections = json.load(open(CONTENT)) if os.path.exists(CONTENT) else []
for s in sections:
    if "analyses" in s:
        s["analyses"] = resolve(s["analyses"])
    for sub in s.get("subsections", []) or []:
        if "analyses" in sub:
            sub["analyses"] = resolve(sub["analyses"])

leftover_tabs = [tab_analysis(n) for n in tab_by if n not in used_tab]
leftover_figs = [fig_analysis(n) for n in fig_by if n not in used_fig]
if leftover_tabs:
    sections.append({"id": "all_tables", "n": "", "title": "Tables",
                     "intro": "Compiled Stata tables not explicitly placed in a section above.",
                     "analyses": leftover_tabs})
if leftover_figs:
    sections.append({"id": "all_figures", "n": "", "title": "Figures",
                     "intro": "Exported figures not explicitly placed in a section above.",
                     "analyses": leftover_figs})

with open(OUT, "w") as fh:
    json.dump(sections, fh, indent=2, ensure_ascii=False)

print(f"wrote {OUT}: {len(sections)} sections | "
      f"tables {len(tab_by)} ({len(leftover_tabs)} auto) | figures {len(fig_by)} ({len(leftover_figs)} auto)")
if missing:
    print("WARNING: referenced but not found in manifest -> " + ", ".join(missing) +
          "  (run scripts/build_manifest.py after adding the files)")
