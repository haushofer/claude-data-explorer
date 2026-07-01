#!/usr/bin/env python3
"""Scan web/public/stata/{tab,fig} into web/public/stata/manifest.json.

Tables are LaTeX fragments (`*.tex`, e.g. Stata `esttab` output); figures are
images (`*.png|jpg|jpeg|svg`). Run this after adding or changing Stata outputs,
then run build_sections.py. `npm run content` does both.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATA = os.path.join(ROOT, "web", "public", "stata")
TAB, FIG = os.path.join(STATA, "tab"), os.path.join(STATA, "fig")

tables = []
if os.path.isdir(TAB):
    for f in sorted(os.listdir(TAB)):
        if f.endswith(".tex"):
            name = f[:-4]
            tables.append({"id": name, "name": name, "relpath": f, "folder": "(root)", "ok": True})

figures = []
if os.path.isdir(FIG):
    for f in sorted(os.listdir(FIG)):
        if f.lower().endswith((".png", ".jpg", ".jpeg", ".svg")):
            figures.append({"id": os.path.splitext(f)[0], "name": os.path.splitext(f)[0], "file": f})

os.makedirs(STATA, exist_ok=True)
with open(os.path.join(STATA, "manifest.json"), "w") as fh:
    json.dump({"tables": tables, "figures": figures}, fh, indent=1)
print(f"manifest: {len(tables)} tables, {len(figures)} figures")
