import { Router } from 'express';
import * as db from '../db/index.js';
import { newId } from '../types.js';
import type { SavedPanelTemplate, Panel, Cell } from '../types.js';
import { requireAuth } from '../services/requireAuth.js';

const r = Router();

// ---------- List / capture / delete (existing) -----------------------------

r.get('/', (_req, res) => res.json(db.listSavedPanels()));

r.post('/', requireAuth, (req, res) => {
  const sourcePanelId = String(req.body?.panelId ?? '');
  const name = String(req.body?.name ?? 'Untitled template');
  const src = db.getPanel(sourcePanelId);
  if (!src) { res.status(400).json({ error: 'panel not found' }); return; }
  const { id: _id, dashboardId: _d, x: _x, y: _y, ...rest } = src;
  const tpl: SavedPanelTemplate = {
    id: newId(),
    name,
    panel: rest as Omit<Panel, 'id' | 'dashboardId' | 'x' | 'y'>,
    createdAt: Date.now()
  };
  db.insertSavedPanel(tpl);
  res.status(201).json(tpl);
});

r.delete('/:id', requireAuth, (req, res) => {
  db.deleteSavedPanel(req.params.id);
  res.status(204).end();
});

// ---------- Rename --------------------------------------------------------

/**
 * Rename a saved panel template. Only the `name` field is updated; the
 * stored panel shape is left alone. 404 if the id is unknown.
 */
r.put('/:id', requireAuth, (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  const updated = db.updateSavedPanelName(req.params.id, name);
  if (!updated) { res.status(404).json({ error: 'not found' }); return; }
  res.json(updated);
});

// ---------- Export / Import -----------------------------------------------

const EXPORT_FORMAT = 'cwd-panel';
const EXPORT_VERSION = 1;

interface PanelExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  name: string;
  panel: Omit<Panel, 'id' | 'dashboardId' | 'x' | 'y'>;
}

/**
 * Export a single panel template as a JSON document. The wrapper
 * `{format, version, ...}` lets the importer reject foreign files
 * with a clean error and gives us a migration hook later.
 *
 * Returns the JSON inline (no attachment header) so the client can
 * fetch it and trigger a file save itself - that way the editor can
 * present "download" UI without needing a separate downloads tab.
 */
r.get('/:id/export', (req, res) => {
  const tpl = db.getSavedPanel(req.params.id);
  if (!tpl) { res.status(404).json({ error: 'not found' }); return; }
  const out: PanelExport = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    name: tpl.name,
    panel: tpl.panel
  };
  res.json(out);
});

/**
 * Regenerate all cell ids inside a panel shape. We do this on import
 * to prevent collisions when the same template is imported twice in
 * the same database. The panel's templateId is NOT a cell id, so it
 * stays whatever it was at export time (gets re-assigned by the
 * "create from template" flow anyway).
 */
function regenCellIds<T extends Pick<Panel, 'cells' | 'header'>>(p: T): T {
  const nextHeader: Cell | null = p.header
    ? { ...p.header, id: newId() }
    : null;
  const nextCells = p.cells.map(c => ({ ...c, id: newId() }));
  return { ...p, header: nextHeader, cells: nextCells };
}

/**
 * Import a panel template from a JSON document. Validates the wrapper,
 * regenerates ids, assigns the user-chosen name (or the embedded one),
 * and inserts.
 *
 * Body shape: `{format: "cwd-panel", version: 1, panel: {...}, name?: string}`
 *   - name override is optional; embedded name wins by default.
 *   - We ignore any incoming `id` on the wrapper; a fresh one is minted.
 */
r.post('/import', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'body must be JSON' });
    return;
  }
  if (body.format !== EXPORT_FORMAT) {
    res.status(400).json({ error: `unsupported format: ${body.format ?? '(none)'}` });
    return;
  }
  // Soft version check - we only support version 1 today. Bump alongside
  // a migration when the shape changes.
  if (typeof body.version !== 'number' || body.version > EXPORT_VERSION) {
    res.status(400).json({ error: `unsupported version: ${body.version}` });
    return;
  }
  if (!body.panel || typeof body.panel !== 'object') {
    res.status(400).json({ error: 'missing panel' });
    return;
  }
  const name = String(body.nameOverride ?? body.name ?? 'Imported panel').trim() || 'Imported panel';
  const tpl: SavedPanelTemplate = {
    id: newId(),
    name,
    panel: regenCellIds(body.panel),
    createdAt: Date.now()
  };
  db.insertSavedPanel(tpl);
  res.status(201).json(tpl);
});

export default r;
