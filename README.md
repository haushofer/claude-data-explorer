# claude-data-explorer

Publish a dataset on the web and let **anyone analyze it in plain language**. A
visitor types a question; a Claude agent writes and runs real Python (pandas,
matplotlib) against the data in an isolated workspace, streams its progress, and
posts the resulting charts, tables, and a written summary to a shared gallery.
Visitors can edit the generated script and re-run it.

It's a self-contained Next.js app plus a small deploy kit. Drop in your CSV, edit
one config file, and go. **Use this template** → clone → make it yours.

> ⚠️ **This app runs AI-generated code on visitor requests.** That is powerful and
> genuinely useful, but it is a remote-code-execution surface by design. Read
> [SECURITY.md](SECURITY.md) before you deploy publicly. The defaults (a password
> gate + a hardened, network-pinned sandbox in `deploy/`) exist for a reason.

---

## What you get

- **Explore** — a sortable, filterable data table with per-column descriptions, and a CSV download.
- **Analyze** — a box where visitors describe an analysis; the agent runs it and returns figures + a summary.
- **Gallery** — a shared feed of submitted analyses; visitors can publish or re-run.
- **Password gate** — one shared "join code" gates the whole site.
- **Deploy kit** — a hardened `systemd` unit + pinned-egress firewall that run the app as an unprivileged, network-restricted user.

## Quickstart (local)

```bash
# 1. Use this template on GitHub, then clone your copy
git clone https://github.com/<you>/<your-repo>.git && cd <your-repo>

# 2. Configure secrets (writes web/.env.local)
node scripts/setup.mjs

# 3. Add your data (or keep the bundled example)
#    data/public/<your>.csv, data_dictionary.csv, data_dictionary.md

# 4. Point the app at your data + brand it
#    edit web/lib/site.config.ts

# 5. Run
cd web && npm install && npm run dev   # http://localhost:3000
```

You need an [Anthropic API key](https://console.anthropic.com/) and a local Python
with `pandas numpy matplotlib seaborn` (point `VENV_PYTHON` at it).

## Make it yours — the three files you touch

| File | What it controls |
|---|---|
| **`web/lib/site.config.ts`** | Title/brand, the dataset filename, the paragraph the agent is told about your data, and the example prompts. |
| **`data/public/`** | Your `dataset.csv`, `data_dictionary.csv` (`column,description,non_null`), and `data_dictionary.md` (what the agent reads). |
| **`content/sections.json`** | The landing-page sections (Markdown + `$LaTeX$`). A section with `"id":"raw"` renders the data table; others show text or reference Stata tables/figures. Run `npm run content` to regenerate `web/public/sections.json`. |

Secrets live in **`web/.env.local`** (gitignored) — see `web/.env.example`.

### Publish your Stata output (optional)

Export tables as LaTeX (`esttab`) into `web/public/stata/tab/` and figures into
`web/public/stata/fig/`, reference them from `content/sections.json`
(`{"table":"name"}` / `{"figure":"name"}`), and run `npm run content`. Tables
render live from their LaTeX. Full guide: [stata/README.md](stata/README.md).

## Deploy (hardened)

On a Linux box with `systemd` + `nftables`:

```bash
sudo APP_USER=explorer APP_DIR=/srv/claude-data-explorer ./deploy/deploy.sh
```

This creates an unprivileged app user, builds the app, installs it under a
sandboxed `systemd` unit, and pins that user's outbound traffic to the Anthropic
API only. Then front it with nginx + TLS (proxy to `127.0.0.1:$PORT`) and set a
spend cap on your API key. Details and the threat model: [SECURITY.md](SECURITY.md).

For the **strongest isolation** (a network-less container per analysis run), build
the sandbox image and point `VENV_PYTHON` at `deploy/sandbox-python.sh` — see
[SECURITY.md](SECURITY.md#stronger-isolation--container-per-run-opt-in-ships-with-the-template).

## How it works

```
visitor ─▶ /workspace ─▶ /api/analyze ─▶ Claude Agent SDK
                                          │  writes analysis.py, runs it with VENV_PYTHON
                                          │  every tool call vetted by guardTool()
                                          ▼
                              runs/<name>/<id>/  (isolated workspace)
                                          │  charts (.png), tables (.csv), summary
                                          ▼
                                  gallery (SQLite) ◀─ shown to everyone
```

Each analysis runs in its own directory, seeded with a copy of the dataset. The
in-process guard (`web/lib/agent.ts`) confines file access to that directory and
blocks network/VCS/package commands — a strong heuristic, **not** a full sandbox,
which is why the production deploy adds OS-level isolation.

## License

MIT — see [LICENSE](LICENSE). Built from the engine behind
[kenyastress.johanneshaushofer.com](https://kenyastress.johanneshaushofer.com).
