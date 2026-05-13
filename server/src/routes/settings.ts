import { Router } from 'express';
import * as db from '../db/index.js';
import { poller } from '../services/poller.js';
import { rebuildWantedVariables } from '../services/orchestrator.js';
import type { CompanionConfig } from '../types.js';

const r = Router();

r.get('/companion', (_req, res) => {
  res.json(db.getCompanionConfig());
});

r.put('/companion', (req, res) => {
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

export default r;
