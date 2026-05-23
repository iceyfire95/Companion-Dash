import type { Request, Response, NextFunction } from 'express';
import {
  getAuthSettings, getValidSession, SESSION_COOKIE_NAME
} from '../db/auth.js';

/**
 * Pull the session cookie out of the raw Cookie header. We don't use
 * cookie-parser to keep the dep tree tiny; this regex handles the
 * only cookie format we ever set (HTTP-only, no quotes, no commas in
 * values - it's always a base64url token).
 */
export function readSessionToken(req: Request): string {
  const raw = req.headers.cookie;
  if (!raw) return '';
  // Split on '; ' first, fall back to ';' for forgiving parsing.
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE_NAME) {
      return part.slice(eq + 1).trim();
    }
  }
  return '';
}

/**
 * Gate a mutation route. Behaviour:
 *
 *  - Auth disabled    → pass through. Backwards-compatible with v0.7.
 *  - Valid session    → pass through, attach session to req for routes
 *                       that want to log/audit.
 *  - Anything else    → 401 with { error: 'auth required' }.
 *
 * 401 is the contract the client UI relies on to pop the PIN modal.
 * Don't 403 here - that's reserved for "logged in but not authorised",
 * which we don't have (it's a single-role app).
 */
export function requireAuth(
  req: Request, res: Response, next: NextFunction
): void {
  const settings = getAuthSettings();
  if (!settings.enabled) { next(); return; }
  const token = readSessionToken(req);
  const session = token ? getValidSession(token) : undefined;
  if (!session) {
    res.status(401).json({ error: 'auth required' });
    return;
  }
  // Attach to request for downstream handlers/tests.
  (req as any).session = session;
  next();
}
