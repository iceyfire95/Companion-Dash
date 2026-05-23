Companion-Dash v0.7.0-alpha — Background images + panel alignment
==================================================================

Apply: from repo root, extract this tar.gz, accept overwrites.

    cd ~/Documents/git/companion-web-dashboard
    tar -xzvf companion-dash-v0.7.0-bg-align.tar.gz

Prerequisite: v0.6.0-alpha (this patch builds on that base).

No new npm dependencies. SQLite migration runs automatically on first
server boot — adds `background_fit` column to dashboards table and
creates `dashboard_backgrounds` table. Existing dashboards keep
working unchanged.

What's new
----------

1. **Background images.** Upload a PNG or JPEG as the canvas
   background, per dashboard. Image sits at design coordinates
   (i.e. behind your panels in the same 1920×1080 design space) and
   scales lockstep with the canvas as the viewer / editor zooms or
   resizes.

   Three fit modes:
   - **Cover** — image fills the canvas, edges may be cropped
   - **Contain** — image fits inside the canvas, letterbox if needed
   - **Stretch** — image is distorted to exact canvas dimensions

   Image stored in SQLite as a blob (so backups are still one file).
   Hard cap: 8MB. Served with proper Cache-Control + ETag headers so
   the browser caches across navigations but always sees fresh uploads.

   Controls live in the Inspector's new "Dashboard" section at the
   top — works whether a panel is selected or not.

2. **Panel alignment buttons.** Six new buttons in the Inspector's
   panel section, just below W/H:
   - Align H: left edge ⇤ / horizontal center ⇔ / right edge ⇥
   - Align V: top edge ⤒ / vertical center ⇕ / bottom edge ⤓

   Each aligns the selected panel canvas-relative — the math is just
   `x = (canvasWidth - panelWidth) / 2` for centering, edge alignments
   are obvious. Clamped to 0 so panels can't be pushed off-canvas
   if the dashboard was resized smaller than the panel.

   Multi-panel distribute / align-to-each-other is NOT in this
   release — that needs multi-select first. Easy follow-up if you
   want it.

Files added
-----------
  server/src/db/backgrounds.ts         (blob storage + fit mode)
  client/src/lib/DashboardBackground.tsx (shared canvas image component)

Files modified
--------------
  server/src/types.ts                  (Dashboard.backgroundFit / hasBackground)
  server/src/db/index.ts               (include backgroundFit in reads, migration)
  server/src/routes/dashboards.ts      (upload / fetch / delete / fit endpoints)
  server/src/index.ts                  (init backgrounds db)
  client/src/types.ts                  (Dashboard interface mirror)
  client/src/lib/api.ts                (background API methods)
  client/src/components/Inspector.tsx  (Dashboard section + AlignButtons)
  client/src/pages/EditorPage.tsx      (render bg + pass dashboard to Inspector)
  client/src/pages/ViewerPage.tsx      (render bg)
  package.json + 3 sub-package.json    (version → 0.7.0-alpha)

New endpoints
-------------
  POST   /api/dashboards/:id/background       (upload raw image bytes)
  GET    /api/dashboards/:id/background       (fetch image bytes, with ETag)
  DELETE /api/dashboards/:id/background       (clear)
  PUT    /api/dashboards/:id/background-fit   (body: {fit: cover|contain|stretch})

The PUT /api/dashboards/:id endpoint also now accepts backgroundFit in
its body alongside the existing name/width/height/bgColor fields.

Smoke tested
------------
- upload PNG → bytes survive a fetch round-trip byte-for-byte
- fit-mode change persists and is returned in dashboard JSON
- SVG rejected (415 with helpful error)
- invalid fit rejected (400)
- delete background → hasBackground:false, fit preserved
- delete dashboard → bg row cascades cleanly (FOREIGN KEY ON DELETE CASCADE)
- migration from a pre-v0.7 dashboards table → ALTER TABLE adds
  background_fit, existing rows preserved with default 'cover'
- align math: 200x100 panel in 1920x1080 → centered = (860, 490);
  right+bottom = (1720, 980)

Known gaps (not blockers)
-------------------------
- CONTEXT.md not updated.
- No multi-panel selection yet, so no distribute / align-to-each-other
  buttons. Canvas-relative align only.
- No image preview thumbnail in the Inspector — too easy to bloat the
  sidebar; you see the live background in the canvas anyway.
