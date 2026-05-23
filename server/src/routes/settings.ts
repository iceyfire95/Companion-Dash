import { Router } from 'express';
import * as db from '../db/index.js';
import { poller } from '../services/poller.js';
import { rebuildWantedVariables } from '../services/orchestrator.js';
import type { CompanionConfig } from '../types.js';
import { requireAuth } from '../services/requireAuth.js';

const r = Router();

r.get('/companion', requireAuth, (_req, res) => {
  res.json(db.getCompanionConfig());
});

r.put('/companion', requireAuth, (req, res) => {
  const current = db.getCompanionConfig();
  const next: CompanionConfig = {
    host: String(req.body?.host ?? current.host),
    port: Number(req.body?.port ?? current.port),
    pollIntervalMs: Math.max(50, Number(req.body?.pollIntervalMs ?? current.pollIntervalMs)),
    enabled: Boolean(req.body?.enabled ?? current.enabled)
  };
  db.setCompanionConfig(next);
  poller.setConfig(next);
  rebuildWantedVariables();
  res.json(next);
});

r.get('/values', (_req, res) => {
  res.json(poller.getAll());
});

r.get('/status', (_req, res) => {
  res.json(poller.getStatus());
});

/**
 * Returns the union of all variable names the dashboard knows about.
 * Used by autocomplete to suggest completions when the user types $(.
 * Includes watched names AND any name that's currently in the polled set
 * (panel-referenced).
 */
r.get('/variable-names', requireAuth, (_req, res) => {
  const watched = db.getWatchedNames();
  const polled = Object.keys(poller.getAll());
  // Also include the poller's "wanted" set since those are referenced but may
  // not yet have values (e.g. just added to a panel, first poll pending).
  const wanted = poller.getWanted();
  const all = new Set<string>([...watched, ...polled, ...wanted]);
  res.json({ names: [...all].sort() });
});

export default r;
