#!/usr/bin/env bash
# Launcher for the bundled Companion Web Dashboard.
# Uses the Node binary shipped with the package.
set -euo pipefail

APP_DIR="/opt/companion-web-dashboard"

# Allow user/system overrides
export PORT="${PORT:-3000}"
# CWD_DB_PATH defaults to $HOME/.companion-web-dashboard/data.db inside the server
# Leave it unset unless the caller wants to override.

exec "$APP_DIR/node" "$APP_DIR/server/dist/index.js" "$@"
