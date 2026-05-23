import { Router } from 'express';
import * as tdb from '../db/tally.js';
import { rebuildWantedVariables } from '../services/orchestrator.js';
import { autoPopulate, type AutoPopulateRequest } from '../services/tallyAutoPopulate.js';
import { requireAuth } from '../services/requireAuth.js';

const r = Router();

r.get('/', (_req, res) => {
  res.json(tdb.listTallySources());
});

r.get('/by-slug/:slug', (req, res) => {
  const row = tdb.getTallySourceBySlug(req.params.slug);
  if (!row) { res.status(404).json({ error: 'not found' }); return; }
  res.json(row);
});

/**
 * Preview what would be created for a given module + connection + count.
 * Probes companion for input labels; returns the proposed rows WITHOUT
 * saving them. UI shows this as a list with checkboxes / edit-name.
 */
r.post('/auto-populate/preview', requireAuth, async (req, res) => {
  try {
    const body = req.body ?? {};
    const proposalReq: AutoPopulateRequest = {
      module: body.module,
      connection: String(body.connection ?? ''),
      inputCount: Number(body.inputCount ?? 8),
      tslStartAddress: body.tslStartAddress,
      tslPvwBit: body.tslPvwBit,
      tslPgmBit: body.tslPgmBit,
      vmixMix: body.vmixMix,
      atemME: body.atemME,
      atemStartInput: body.atemStartInput
    };
    const result = await autoPopulate(proposalReq);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/**
 * Bulk insert. Takes the (possibly user-edited) preview rows and persists
 * them. Each row is treated as a brand-new TallySource - we regenerate
 * id + slug, so slug collisions auto-suffix.
 */
r.post('/bulk', requireAuth, (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) {
      res.status(400).json({ error: 'items array required' });
      return;
    }
    const created = tdb.bulkInsertTallySources(items);
    rebuildWantedVariables();
    res.json({ created });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

r.get('/:id', (req, res) => {
  const row = tdb.getTallySource(req.params.id);
  if (!row) { res.status(404).json({ error: 'not found' }); return; }
  res.json(row);
});

r.post('/', requireAuth, (req, res) => {
  try {
    const s = tdb.newTallySource(req.body ?? {});
    tdb.insertTallySource(s);
    rebuildWantedVariables();
    res.json(s);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

r.put('/:id', requireAuth, (req, res) => {
  const existing = tdb.getTallySource(req.params.id);
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }
  const body = req.body ?? {};
  const name = (body.name ?? existing.name).trim() || existing.name;
  let slug = existing.slug;
  if (typeof body.slug === 'string' && body.slug.trim()) {
    slug = tdb.uniqueSlug(body.slug, existing.id);
  } else if (name !== existing.name) {
    slug = tdb.uniqueSlug(name, existing.id);
  }
  const updated = {
    ...existing,
    name,
    slug,
    pvwVariable: tdb.canonVar(body.pvwVariable ?? existing.pvwVariable),
    pgmVariable: tdb.canonVar(body.pgmVariable ?? existing.pgmVariable),
    pvwMatchValue: typeof body.pvwMatchValue === 'string'
      ? body.pvwMatchValue : (existing.pvwMatchValue ?? ''),
    pgmMatchValue: typeof body.pgmMatchValue === 'string'
      ? body.pgmMatchValue : (existing.pgmMatchValue ?? ''),
    showLabel: typeof body.showLabel === 'boolean' ? body.showLabel : existing.showLabel,
    updatedAt: Date.now()
  };
  try {
    tdb.updateTallySource(updated);
    rebuildWantedVariables();
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

r.delete('/:id', requireAuth, (req, res) => {
  tdb.deleteTallySource(req.params.id);
  rebuildWantedVariables();
  res.status(204).end();
});

export default r;
