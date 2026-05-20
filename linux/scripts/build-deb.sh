#!/usr/bin/env bash
# Build a self-contained Debian package for linux/arm64.
# Bundles a Node.js binary so the .deb has no runtime dependencies.
#
# Run from repo root:  bash linux/scripts/build-deb.sh
# Output:               electron/out/companion-web-dashboard_<version>_arm64.deb
#
# Requires on host: dpkg-deb (brew install dpkg on macOS), curl, tar.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

NODE_VERSION="${NODE_VERSION:-24.15.0}"
NODE_ARCH="linux-arm64"
NODE_TARBALL="node-v${NODE_VERSION}-${NODE_ARCH}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"

PKG_NAME="companion-web-dashboard"
VERSION="$(node -p "require('./package.json').version")"
# .deb versions don't allow '-' in pre-release tags; rewrite '-alpha' as '~alpha'
DEB_VERSION="$(echo "$VERSION" | sed 's/-/~/g')"
ARCH="arm64"

OUT_DIR="$REPO_ROOT/electron/out"
WORK_DIR="$REPO_ROOT/linux/.build"
STAGE_DIR="$WORK_DIR/stage"
CACHE_DIR="$WORK_DIR/cache"

echo ">> Building ${PKG_NAME} ${DEB_VERSION} for ${ARCH}"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" "$CACHE_DIR" "$OUT_DIR"

# --- 1. Build server + client ---
echo ">> Building server + client"
npm run build

# Prune server devDeps for shipping
echo ">> Pruning server devDeps"
(cd server && npm prune --omit=dev)

# --- 2. Fetch Node.js arm64 binary (cached) ---
NODE_CACHE="$CACHE_DIR/$NODE_TARBALL"
if [ ! -f "$NODE_CACHE" ]; then
  echo ">> Downloading Node ${NODE_VERSION} ${NODE_ARCH}"
  curl -fL --progress-bar "$NODE_URL" -o "$NODE_CACHE"
else
  echo ">> Using cached Node tarball"
fi

NODE_EXTRACT="$CACHE_DIR/node-v${NODE_VERSION}-${NODE_ARCH}"
if [ ! -d "$NODE_EXTRACT" ]; then
  echo ">> Extracting Node"
  tar -xJf "$NODE_CACHE" -C "$CACHE_DIR"
fi

# --- 3. Lay out package contents ---
APP_DIR="$STAGE_DIR/opt/$PKG_NAME"
mkdir -p "$APP_DIR" \
         "$STAGE_DIR/usr/bin" \
         "$STAGE_DIR/lib/systemd/system" \
         "$STAGE_DIR/DEBIAN"

echo ">> Staging app files"
cp "$NODE_EXTRACT/bin/node" "$APP_DIR/node"
chmod 755 "$APP_DIR/node"

# Server dist + runtime deps + package.json (for ESM resolution)
mkdir -p "$APP_DIR/server"
cp -R server/dist "$APP_DIR/server/dist"
cp -R server/node_modules "$APP_DIR/server/node_modules"
cp server/package.json "$APP_DIR/server/package.json"

# Client dist
mkdir -p "$APP_DIR/client"
cp -R client/dist "$APP_DIR/client/dist"

# Launcher
cp linux/packaging/run.sh "$APP_DIR/run.sh"
chmod 755 "$APP_DIR/run.sh"

# Bin symlink + systemd unit + control files
cp linux/packaging/debian/usr/bin/companion-web-dashboard "$STAGE_DIR/usr/bin/companion-web-dashboard"
chmod 755 "$STAGE_DIR/usr/bin/companion-web-dashboard"

cp linux/packaging/debian/lib/systemd/system/companion-web-dashboard.service \
   "$STAGE_DIR/lib/systemd/system/companion-web-dashboard.service"

# Generate control file with current version
cat > "$STAGE_DIR/DEBIAN/control" <<EOF
Package: $PKG_NAME
Version: $DEB_VERSION
Section: net
Priority: optional
Architecture: $ARCH
Maintainer: iceyfire95 <noreply@github.com>
Description: Web-based dashboard for Bitfocus Companion variables.
 Polls Companion's HTTP API and renders configurable panels in a browser.
 Self-contained: bundles its own Node.js runtime, no external dependencies.
 Listens on port 3000 by default.
EOF

cp linux/packaging/debian/DEBIAN/postinst "$STAGE_DIR/DEBIAN/postinst"
cp linux/packaging/debian/DEBIAN/prerm    "$STAGE_DIR/DEBIAN/prerm"
cp linux/packaging/debian/DEBIAN/postrm   "$STAGE_DIR/DEBIAN/postrm"
chmod 755 "$STAGE_DIR/DEBIAN/postinst" "$STAGE_DIR/DEBIAN/prerm" "$STAGE_DIR/DEBIAN/postrm"

# --- 4. Build the .deb ---
DEB_FILE="$OUT_DIR/${PKG_NAME}_${DEB_VERSION}_${ARCH}.deb"
echo ">> Packing $DEB_FILE"
dpkg-deb --root-owner-group --build "$STAGE_DIR" "$DEB_FILE"

# --- 5. Rehydrate server devDeps so the dev tree isn't broken ---
echo ">> Rehydrating server devDeps"
(cd server && npm install) >/dev/null

echo ""
echo "Done."
echo "  $DEB_FILE"
ls -lh "$DEB_FILE"
