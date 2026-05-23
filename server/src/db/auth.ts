import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Authentication state lives in two places:
 *
 *  1. The `auth_settings` table (1-row): whether auth is enabled, and
 *     if so, the scrypt-hashed PIN and its salt. PIN is stored as
 *     scrypt(pin, salt) hex; we never store the PIN itself, not even
 *     reversibly. Picking off the DB file gives an attacker only the
 *     hash + salt - they still need to brute-force scrypt for every
 *     guess (slow by design).
 *
 *  2. The `sessions` table: one row per active login. Each session is
 *     a random 32-byte token (base64url'd) that the client gets as an
 *     HTTP-only cookie. Expiry is absolute (24h from creation, no
 *     sliding) so a stolen cookie has a hard ceiling on usefulness.
 *
 * Auth is OFF by default. The dashboard works exactly like v0.7 until
 * the user opts in by setting a PIN in Settings.
 */

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;     // 24h, absolute
const SESSION_BYTES = 32;                        // 256-bit token
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

let initialised = false;
let dbRef: DatabaseSync | null = null;

export function initAuthDb(db: DatabaseSync): void {
  if (initialised) return;
  dbRef = db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      pin_hash_hex TEXT NOT NULL DEFAULT '',
      pin_salt_hex TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO auth_settings (id, enabled, pin_hash_hex, pin_salt_hex, updated_at)
      VALUES (1, 0, '', '', 0);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      ip TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
  initialised = true;
  // Best-effort cleanup of expired rows. Cheap, runs once per boot.
  pruneExpiredSessions();
}

function db(): DatabaseSync {
  if (!dbRef) throw new Error('auth db not initialised');
  return dbRef;
}

// --- Settings (single row) -----------------------------------------------

export interface AuthSettings {
  enabled: boolean;
  /** True iff a PIN has been set, even if currently disabled. */
  hasPin: boolean;
  updatedAt: number;
}

export function getAuthSettings(): AuthSettings {
  const row = db().prepare(
    `SELECT enabled, pin_hash_hex AS pinHashHex, updated_at AS updatedAt
     FROM auth_settings WHERE id = 1`
  ).get() as any;
  return {
    enabled: !!row?.enabled,
    hasPin: !!(row?.pinHashHex && row.pinHashHex.length > 0),
    updatedAt: row?.updatedAt ?? 0
  };
}

/**
 * Hash a PIN and persist it. This both sets the PIN and enables auth
 * - we don't expose a way to set a PIN without enabling, because that
 * would be a footgun.
 *
 * The PIN itself is validated by the route layer (4 digits). Here we
 * just hash whatever string we're given.
 */
export function setPinAndEnable(pin: string): void {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
  db().prepare(
    `UPDATE auth_settings
       SET enabled = 1,
           pin_hash_hex = ?,
           pin_salt_hex = ?,
           updated_at = ?
     WHERE id = 1`
  ).run(hash.toString('hex'), salt.toString('hex'), Date.now());
}

/** Clears the PIN AND all live sessions. Used by "disable auth". */
export function disableAuthAndClear(): void {
  db().prepare(
    `UPDATE auth_settings
       SET enabled = 0,
           pin_hash_hex = '',
           pin_salt_hex = '',
           updated_at = ?
     WHERE id = 1`
  ).run(Date.now());
  db().prepare(`DELETE FROM sessions`).run();
}

/**
 * Constant-time PIN comparison. Returns true iff the supplied PIN
 * hashes to the stored value. Returns false if auth is disabled or no
 * PIN is set, on the principle that you can't "log in" to a disabled
 * system.
 */
export function verifyPin(pin: string): boolean {
  const row = db().prepare(
    `SELECT enabled, pin_hash_hex AS pinHashHex, pin_salt_hex AS pinSaltHex
     FROM auth_settings WHERE id = 1`
  ).get() as any;
  if (!row || !row.enabled || !row.pinHashHex || !row.pinSaltHex) {
    // Even when there's nothing to compare against, do a dummy scrypt
    // pass so attackers can't distinguish "no PIN" from "wrong PIN"
    // by timing. The hash is then thrown away.
    const fakeSalt = randomBytes(SCRYPT_SALT_BYTES);
    scryptSync(pin, fakeSalt, SCRYPT_KEYLEN);
    return false;
  }
  const expected = Buffer.from(row.pinHashHex, 'hex');
  const salt = Buffer.from(row.pinSaltHex, 'hex');
  const actual = scryptSync(pin, salt, SCRYPT_KEYLEN);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// --- Sessions ------------------------------------------------------------

export interface Session {
  token: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
}

/**
 * Create a fresh session. Returns the raw token (caller sends as
 * cookie) plus the row metadata.
 */
export function createSession(ip: string): Session {
  const token = randomBytes(SESSION_BYTES).toString('base64url');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  db().prepare(
    `INSERT INTO sessions (token, created_at, expires_at, ip)
     VALUES (?, ?, ?, ?)`
  ).run(token, now, expiresAt, ip);
  return { token, createdAt: now, expiresAt, ip };
}

/**
 * Look up a session by token. Returns it only if it exists AND has
 * not expired; expired rows are deleted on the way past.
 */
export function getValidSession(token: string): Session | undefined {
  if (!token) return undefined;
  const row = db().prepare(
    `SELECT token, created_at AS createdAt, expires_at AS expiresAt, ip
     FROM sessions WHERE token = ?`
  ).get(token) as any;
  if (!row) return undefined;
  if (row.expiresAt < Date.now()) {
    db().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return undefined;
  }
  return row as Session;
}

export function deleteSession(token: string): void {
  if (!token) return;
  db().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function pruneExpiredSessions(): void {
  db().prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(Date.now());
}

export const SESSION_COOKIE_NAME = 'cwd_session';
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
