#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-shot hardened deploy for a Linux server (Amazon Linux 2023 / Debian /
# Ubuntu with systemd + nftables). Run as root FROM the repo you cloned:
#
#     sudo APP_USER=explorer APP_DIR=/srv/claude-data-explorer ./deploy/deploy.sh
#
# It creates an unprivileged app user, installs the app under a hardened systemd
# unit, and pins that user's outbound network to the Anthropic API only. It does
# NOT set up nginx/TLS — point your reverse proxy at 127.0.0.1:$PORT afterwards.
#
# Prereqs on the box: node 20+, npm, and a Python interpreter with
# pandas/numpy/matplotlib/seaborn (set VENV_PYTHON in web/.env.local).
# ---------------------------------------------------------------------------
set -euo pipefail

APP_USER="${APP_USER:-explorer}"
APP_DIR="${APP_DIR:-/srv/claude-data-explorer}"
REPO_SRC="$(cd "$(dirname "$0")/.." && pwd)"
HERE="$REPO_SRC/deploy"

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)"; exit 1; }
command -v npm  >/dev/null || { echo "node/npm not found — install Node 20+ first"; exit 1; }
command -v nft  >/dev/null || echo "WARN: nftables not found — egress pinning will be skipped"

echo "==> app user: $APP_USER   app dir: $APP_DIR   source: $REPO_SRC"

# 1. unprivileged, no-login, no-sudo app user
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$APP_DIR" --shell /sbin/nologin "$APP_USER"
fi
APP_UID="$(id -u "$APP_USER")"

# 2. place the app under APP_DIR, owned by the app user
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  "$REPO_SRC"/ "$APP_DIR"/
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# 3. secrets must exist before we start
if [ ! -f "$APP_DIR/web/.env.local" ]; then
  echo "!! $APP_DIR/web/.env.local is missing."
  echo "   Copy web/.env.example to web/.env.local and fill in ANTHROPIC_API_KEY,"
  echo "   SITE_PASSWORD, VENV_PYTHON, and PORT, then re-run."
  exit 1
fi
chmod 600 "$APP_DIR/web/.env.local"; chown "$APP_USER:$APP_USER" "$APP_DIR/web/.env.local"

# 4. install deps + production build as the app user
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR/web' && HOME='$APP_DIR' npm ci && HOME='$APP_DIR' npm run build"

# 5. hardened systemd unit
sed -e "s#__APP_USER__#$APP_USER#g" -e "s#__APP_DIR__#$APP_DIR#g" \
  "$HERE/explorer.service" > /etc/systemd/system/explorer.service
systemctl daemon-reload
systemctl enable --now explorer.service
sleep 3
systemctl is-active explorer.service && echo "==> service is running"

# 6. pin the app user's egress to the Anthropic API only (defense in depth)
if command -v nft >/dev/null; then
  sed "s/__APP_UID__/$APP_UID/g" "$HERE/nftables-egress.conf" | nft -f -
  echo "==> egress pinned for uid $APP_UID (Anthropic + DNS only)."
  echo "    persist across reboot with:  nft list ruleset > /etc/sysconfig/nftables.conf"
fi

echo
echo "DONE. Now point your reverse proxy (nginx + TLS) at http://127.0.0.1:\$PORT"
echo "and set a spend cap on the Anthropic API key in the console."
