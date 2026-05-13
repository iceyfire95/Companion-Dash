import { Router } from 'express';
import * as db from '../db/index.js';
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
    createdAt: now,
    updatedAt: now
  };
  db.insertDashboard(d);
  res.status(201).json(d);
});

r.get('/:id', (req, res) => {
  const d = db.getDashboard(req.params.id);
  if (!d) { res.status(404).json({ error: 'not found' }); return; }
  res.json(d);
});

r.put('/:id', (req, res) => {
  const existing = db.getDashboard(req.params.id);
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }
  const d: Dashboard = {
    ...existing,
    name: req.body?.name ?? existing.name,
    width: req.body?.width ?? existing.width,
    height: req.body?.height ?? existing.height,
    bgColor: req.body?.bgColor ?? existing.bgColor,
    updatedAt: Date.now()
  };
  db.updateDashboard(d);
  res.json(d);
});

r.delete('/:id', (req, res) => {
  db.deleteDashboard(req.params.id);
  res.status(204).end();
});

r.get('/:id/panels', (req, res) => {
  res.json(db.listPanels(req.params.id));
});

export default r;
