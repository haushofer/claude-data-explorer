# Stata → LaTeX → website pipeline

Publish your real Stata output on the site. Tables render as live HTML from their
LaTeX (so they stay crisp and downloadable); figures show as images.

## 1. Export from Stata

Tables — use `esttab` to write a LaTeX fragment per table:

```stata
esttab m1 m2 using "path/to/repo/web/public/stata/tab/main_result.tex", ///
    replace booktabs se star(* 0.10 ** 0.05 *** 0.01) label
```

Figures — export images straight into `web/public/stata/fig/`:

```stata
graph export "path/to/repo/web/public/stata/fig/cortisol_by_arm.png", replace width(1600)
```

## 2. Build the content

```bash
npm run content     # = build_manifest.py + build_sections.py
```

- `scripts/build_manifest.py` scans `web/public/stata/{tab,fig}` into `manifest.json`.
- `scripts/build_sections.py` reads `content/sections.json`, resolves any
  `{"table": "..."}` / `{"figure": "..."}` references into full entries, and
  collects anything you didn't place into auto-generated **Tables** / **Figures**
  sections. It writes `web/public/sections.json` (what the site serves).

Reference a table or figure in `content/sections.json` by its filename (without
extension):

```json
{ "id": "results", "title": "Main results", "analyses": [
    { "table": "main_result", "writeup": "Treatment raises the outcome by ..." },
    { "figure": "cortisol_by_arm" }
] }
```

## 3. (Optional) PNG fallbacks

Tables already render from `.tex` in the browser — you don't need LaTeX installed
to view them. If you *also* want pixel-perfect PNGs (as a fallback / download),
put the raw fragments in `stata/tab_src/` and run:

```bash
python3 stata/compile_tables.py    # needs pdflatex + pdftoppm (poppler)
```

It neutralises `esttab`'s siunitx/`\sym`/`\specialcell` macros so the fragments
compile with a plain LaTeX install, then crops each to a PNG.

## Example

The repo ships one example table (`tab/example_regression.tex`) and one example
figure (`fig/example_outcome_by_group.svg`), referenced from the **Published
results** section in `content/sections.json`. Delete them once you add your own.
