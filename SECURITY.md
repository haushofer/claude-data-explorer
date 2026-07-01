# Security

**Read this before you deploy publicly.** This app is, by design, a service that
runs code written by an AI in response to anonymous requests. That is exactly why
it's useful — and it is a remote-code-execution (RCE) surface. Treat it like one.

This isn't hypothetical: the project this template was extracted from had two
servers compromised (cryptominer + internet scanner) through an earlier, less
guarded version of this same endpoint. The layers below are the lessons from that.

## The threat model

- **Anyone who can reach `/api/analyze` or `/api/rerun` can cause code to run** on
  your server. The password gate is what stands between the open internet and that
  endpoint.
- **The in-app guard is a heuristic, not a sandbox.** `web/lib/agent.ts::guardTool`
  blocks path traversal, sensitive-file reads, and network/VCS/package commands with
  regexes. It stops casual misuse, but a determined prompt can obfuscate around a
  regex. **Do not rely on it as your only defense.**
- **So the real containment is at the OS level:** run the app unprivileged, with no
  ability to escalate, no access to other users' secrets, capped resources, and
  outbound network pinned to the Anthropic API. That way even a full guard bypass
  can't mine, scan, exfiltrate, or root the box.

## The layers (defense in depth)

1. **Auth gate — on by default.** `SITE_PASSWORD` gates every route including the
   agent endpoints (`web/middleware.ts`). Give the code to your audience; don't
   publish it. Leaving it empty disables the gate — only do that behind other
   controls. It's inlined into the edge middleware at build time, so rebuild after
   changing it.

2. **Unprivileged, sandboxed process.** `deploy/explorer.service` runs the app as a
   dedicated no-login, no-sudo user with `NoNewPrivileges`, `ProtectSystem=strict`,
   `ProtectHome=read-only`, `PrivateTmp`, and `MemoryMax`/`CPUQuota`/`TasksMax`
   caps. RCE through the app is therefore not root, cannot read `/home`, and cannot
   exhaust the machine.

3. **Pinned egress.** `deploy/nftables-egress.conf` drops all outbound traffic from
   the app user except DNS and HTTPS to the Anthropic API. This is the single most
   important control — it directly neutralizes the miner-download / pool-connect /
   internet-scan / data-exfiltration chain. It matches by UID, so it doesn't touch
   anything else on the box.

4. **Spend cap.** Set a hard budget on the API key in the
   [Anthropic Console](https://console.anthropic.com/). A password-holder can still
   run expensive analyses; the cap bounds the damage.

`deploy/deploy.sh` wires up layers 1–3 for you. Layer 4 is a console setting only
you can make.

## Stronger isolation — container per run (opt-in, ships with the template)

For a fully untrusted audience, run each analysis inside a throwaway container.
This template ships that as a **drop-in interpreter wrapper** — no app-code change:

```bash
docker build -f deploy/Dockerfile.sandbox -t claude-data-explorer-sandbox .
# then in web/.env.local:
VENV_PYTHON=/srv/claude-data-explorer/deploy/sandbox-python.sh
```

Because both the agent's own code execution and the visitor's edit-and-rerun go
through `VENV_PYTHON`, pointing it at `deploy/sandbox-python.sh` makes **every**
analysis run as `docker run --network none --read-only` (writable `tmpfs` + the
run directory only), as a non-root user with `--memory`, `--cpus`, and
`--pids-limit` caps. The agent's Python then has **no network at all** and a
filesystem it can't escape, while the Node server keeps its normal Anthropic
access. Managed sandboxes (e2b, Modal, Fly Machines) are drop-in alternatives if
you'd rather not run Docker yourself.

This is the strongest option and is recommended for public, unauthenticated-audience
deployments. It requires Docker on the host; if you can't run Docker, the systemd +
nftables sandbox above already contains the attacks seen in the wild.

This is left as an opt-in enhancement rather than the default because it adds a
Docker dependency; the shipped systemd + nftables sandbox already contains the
attacks seen in the wild.

## If you publish your data

The agent can read and summarize any column in the CSV you ship. Publish only data
you're comfortable making public, and de-identify before you do. The dataset is
copied into each run directory, so the agent (and the visitor's edited scripts)
can see all of it.

## Reporting

Found an issue in the template itself? Open an issue, or for anything sensitive,
contact the maintainer privately rather than filing publicly.
