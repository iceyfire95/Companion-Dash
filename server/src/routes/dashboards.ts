import { Router, raw } from 'express';
import * as db from '../db/index.js';
import {
  getBackground, upsertBackground, deleteBackground,
  setBackgroundFit, hasBackground,
  MAX_BACKGROUND_BYTES, ALLOWED_MIME_TYPES,
  type BackgroundFit
} from '../db/backgrounds.js';
import { newId } from '../types.js';
import { requireAuth } from '../services/requireAuth.js';
import type { Dashboard } from '../types.js';

const r = Router();

r.get('/', (_req, res) => {
  res.json(db.listDashboards());
});

r.post('/', requireAuth, (req, res) => {
  const now = Date.now();
  const d: Dashboard = {
    id: newId(),
    name: String(req.body?.name ?? 'Untitled'),
    width: Number(req.body?.width ?? 1920),
    height: Number(req.body?.height ?? 1080),
    bgColor: String(req.body?.bgColor ?? '#0a0a0a'),
    backgroundFit: 'cover',
    hasBackground: false,
    createdAt: now,
    updatedAt: now
  };
  db.insertDashboard(d);
  res.status(201).json(db.getDashboard(d.id) ?? d);
});

r.get('/:id', (req, res) => {
  const d = db.getDashboard(req.params.id);
  if (!d) { res.status(404).json({ error: 'not found' }); return; }
  res.json(d);
});

r.put('/:id', requireAuth, (req, res) => {
  const existing = db.getDashboard(req.params.id);
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }
  // Validate backgroundFit if provided.
  let backgroundFit = existing.backgroundFit ?? 'cover';
  if (req.body?.backgroundFit !== undefined) {
    const v = String(req.body.backgroundFit);
    if (v === 'cover' || v === 'contain' || v === 'stretch') {
      backgroundFit = v;
    } else {
      res.status(400).json({ error: `invalid backgroundFit: ${v}` });
      return;
    }
  }
  const d: Dashboard = {
    ...existing,
    name: req.body?.name ?? existing.name,
    width: req.body?.width ?? existing.width,
    height: req.body?.height ?? existing.height,
    bgColor: req.body?.bgColor ?? existing.bgColor,
    backgroundFit,
    updatedAt: Date.now()
  };
  db.updateDashboard(d);
  res.json(db.getDashboard(d.id) ?? d);
});

r.delete('/:id', requireAuth, (req, res) => {
  db.deleteDashboard(req.params.id);
  res.status(204).end();
});

r.get('/:id/panels', (req, res) => {
  res.json(db.listPanels(req.params.id));
});

// --- Background image ----------------------------------------------------

/**
 * Upload (or replace) a dashboard's background image.
 *
 * Wire format: raw image bytes in the request body, mime type in the
 * Content-Type header. We use express.raw() (limited to MAX_BACKGROUND_BYTES)
 * specifically on this route so the global JSON parser doesn't see it
 * and to avoid pulling in multer just for a single-field upload.
 *
 * Status codes:
 *   415 - mime type not in allowlist (PNG / JPEG only)
 *   413 - body larger than MAX_BACKGROUND_BYTES
 *   404 - dashboard id doesn't exist
 *   200 - success, returns the updated dashboard row
 */
r.post(
  '/:id/background',
  requireAuth,
  raw({
    type: () => true,
    limit: MAX_BACKGROUND_BYTES
  }),
  (req, res) => {
    const existing = db.getDashboard(req.params.id);
    if (!existing) { res.status(404).json({ error: 'not found' }); return; }
    const mime = String(req.get('content-type') ?? '').toLowerCase().split(';')[0].trim();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      res.status(415).json({
        error: `unsupported mime: ${mime || '(none)'}; allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`
      });
      return;
    }
    const body = req.body;
    if (!body || !(body instanceof Buffer) || body.length === 0) {
      res.status(400).json({ error: 'empty body' });
      return;
    }
    if (body.length > MAX_BACKGROUND_BYTES) {
      res.status(413).json({ error: `image exceeds ${MAX_BACKGROUND_BYTES} bytes` });
      return;
    }
    upsertBackground(req.params.id, mime, new Uint8Array(body.buffer, body.byteOffset, body.length));
    res.json(db.getDashboard(req.params.id));
  }
);

/**
 * Stream the background image bytes back to the client with cache
 * headers. We include `updated_at` in the ETag so the client gets a
 * fresh image whenever the user uploads a new one; otherwise the
 * browser is free to cache aggressively.
 */
r.get('/:id/background', (req, res) => {
  const row = getBackground(req.params.id);
  if (!row) { res.status(404).end(); return; }
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.setHeader('ETag', `"bg-${row.updatedAt}"`);
  // If the client already has the current version, send 304.
  const inm = req.get('if-none-match');
  if (inm === `"bg-${row.updatedAt}"`) {
    res.status(304).end();
    return;
  }
  res.status(200).end(Buffer.from(row.data));
});

r.delete('/:id/background', requireAuth, (req, res) => {
  if (!hasBackground(req.params.id)) {
    res.status(404).json({ error: 'no background to remove' });
    return;
  }
  deleteBackground(req.params.id);
  res.json(db.getDashboard(req.params.id));
});

/**
 * Update just the fit mode without re-uploading the image. Useful for
 * the inspector's dropdown which should be light/instant.
 */
r.put('/:id/background-fit', requireAuth, (req, res) => {
  const existing = db.getDashboard(req.params.id);
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }
  const v = String(req.body?.fit);
  if (v !== 'cover' && v !== 'contain' && v !== 'stretch') {
    res.status(400).json({ error: `invalid fit: ${v}` });
    return;
  }
  setBackgroundFit(req.params.id, v as BackgroundFit);
  res.json(db.getDashboard(req.params.id));
});

// ---- Export / Import -----------------------------------------------------

const DASHBOARD_EXPORT_FORMAT = 'cwd-dashboard';
const DASHBOARD_EXPORT_VERSION = 1;

/**
 * Export a dashboard, its panels, and (optionally) its background image
 * as one JSON document. The background is inlined as a data URL so the
 * file is self-contained; users can email/share without losing it.
 *
 * Tally sources, watched variables, and Companion connection settings
 * are NOT exported - those are environment-specific. Imported $(conn:var)
 * references survive textually; if the target server has a connection
 * with the same label, they resolve normally.
 *
 * Returns the JSON body inline. The client wraps it in a downloadable
 * file via Blob + URL.createObjectURL.
 */
r.get('/:id/export', (req, res) => {
  const d = db.getDashboard(req.params.id);
  if (!d) { res.status(404).json({ error: 'not found' }); return; }
  const panels = db.listPanels(req.params.id);

  // Strip stable identifiers and the dashboard pointer from each panel
  // so a fresh import generates new ids and binds to the new dashboard.
  // We keep templateId because it's only meaningful inside the source DB,
  // and clear it explicitly on import.
  const exportPanels = panels.map(p => {
    const { id: _id, dashboardId: _did, ...rest } = p;
    return rest;
  });

  // Background bytes inline as data URL when present.
  let background: { mime: string; dataBase64: string } | null = null;
  const bg = getBackground(req.params.id);
  if (bg) {
    background = {
      mime: bg.mime,
      dataBase64: Buffer.from(bg.data).toString('base64')
    };
  }

  res.json({
    format: DASHBOARD_EXPORT_FORMAT,
    version: DASHBOARD_EXPORT_VERSION,
    exportedAt: Date.now(),
    dashboard: {
      name: d.name,
      width: d.width,
      height: d.height,
      bgColor: d.bgColor,
      backgroundFit: d.backgroundFit ?? 'cover'
    },
    panels: exportPanels,
    background
  });
});

/**
 * Import a previously-exported dashboard JSON document.
 *
 * Creates a fresh dashboard row, inserts all panels with new ids,
 * and decodes the background image if present (allowlist + size cap
 * still enforced, same as the regular upload route).
 *
 * Returns the newly-created dashboard so the client can navigate
 * straight to its editor.
 */
r.post('/import', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'body must be JSON' });
    return;
  }
  if (body.format !== DASHBOARD_EXPORT_FORMAT) {
    res.status(400).json({ error: `unsupported format: ${body.format ?? '(none)'}` });
    return;
  }
  if (typeof body.version !== 'number' || body.version > DASHBOARD_EXPORT_VERSION) {
    res.status(400).json({ error: `unsupported version: ${body.version}` });
    return;
  }
  if (!body.dashboard || typeof body.dashboard !== 'object') {
    res.status(400).json({ error: 'missing dashboard' });
    return;
  }

  const now = Date.now();
  const incoming = body.dashboard;
  // Honour an optional rename via body.nameOverride. Otherwise append
  // " (imported)" to the original name so the user can tell duplicates
  // apart in the home list.
  const baseName = String(body.nameOverride ?? `${incoming.name ?? 'Imported'} (imported)`).trim()
    || 'Imported dashboard';

  const fit = (incoming.backgroundFit === 'contain' || incoming.backgroundFit === 'stretch')
    ? incoming.backgroundFit
    : 'cover';

  const dash = {
    id: newId(),
    name: baseName,
    width: Number(incoming.width ?? 1920),
    height: Number(incoming.height ?? 1080),
    bgColor: String(incoming.bgColor ?? '#0a0a0a'),
    backgroundFit: fit as 'cover' | 'contain' | 'stretch',
    hasBackground: false,
    createdAt: now,
    updatedAt: now
  } satisfies Dashboard;
  db.insertDashboard(dash);
  // Apply backgroundFit immediately so the freshly-created dashboard
  // remembers it even if the image upload below fails.
  setBackgroundFit(dash.id, fit as BackgroundFit);

  // Insert panels. We strip any leftover stable fields (id/dashboardId)
  // defensively in case the export shape is older than expected.
  const panels = Array.isArray(body.panels) ? body.panels : [];
  for (const raw of panels) {
    if (!raw || typeof raw !== 'object') continue;
    const { id: _i, dashboardId: _d, ...rest } = raw;
    // Regenerate cell ids so duplicate imports don't collide.
    const nextHeader = rest.header ? { ...rest.header, id: newId() } : null;
    const nextCells = Array.isArray(rest.cells)
      ? rest.cells.map((c: any) => ({ ...c, id: newId() }))
      : [];
    const p = {
      ...rest,
      id: newId(),
      dashboardId: dash.id,
      header: nextHeader,
      cells: nextCells,
      templateId: null   // bound to source DB, meaningless here
    };
    db.upsertPanel(p as any);
  }

  // Background, if present. Re-validate mime + size to keep the
  // allowlist consistent with the upload endpoint.
  if (body.background && typeof body.background === 'object') {
    const mime = String(body.background.mime ?? '').toLowerCase().trim();
    const b64 = String(body.background.dataBase64 ?? '');
    if (ALLOWED_MIME_TYPES.has(mime) && b64) {
      try {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > 0 && buf.length <= MAX_BACKGROUND_BYTES) {
          upsertBackground(dash.id, mime, new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
        }
        // Soft failure: oversize / decode-error gives a dashboard
        // without a background rather than failing the whole import.
      } catch { /* ignore */ }
    }
  }

  res.status(201).json(db.getDashboard(dash.id));
});

export default r;
