import { Router } from 'express';
import * as db from '../db/index.js';
import { newId } from '../types.js';
import type { Panel, Cell } from '../types.js';
import { rebuildWantedVariables } from '../services/orchestrator.js';
import { clearToggleState } from '../services/buttons.js';

const r = Router();

function defaultCell(row: number, col: number): Cell {
  return {
    id: newId(),
    row, col,
    rowSpan: 1, colSpan: 1,
    text: '',
    align: 'center',
    valign: 'middle',
    bgColor: '#1a1a1a',
    textColor: '#ffffff',
    fontSize: 24,
    fontWeight: 400,
    borderColor: '#2a2a2a',
    borderWidth: 0,
    rules: []
  };
}

function defaultPanel(dashboardId: string): Panel {
  const rows = 1, cols = 1;
  const cells: Cell[] = [];
  for (let rr = 0; rr < rows; rr++) {
    for (let cc = 0; cc < cols; cc++) cells.push(defaultCell(rr, cc));
  }
  const header = defaultCell(0, 0);
  header.text = 'Header';
  header.bgColor = '#222';
  header.fontSize = 18;
  header.fontWeight = 700;
  return {
    id: newId(),
    dashboardId,
    x: 40, y: 40, width: 320, height: 160,
    zIndex: 1,
    headerEnabled: true,
    header,
    rows, cols, cells,
    bgColor: '#111111',
    borderColor: '#333333',
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    gap: 4,
    templateId: null,
    name: 'Panel'
  };
}

r.post('/', (req, res) => {
  const dashboardId = String(req.body?.dashboardId ?? '');
  if (!dashboardId || !db.getDashboard(dashboardId)) {
    res.status(400).json({ error: 'dashboardId invalid' });
    return;
  }
  const fromTemplate = req.body?.templateId
    ? db.getSavedPanel(String(req.body.templateId))
    : undefined;

  let p: Panel;
  if (fromTemplate) {
    p = {
      ...fromTemplate.panel,
      id: newId(),
      dashboardId,
      x: Number(req.body?.x ?? 40),
      y: Number(req.body?.y ?? 40),
      templateId: fromTemplate.id
    } as Panel;
  } else {
    p = defaultPanel(dashboardId);
    if (req.body?.x !== undefined) p.x = Number(req.body.x);
    if (req.body?.y !== undefined) p.y = Number(req.body.y);
  }
  db.upsertPanel(p);
  rebuildWantedVariables();
  res.status(201).json(p);
});

r.get('/:id', (req, res) => {
  const p = db.getPanel(req.params.id);
  if (!p) { res.status(404).json({ error: 'not found' }); return; }
  res.json(p);
});

r.put('/:id', (req, res) => {
  const existing = db.getPanel(req.params.id);
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }
  const incoming = req.body as Partial<Panel>;
  const p: Panel = { ...existing, ...incoming, id: existing.id, dashboardId: existing.dashboardId };
  db.upsertPanel(p);
  // Bump dashboard updatedAt
  const dash = db.getDashboard(p.dashboardId);
  if (dash) db.updateDashboard({ ...dash, updatedAt: Date.now() });
  rebuildWantedVariables();
  res.json(p);
});

r.delete('/:id', (req, res) => {
  const p = db.getPanel(req.params.id);
  db.deletePanel(req.params.id);
  clearToggleState(req.params.id);
  if (p) {
    const dash = db.getDashboard(p.dashboardId);
    if (dash) db.updateDashboard({ ...dash, updatedAt: Date.now() });
  }
  rebuildWantedVariables();
  res.status(204).end();
});

export default r;
