import { Router } from 'express';
import * as db from '../db/index.js';
import { newId } from '../types.js';
import type { SavedPanelTemplate, Panel } from '../types.js';
import { requireAuth } from '../services/requireAuth.js';

const r = Router();

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

export default r;
