import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  Dashboard, Panel, SavedPanelTemplate, CompanionConfig
} from '../types.js';
import { newId } from '../types.js';

const DATA_DIR = join(homedir(), '.companion-web-dashboard');
const DB_PATH = process.env.CWD_DB_PATH ?? join(DATA_DIR, 'data.db');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

db.exec(`
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  width INTEGER NOT NULL DEFAULT 1920,
  height INTEGER NOT NULL DEFAULT 1080,
  bg_color TEXT NOT NULL DEFAULT '#0a0a0a',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS panels (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY(dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_panels_dashboard ON panels(dashboard_id);

CREATE TABLE IF NOT EXISTS saved_panels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watched_variables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watched_name ON watched_variables(name);
`);

/**
 * Uses node:sqlite (built into Node 22+). No native build step.
 * Aliases snake_case columns to camelCase so rows map directly to TS types.
 */

// --- Dashboards ---
// background_fit lives on the dashboards table; the actual image bytes
// live in dashboard_backgrounds. We expose background_fit + a derived
// has_background boolean so the client doesn't need a second round-trip
// to know whether to render a background <img>.
const DASHBOARD_COLS = `
  id, name, width, height, bg_color AS bgColor,
  COALESCE(background_fit, 'cover') AS backgroundFit,
  EXISTS(SELECT 1 FROM dashboard_backgrounds WHERE dashboard_id = dashboards.id) AS hasBackground,
  created_at AS createdAt, updated_at AS updatedAt`;

function rowToDashboard(row: any): Dashboard {
  return {
    ...row,
    // SQLite EXISTS returns 0/1, normalise to boolean.
    hasBackground: !!row.hasBackground
  };
}

export function listDashboards(): Dashboard[] {
  const rows = db.prepare(
    `SELECT ${DASHBOARD_COLS} FROM dashboards ORDER BY updated_at DESC`
  ).all() as any[];
  return rows.map(rowToDashboard);
}

export function getDashboard(id: string): Dashboard | undefined {
  const row = db.prepare(
    `SELECT ${DASHBOARD_COLS} FROM dashboards WHERE id = ?`
  ).get(id) as any;
  return row ? rowToDashboard(row) : undefined;
}

export function insertDashboard(d: Dashboard): void {
  db.prepare(
    `INSERT INTO dashboards (id, name, width, height, bg_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(d.id, d.name, d.width, d.height, d.bgColor, d.createdAt, d.updatedAt);
}

export function updateDashboard(d: Dashboard): void {
  db.prepare(
    `UPDATE dashboards SET name=?, width=?, height=?, bg_color=?,
                           background_fit=?, updated_at=?
     WHERE id=?`
  ).run(d.name, d.width, d.height, d.bgColor,
        d.backgroundFit ?? 'cover', d.updatedAt, d.id);
}

export function deleteDashboard(id: string): void {
  db.prepare(`DELETE FROM dashboards WHERE id = ?`).run(id);
}

// --- Panels ---
function hydratePanel(p: Panel): Panel {
  // Backfill new fields for panels stored before the field existed.
  const fixCell = <T extends { valign?: 'top' | 'middle' | 'bottom' }>(c: T): T =>
    (c.valign ? c : { ...c, valign: 'middle' });
  if (p.header) p.header = fixCell(p.header as any);
  p.cells = p.cells.map(c => fixCell(c as any));
  return p;
}

export function listPanels(dashboardId: string): Panel[] {
  const rows = db.prepare(
    `SELECT data FROM panels WHERE dashboard_id = ?`
  ).all(dashboardId) as unknown as { data: string }[];
  return rows.map(r => hydratePanel(JSON.parse(r.data) as Panel));
}

export function getPanel(id: string): Panel | undefined {
  const row = db.prepare(`SELECT data FROM panels WHERE id = ?`).get(id) as
    unknown as { data: string } | undefined;
  return row ? hydratePanel(JSON.parse(row.data) as Panel) : undefined;
}

export function upsertPanel(p: Panel): void {
  db.prepare(
    `INSERT INTO panels (id, dashboard_id, data) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data,
                                   dashboard_id = excluded.dashboard_id`
  ).run(p.id, p.dashboardId, JSON.stringify(p));
}

export function deletePanel(id: string): void {
  db.prepare(`DELETE FROM panels WHERE id = ?`).run(id);
}

// --- Saved panel templates ---
export function listSavedPanels(): SavedPanelTemplate[] {
  const rows = db.prepare(
    `SELECT data FROM saved_panels ORDER BY created_at DESC`
  ).all() as unknown as { data: string }[];
  return rows.map(r => JSON.parse(r.data) as SavedPanelTemplate);
}

export function getSavedPanel(id: string): SavedPanelTemplate | undefined {
  const row = db.prepare(`SELECT data FROM saved_panels WHERE id = ?`).get(id) as
    unknown as { data: string } | undefined;
  return row ? JSON.parse(row.data) as SavedPanelTemplate : undefined;
}

export function insertSavedPanel(t: SavedPanelTemplate): void {
  db.prepare(
    `INSERT INTO saved_panels (id, name, data, created_at) VALUES (?, ?, ?, ?)`
  ).run(t.id, t.name, JSON.stringify(t), t.createdAt);
}

/**
 * Rename a saved-panel template. Updates both the `name` column AND the
 * cached name inside the serialised `data` blob - listSavedPanels reads
 * from `data`, so a single-column update would silently appear to not
 * take effect.
 */
export function updateSavedPanelName(id: string, name: string): SavedPanelTemplate | undefined {
  const existing = getSavedPanel(id);
  if (!existing) return undefined;
  const next: SavedPanelTemplate = { ...existing, name };
  db.prepare(
    `UPDATE saved_panels SET name = ?, data = ? WHERE id = ?`
  ).run(name, JSON.stringify(next), id);
  return next;
}

export function deleteSavedPanel(id: string): void {
  db.prepare(`DELETE FROM saved_panels WHERE id = ?`).run(id);
}

// --- Settings (Companion config etc) ---
export function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    unknown as { value: string } | undefined;
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export function setSetting<T>(key: string, value: T): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, JSON.stringify(value));
}

// --- Companion config helpers ---
const COMPANION_KEY = 'companion';
const DEFAULT_COMPANION: CompanionConfig = {
  host: '127.0.0.1',
  port: 8000,
  pollIntervalMs: 100,
  enabled: false
};

export function getCompanionConfig(): CompanionConfig {
  return getSetting<CompanionConfig>(COMPANION_KEY, DEFAULT_COMPANION);
}

export function setCompanionConfig(cfg: CompanionConfig): void {
  setSetting(COMPANION_KEY, cfg);
}

// --- Watched variables ---
// User-curated list of `connection:varname` strings to poll regardless of
// whether they're referenced by any panel. Lets users discover/preview all
// the variables they care about from a single page.

export interface WatchedVariable {
  id: string;
  name: string;       // 'atem:pgm1_input', 'custom:cue', 'internal:time_hms', etc.
  createdAt: number;
}

export function listWatchedVariables(): WatchedVariable[] {
  const rows = db.prepare(
    'SELECT id, name, created_at AS createdAt FROM watched_variables ORDER BY name ASC'
  ).all() as unknown as WatchedVariable[];
  return rows;
}

export function getWatchedNames(): string[] {
  return listWatchedVariables().map(w => w.name);
}

/**
 * Adds one watched variable. Returns the row, or the existing row if the name
 * was already watched (idempotent).
 */
export function addWatchedVariable(rawName: string): WatchedVariable {
  const name = normaliseVarName(rawName);
  if (!name) throw new Error(`invalid variable name: ${rawName}`);
  const existing = db.prepare('SELECT id, name, created_at AS createdAt FROM watched_variables WHERE name = ?').get(name) as unknown as WatchedVariable | undefined;
  if (existing) return existing;
  const row: WatchedVariable = { id: newId(), name, createdAt: Date.now() };
  db.prepare('INSERT INTO watched_variables (id, name, created_at) VALUES (?, ?, ?)')
    .run(row.id, row.name, row.createdAt);
  return row;
}

/**
 * Bulk add. Accepts an array OR a multi-line string (textarea paste).
 * Each entry can be either bare `conn:name` or wrapped `$(conn:name)`.
 * Lines with no colon are skipped. Returns the list of successfully added/
 * existing rows.
 */
export function addWatchedVariablesBulk(input: string | string[]): {
  added: WatchedVariable[];
  skipped: string[];
} {
  const lines = Array.isArray(input) ? input : input.split(/[\r\n]+/);
  const added: WatchedVariable[] = [];
  const skipped: string[] = [];
  for (const raw of lines) {
    const name = normaliseVarName(raw);
    if (!name) {
      const trimmed = raw.trim();
      if (trimmed) skipped.push(trimmed);
      continue;
    }
    try {
      added.push(addWatchedVariable(name));
    } catch {
      skipped.push(raw.trim());
    }
  }
  return { added, skipped };
}

export function removeWatchedVariable(id: string): void {
  db.prepare('DELETE FROM watched_variables WHERE id = ?').run(id);
}

export function removeWatchedVariableByName(name: string): void {
  const n = normaliseVarName(name);
  if (n) db.prepare('DELETE FROM watched_variables WHERE name = ?').run(n);
}

/**
 * Accepts: 'atem:pgm1_input', '$(atem:pgm1_input)', '  atem:pgm1_input  '.
 * Returns the canonical form `conn:name`, or null if not a valid variable id.
 */
function normaliseVarName(raw: string): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Strip $(...) wrapper
  const m = s.match(/^\$\(([^)]+)\)$/);
  if (m) s = m[1].trim();
  // Must contain exactly one colon and non-empty parts on both sides
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) return null;
  // No spaces allowed
  if (/\s/.test(s)) return null;
  return s;
}

export { db };
