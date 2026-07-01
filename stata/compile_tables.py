#!/usr/bin/env python3
"""OPTIONAL: compile Stata `esttab` LaTeX table fragments to cropped PNGs.

Tables already render live from their `.tex` on the site (via the in-browser
parser), so this step is only needed if you also want a pixel-perfect PNG
fallback / download. It requires a LaTeX install (`pdflatex`) and `pdftoppm`
(poppler).

  Input:  stata/tab_src/*.tex   (raw esttab fragments)
  Output: web/public/stata/tab/<name>.png  and  <name>.tex  (the raw source too)

esttab fragments use siunitx `S` columns and macros like \\sym and \\specialcell;
we neutralise those so they compile with a plain LaTeX install.
"""
import os, subprocess, shutil, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("STATA_TAB_SRC", os.path.join(ROOT, "stata", "tab_src"))
OUT = os.path.join(ROOT, "web", "public", "stata", "tab")
os.makedirs(OUT, exist_ok=True)

PREAMBLE = r"""\documentclass[border=10pt]{standalone}
\usepackage{booktabs}\usepackage{array}\usepackage{amsmath}\usepackage{amssymb}
\newcommand{\sym}[1]{\ensuremath{^{#1}}}
\newcommand{\specialcell}[2][c]{\begin{tabular}[#1]{@{}c@{}}#2\end{tabular}}
\AtBeginDocument{\def\:{\space}}
\begin{document}\footnotesize
"""
POSTAMBLE = "\n\\end{document}\n"


def fix_tabular_spec(tex: str) -> str:
    """Replace a siunitx S-column spec with plain centered columns."""
    i = tex.find(r"\begin{tabular}")
    if i < 0:
        return tex
    j = tex.find("{", i + len(r"\begin{tabular}"))
    depth, k = 0, j
    while k < len(tex):
        if tex[k] == "{":
            depth += 1
        elif tex[k] == "}":
            depth -= 1
            if depth == 0:
                break
        k += 1
    return tex[:j] + "{l*{30}{c}}" + tex[k + 1:]


def compile_one(name: str, path: str) -> bool:
    frag = fix_tabular_spec(open(path, encoding="utf-8", errors="replace").read())
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "t.tex"), "w").write(PREAMBLE + frag + POSTAMBLE)
        subprocess.run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "t.tex"],
                       cwd=d, capture_output=True, text=True)
        if not os.path.exists(os.path.join(d, "t.pdf")):
            print(f"  FAIL {name} (LaTeX error)"); return False
        subprocess.run(["pdftoppm", "-png", "-r", "200", "t.pdf", "out"], cwd=d, check=True)
        png = next((f for f in os.listdir(d) if f.startswith("out") and f.endswith(".png")), None)
        if not png:
            print(f"  FAIL {name} (no png)"); return False
        shutil.copy(os.path.join(d, png), os.path.join(OUT, name + ".png"))
        shutil.copy(path, os.path.join(OUT, name + ".tex"))
        return True


def main():
    if not os.path.isdir(SRC):
        print(f"no source dir {SRC} — put your raw esttab .tex fragments there"); return
    ok = 0
    for f in sorted(os.listdir(SRC)):
        if f.endswith(".tex") and compile_one(f[:-4], os.path.join(SRC, f)):
            ok += 1
    print(f"compiled {ok} tables -> {OUT}")


if __name__ == "__main__":
    main()
