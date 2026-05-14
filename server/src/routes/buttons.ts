import { Router } from 'express';
import * as db from '../db/index.js';
import { triggerButton, fireCompanionAction, getToggleStep, clearToggleState } from '../services/buttons.js';
import type { ButtonAction } from '../types.js';

const r = Router();

/**
 * Trigger a configured button binding from the viewer.
 * Body: { panelId: string, cellId: string | null }
 *   cellId === null  -> trigger the panel-level button
 *   cellId === 'header' -> trigger the header cell's button
 *   else the body cell's button
 */
r.post('/trigger', async (req, res) => {
  const panelId = String(req.body?.panelId ?? '');
  const cellId = req.body?.cellId === null || req.body?.cellId === undefined
    ? null
    : String(req.body.cellId);

  const panel = db.getPanel(panelId);
  if (!panel) { res.status(404).json({ ok: false, error: 'panel not found' }); return; }

  let cfg;
  if (cellId === null) {
    cfg = panel.button;
  } else if (cellId === 'header') {
    cfg = panel.header?.button;
  } else {
    const cell = panel.cells.find(c => c.id === cellId);
    cfg = cell?.button;
  }
  if (!cfg) { res.status(400).json({ ok: false, error: 'no button configured' }); return; }

  const result = await triggerButton(panelId, cellId, cfg);
  res.status(result.ok ? 200 : 400).json(result);
});

/** Editor test fire - sends a one-off action without touching toggle state. */
r.post('/test', async (req, res) => {
  const a = req.body?.action as ButtonAction | undefined;
  if (!a || typeof a.page !== 'number' || typeof a.row !== 'number' || typeof a.column !== 'number') {
    res.status(400).json({ ok: false, error: 'action requires page, row, column numbers' });
    return;
  }
  const result = await fireCompanionAction(a);
  res.status(result.ok ? 200 : 400).json(result);
});

/** Read current toggle step for a button (for UI display). */
r.get('/state/:panelId/:cellId?', (req, res) => {
  const step = getToggleStep(req.params.panelId, req.params.cellId ?? null);
  res.json({ step });
});

/** Reset toggle step state (useful when reconfiguring). */
r.post('/reset', (req, res) => {
  const panelId = String(req.body?.panelId ?? '');
  const cellId = req.body?.cellId === undefined ? undefined
                : req.body.cellId === null ? null : String(req.body.cellId);
  clearToggleState(panelId, cellId);
  res.json({ ok: true });
});

export default r;
