import { DatabaseSync } from 'node:sqlite';
import type { TallySource } from '../types-tally.js';
import { newId } from '../types.js';

/**
 * Tally source storage. Uses the shared sqlite handle from db/index.ts.
 * Table + new columns are created lazily on first call.
 */

let initialised = false;
let dbRef: DatabaseSync | null = null;

export function initTallyDb(db: DatabaseSync): void {
  if (initialised) return;
  dbRef = db;
  // Base table (v0.5.0 shape, no match columns).
  db.exec(`
    CREATE TABLE IF NOT EXISTS tally_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      pvw_variable TEXT NOT NULL DEFAULT '',
      pgm_variable TEXT NOT NULL DEFAULT '',
      show_label INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tally_sources_slug ON tally_sources(slug);
  `);
  // v0.6.0: add match-value columns for ATEM-style "var == N" tally.
  // PRAGMA table_info is the cheapest "does this column exist" check.
  const cols = db.prepare(`PRAGMA table_info(tally_sources)`).all() as any[];
  const hasCol = (n: string) => cols.some(c => c.name === n);
  if (!hasCol('pvw_match_value')) {
    db.exec(`ALTER TABLE tally_sources ADD COLUMN pvw_match_value TEXT NOT NULL DEFAULT ''`);
  }
  if (!hasCol('pgm_match_value')) {
    db.exec(`ALTER TABLE tally_sources ADD COLUMN pgm_match_value TEXT NOT NULL DEFAULT ''`);
  }
  initialised = true;
}

function db(): DatabaseSync {
  if (!dbRef) throw new Error('tally db not initialised');
  return dbRef;
}

function rowToSource(row: any): TallySource {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    pvwVariable: row.pvwVariable ?? '',
    pgmVariable: row.pgmVariable ?? '',
    pvwMatchValue: row.pvwMatchValue ?? '',
    pgmMatchValue: row.pgmMatchValue ?? '',
    showLabel: !!row.showLabel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const COLS = `id, name, slug,
  pvw_variable AS pvwVariable, pgm_variable AS pgmVariable,
  pvw_match_value AS pvwMatchValue, pgm_match_value AS pgmMatchValue,
  show_label AS showLabel,
  created_at AS createdAt, updated_at AS updatedAt`;

export function listTallySources(): TallySource[] {
  const rows = db().prepare(
    `SELECT ${COLS} FROM tally_sources ORDER BY name ASC`
  ).all() as any[];
  return rows.map(rowToSource);
}

export function getTallySource(id: string): TallySource | undefined {
  const row = db().prepare(
    `SELECT ${COLS} FROM tally_sources WHERE id = ?`
  ).get(id) as any;
  return row ? rowToSource(row) : undefined;
}

export function getTallySourceBySlug(slug: string): TallySource | undefined {
  const row = db().prepare(
    `SELECT ${COLS} FROM tally_sources WHERE slug = ?`
  ).get(slug) as any;
  return row ? rowToSource(row) : undefined;
}

/**
 * Set of canonical conn:varname strings used by ANY tally source.
 * Match-value mode adds no extra variables - it just changes how the
 * existing pvw/pgm vars are interpreted.
 */
export function getTallyWatchedNames(): string[] {
  const rows = db().prepare(
    `SELECT pvw_variable AS pvw, pgm_variable AS pgm FROM tally_sources`
  ).all() as any[];
  const out = new Set<string>();
  for (const r of rows) {
    if (r.pvw) out.add(r.pvw);
    if (r.pgm) out.add(r.pgm);
  }
  return [...out];
}

export function insertTallySource(s: TallySource): void {
  db().prepare(
    `INSERT INTO tally_sources
       (id, name, slug, pvw_variable, pgm_variable,
        pvw_match_value, pgm_match_value,
        show_label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(s.id, s.name, s.slug,
        s.pvwVariable, s.pgmVariable,
        s.pvwMatchValue ?? '', s.pgmMatchValue ?? '',
        s.showLabel ? 1 : 0, s.createdAt, s.updatedAt);
}

export function updateTallySource(s: TallySource): void {
  db().prepare(
    `UPDATE tally_sources
       SET name = ?, slug = ?,
           pvw_variable = ?, pgm_variable = ?,
           pvw_match_value = ?, pgm_match_value = ?,
           show_label = ?, updated_at = ?
     WHERE id = ?`
  ).run(s.name, s.slug,
        s.pvwVariable, s.pgmVariable,
        s.pvwMatchValue ?? '', s.pgmMatchValue ?? '',
        s.showLabel ? 1 : 0, s.updatedAt, s.id);
}

export function deleteTallySource(id: string): void {
  db().prepare(`DELETE FROM tally_sources WHERE id = ?`).run(id);
}

/**
 * Bulk insert. Each item is treated as a NEW row (id is regenerated, slug
 * is uniquified). Used by auto-populate wizard.
 *
 * If a row's slug collides with an existing one, the inserted slug gets
 * `-N` appended. We do this in JS instead of a transaction because slug
 * uniqueness requires lookups; performance isn't critical (one click).
 */
export function bulkInsertTallySources(
  partials: Array<Partial<TallySource>>
): TallySource[] {
  const out: TallySource[] = [];
  for (const p of partials) {
    const s = newTallySource(p);
    insertTallySource(s);
    out.push(s);
  }
  return out;
}

// --- Helpers ---

/**
 * URL-safe slug from arbitrary name. Lowercase, ascii, dashes for spaces,
 * strips everything else. Empty result becomes 'source'.
 */
export function makeSlug(name: string): string {
  const base = String(name).trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'source';
}

export function uniqueSlug(name: string, excludeId?: string): string {
  const base = makeSlug(name);
  let candidate = base;
  let n = 2;
  while (true) {
    const row = db().prepare(
      `SELECT id FROM tally_sources WHERE slug = ?`
    ).get(candidate) as any;
    if (!row || (excludeId && row.id === excludeId)) return candidate;
    candidate = `${base}-${n++}`;
    if (n > 9999) throw new Error('could not allocate unique slug');
  }
}

/** Canonicalises 'conn:var', '$(conn:var)', '  conn:var ' → 'conn:var' or ''. */
export function canonVar(raw: string): string {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';
  const m = s.match(/^\$\(([^)]+)\)$/);
  if (m) s = m[1].trim();
  if (/\s/.test(s)) return '';
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) return '';
  return s;
}

export function newTallySource(partial: Partial<TallySource>): TallySource {
  const now = Date.now();
  const name = (partial.name ?? 'Source').trim() || 'Source';
  const slug = partial.slug
    ? uniqueSlug(partial.slug)
    : uniqueSlug(name);
  return {
    id: newId(),
    name,
    slug,
    pvwVariable: canonVar(partial.pvwVariable ?? ''),
    pgmVariable: canonVar(partial.pgmVariable ?? ''),
    pvwMatchValue: partial.pvwMatchValue ?? '',
    pgmMatchValue: partial.pgmMatchValue ?? '',
    showLabel: partial.showLabel !== false,
    createdAt: now,
    updatedAt: now
  };
}
