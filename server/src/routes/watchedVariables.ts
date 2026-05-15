import { Router } from 'express';
import * as db from '../db/index.js';
import { rebuildWantedVariables } from '../services/orchestrator.js';

const r = Router();

r.get('/', (_req, res) => {
  res.json(db.listWatchedVariables());
});

r.post('/', (req, res) => {
  // Body: { name: string } OR { names: string[] | string }
  // Single OR bulk in one endpoint for convenience.
  const single = typeof req.body?.name === 'string' ? req.body.name : null;
  const bulk = req.body?.names;
  try {
    if (single) {
      const row = db.addWatchedVariable(single);
      rebuildWantedVariables();
      res.json({ added: [row], skipped: [] });
      return;
    }
    if (bulk !== undefined) {
      const result = db.addWatchedVariablesBulk(bulk);
      rebuildWantedVariables();
      res.json(result);
      return;
    }
    res.status(400).json({ error: 'provide name or names' });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

r.delete('/:id', (req, res) => {
  db.removeWatchedVariable(req.params.id);
  rebuildWantedVariables();
  res.status(204).end();
});

export default r;
