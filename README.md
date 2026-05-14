# Companion Web Dashboard

A web-based dashboard for displaying variables from [Bitfocus Companion](https://github.com/bitfocus/companion). Inspired by [tomhillmeyer/companion-dashboard](https://github.com/tomhillmeyer/companion-dashboard), but runs as a webserver: build dashboards in a browser, view dashboards in a browser.

## Status — v0.1 (scaffold)

Implemented:

- Node + Express + Socket.io server
- SQLite persistence (`~/.companion-web-dashboard/data.db`)
- Companion HTTP polling at 100ms (configurable), only for variables actually referenced by panels
- Multiple dashboards
- Free-position panels: drag to move, drag corners/edges to resize
- Panels = optional header + rows × cols grid of cells, like editing a table
- Text cells with `$(connection:var)` substitution, markdown + HTML
- Auto-fit text shrinks to fit cell bounds
- Conditional styling rules per cell (first match wins): bg, text, border colors, weight
- Save panel as template; instantiate panels from templates
- Settings page for Companion host/port/poll interval

Deferred (v2+): expression operators, custom fonts, video/iframe boxes, multi-page support.

## Quick start (macOS)

Prerequisites: **Node 22.5+** (uses the built-in `node:sqlite` module — no native build step).
If you're on Node 25, that's fine too. Earlier versions won't have `node:sqlite`.

```bash
npm run install:all
npm run dev
```

- Server on http://localhost:3000
- Editor/Viewer on http://localhost:5173 (Vite, proxies `/api` and `/socket.io` to the server)

Open http://localhost:5173, go to Settings, enable the Companion poller, and set host/port (defaults to `127.0.0.1:8000`).

## Production single-port build

```bash
npm run build
npm start
```

Then http://localhost:3000 serves the API, websocket, and the built React app.

## Desktop app builds

Bundle as native installers using electron-builder.

```bash
npm run mac:dev          # run as desktop app for testing
npm run mac:build        # unsigned macOS .dmg + .zip (arm64 + x64)
npm run win:build        # unsigned Windows portable .exe + .zip (cross-built from Mac)
npm run release:all      # both mac + win in one go
npm run mac:build:signed # signed + notarized .dmg (Apple Developer Program required)
```

Output: `electron/out/`. See `electron/README.md` for full signing setup and
testing-instructions you can paste to alpha testers.

## Companion variable syntax

In any text field:

- `$(custom:cue)` — reads custom variable `cue`
- `$(atem:pgm1_input)` — reads variable `pgm1_input` from the connection labelled `atem`

The server only polls variables that are actually referenced by any panel.

## Companion HTTP API endpoints used

- `GET /api/variable/<connectionLabel>/<name>/value`
- `GET /api/custom-variable/<name>/value`

## Data storage

SQLite at `~/.companion-web-dashboard/data.db`. Override with env var `CWD_DB_PATH`.

## Tables

- `dashboards` — canvas size, name, bg
- `panels` — JSON blob per panel (fast iteration, no migrations for shape changes)
- `saved_panels` — reusable panel templates
- `settings` — companion config etc

## Docker (later)

The server is a plain Node app; bind-mount a volume at `/data` and set `CWD_DB_PATH=/data/data.db` for persistence.
