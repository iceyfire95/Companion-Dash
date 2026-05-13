import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  Dashboard, Panel, SavedPanelTemplate, CompanionConfig
} from '../types.js';

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
`);

/**
 * Uses node:sqlite (built into Node 22+). No native build step.
 * Aliases snake_case columns to camelCase so rows map directly to TS types.
 */

// --- Dashboards ---
export function listDashboards(): Dashboard[] {
  return db.prepare(
    `SELECT id, name, width, height, bg_color AS bgColor,
            created_at AS createdAt, updated_at AS updatedAt
     FROM dashboards ORDER BY updated_at DESC`
  ).all() as unknown as Dashboard[];
}

export function getDashboard(id: string): Dashboard | undefined {
  const row = db.prepare(
    `SELECT id, name, width, height, bg_color AS bgColor,
            created_at AS createdAt, updated_at AS updatedAt
     FROM dashboards WHERE id = ?`
  ).get(id);
  return row ? (row as unknown as Dashboard) : undefined;
}

export function insertDashboard(d: Dashboard): void {
  db.prepare(
    `INSERT INTO dashboards (id, name, width, height, bg_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(d.id, d.name, d.width, d.height, d.bgColor, d.createdAt, d.updatedAt);
}

export function updateDashboard(d: Dashboard): void {
  db.prepare(
    `UPDATE dashboards SET name=?, width=?, height=?, bg_color=?, updated_at=?
     WHERE id=?`
  ).run(d.name, d.width, d.height, d.bgColor, d.updatedAt, d.id);
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

export { db };
