import { Router, raw } from 'express';
import * as db from '../db/index.js';
import {
  getBackground, upsertBackground, deleteBackground,
  setBackgroundFit, hasBackground,
  MAX_BACKGROUND_BYTES, ALLOWED_MIME_TYPES,
  type BackgroundFit
} from '../db/backgrounds.js';
import { newId } from '../types.js';
import type { Dashboard } from '../types.js';

const r = Router();

r.get('/', (_req, res) => {
  res.json(db.listDashboards());
});

r.post('/', (req, res) => {
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

r.put('/:id', (req, res) => {
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

r.delete('/:id', (req, res) => {
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

r.delete('/:id/background', (req, res) => {
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
r.put('/:id/background-fit', (req, res) => {
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

export default r;
