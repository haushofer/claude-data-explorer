#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Container sandbox for analysis runs (strongest isolation — see SECURITY.md).
#
# This is a drop-in replacement for the Python interpreter. Point VENV_PYTHON at
# it and EVERY analysis — both the agent's own code execution and the visitor's
# edit-and-rerun — runs inside a throwaway container with NO network, a read-only
# root filesystem, capped memory/CPU/pids, and only the current run directory
# bind-mounted. Even a full guard bypass then can't reach the network, touch the
# host filesystem, or exhaust the machine.
#
# Setup:
#   docker build -f deploy/Dockerfile.sandbox -t claude-data-explorer-sandbox .
#   # in web/.env.local:
#   VENV_PYTHON=/srv/claude-data-explorer/deploy/sandbox-python.sh
#
# Requires Docker on the host. If you can't run Docker, use the systemd +
# nftables sandbox in deploy/ instead (it contains the same attacks, minus the
# per-run filesystem/network isolation this adds).
# ---------------------------------------------------------------------------
set -euo pipefail

IMAGE="${SANDBOX_IMAGE:-claude-data-explorer-sandbox}"

# The app invokes us from inside the run directory (agent: `VENV_PYTHON foo.py`
# with cwd=rundir; rerun: spawnSync cwd=rundir). Mount that dir as /work and
# rewrite any absolute argument that points inside it to its /work equivalent,
# so both relative and absolute script paths resolve in the container.
args=()
for a in "$@"; do
  case "$a" in
    "$PWD"/*) args+=("/work/${a#"$PWD"/}") ;;
    *)        args+=("$a") ;;
  esac
done

exec docker run --rm \
  --network none \
  --user "$(id -u)":"$(id -g)" \
  --memory 1g --cpus 1 --pids-limit 128 \
  --read-only --tmpfs /tmp:rw,exec \
  -v "$PWD":/work -w /work \
  "$IMAGE" python "${args[@]}"
