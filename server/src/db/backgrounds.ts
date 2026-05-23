import { DatabaseSync } from 'node:sqlite';

/**
 * Dashboard background image storage.
 *
 * Image bytes live in their own table (`dashboard_backgrounds`) so the
 * blob never appears in normal dashboard list/get queries. The
 * `background_fit` text column lives on the dashboards table itself
 * (see db/index.ts migration) because fit-mode is per-dashboard config
 * that persists even if the user removes the image.
 *
 * Hard size cap: 8 MB per image. Anything larger is rejected at the
 * route layer with a 413. PNG and JPEG only.
 */

export const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg']);

let initialised = false;
let dbRef: DatabaseSync | null = null;

export function initBackgroundsDb(db: DatabaseSync): void {
  if (initialised) return;
  dbRef = db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_backgrounds (
      dashboard_id TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
    );
  `);
  // Add background_fit column to dashboards table if missing.
  const cols = db.prepare(`PRAGMA table_info(dashboards)`).all() as any[];
  const hasFit = cols.some(c => c.name === 'background_fit');
  if (!hasFit) {
    db.exec(`ALTER TABLE dashboards ADD COLUMN background_fit TEXT NOT NULL DEFAULT 'cover'`);
  }
  initialised = true;
}

function db(): DatabaseSync {
  if (!dbRef) throw new Error('backgrounds db not initialised');
  return dbRef;
}

export interface BackgroundRow {
  dashboardId: string;
  mime: string;
  data: Uint8Array;
  updatedAt: number;
}

export function getBackground(dashboardId: string): BackgroundRow | undefined {
  const row = db().prepare(
    `SELECT dashboard_id AS dashboardId, mime, data, updated_at AS updatedAt
     FROM dashboard_backgrounds WHERE dashboard_id = ?`
  ).get(dashboardId) as any;
  if (!row) return undefined;
  // node:sqlite returns blobs as Uint8Array. Be defensive in case it's
  // returned as Buffer in some Node versions.
  const data = row.data instanceof Uint8Array
    ? row.data
    : new Uint8Array(row.data);
  return { ...row, data };
}

export function hasBackground(dashboardId: string): boolean {
  const row = db().prepare(
    `SELECT 1 FROM dashboard_backgrounds WHERE dashboard_id = ?`
  ).get(dashboardId);
  return !!row;
}

export function upsertBackground(
  dashboardId: string, mime: string, data: Uint8Array
): void {
  db().prepare(
    `INSERT INTO dashboard_backgrounds (dashboard_id, mime, data, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(dashboard_id) DO UPDATE SET
       mime = excluded.mime,
       data = excluded.data,
       updated_at = excluded.updated_at`
  ).run(dashboardId, mime, data, Date.now());
}

export function deleteBackground(dashboardId: string): void {
  db().prepare(
    `DELETE FROM dashboard_backgrounds WHERE dashboard_id = ?`
  ).run(dashboardId);
}

export type BackgroundFit = 'cover' | 'contain' | 'stretch';

export function getBackgroundFit(dashboardId: string): BackgroundFit {
  const row = db().prepare(
    `SELECT background_fit AS fit FROM dashboards WHERE id = ?`
  ).get(dashboardId) as any;
  const v = row?.fit as string | undefined;
  if (v === 'cover' || v === 'contain' || v === 'stretch') return v;
  return 'cover';
}

export function setBackgroundFit(dashboardId: string, fit: BackgroundFit): void {
  db().prepare(
    `UPDATE dashboards SET background_fit = ?, updated_at = ? WHERE id = ?`
  ).run(fit, Date.now(), dashboardId);
}
