import { Router } from 'express';
import {
  getAuthSettings, setPinAndEnable, verifyPin, disableAuthAndClear,
  createSession, deleteSession, getValidSession,
  SESSION_COOKIE_NAME, SESSION_TTL_SECONDS
} from '../db/auth.js';
import {
  checkAttempt, recordFailure, recordSuccess
} from '../services/loginAttempts.js';
import { readSessionToken, requireAuth } from '../services/requireAuth.js';

const r = Router();

/**
 * Build the Set-Cookie value for our session token. HTTP-only so JS
 * can't read it, SameSite=Strict to block cross-site CSRF, Path=/
 * so the cookie ships on every protected route.
 *
 * The Secure flag is gated on the CWD_REQUIRE_HTTPS env var. On a
 * plain-HTTP LAN (the default deployment) Secure cookies would never
 * be sent and login would silently fail. Behind a reverse proxy with
 * TLS, set CWD_REQUIRE_HTTPS=1 to flip it on.
 */
function buildCookie(token: string, maxAgeSeconds: number): string {
  const requireHttps = process.env.CWD_REQUIRE_HTTPS === '1';
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Max-Age=${maxAgeSeconds}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (requireHttps) parts.push('Secure');
  return parts.join('; ');
}

function clearCookieValue(): string {
  return buildCookie('', 0);
}

/**
 * Best-effort client IP. Behind a reverse proxy you'd want Express's
 * `trust proxy` setting + X-Forwarded-For; for a LAN setup
 * `req.socket.remoteAddress` is fine.
 */
function clientIp(req: any): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

// --- Status (always callable, no auth required) -------------------------

r.get('/status', (req, res) => {
  const settings = getAuthSettings();
  const token = readSessionToken(req);
  const session = (token && settings.enabled) ? getValidSession(token) : null;
  res.json({
    enabled: settings.enabled,
    authenticated: !!session,
    // We expose only that a PIN exists, not its value. Used by the
    // setup UI to distinguish "first time" from "change PIN".
    hasPin: settings.hasPin
  });
});

// --- Setup (first-time PIN OR change PIN) -------------------------------

/**
 * POST /api/auth/setup body { pin }
 *
 * Two cases:
 *   1. Auth currently OFF                       -> set PIN, enable, no auth needed
 *   2. Auth ON and caller has valid session     -> change PIN
 *
 * In case 2 we DON'T invalidate other sessions: the user expects to
 * stay logged in after changing their own PIN.
 *
 * PIN must be exactly 4 ASCII digits.
 */
r.post('/setup', (req, res) => {
  const pin = String(req.body?.pin ?? '');
  if (!/^[0-9]{4}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    return;
  }
  const settings = getAuthSettings();
  if (settings.enabled) {
    // Changing the PIN requires the caller to already be authed.
    const token = readSessionToken(req);
    const session = token ? getValidSession(token) : null;
    if (!session) {
      res.status(401).json({ error: 'auth required to change PIN' });
      return;
    }
  }
  setPinAndEnable(pin);
  res.json({ ok: true, enabled: true });
});

// --- Login --------------------------------------------------------------

r.post('/login', (req, res) => {
  const ip = clientIp(req);
  const status = checkAttempt(ip);
  if (status.blocked) {
    res.status(429).json({
      error: 'too many failed attempts',
      retryInMs: status.retryInMs
    });
    return;
  }
  const pin = String(req.body?.pin ?? '');
  if (!/^[0-9]{4}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    return;
  }
  const settings = getAuthSettings();
  if (!settings.enabled) {
    res.status(400).json({ error: 'auth is disabled' });
    return;
  }
  if (!verifyPin(pin)) {
    const after = recordFailure(ip);
    res.status(401).json({
      error: 'incorrect PIN',
      remaining: after.remaining,
      blocked: after.blocked,
      retryInMs: after.retryInMs
    });
    return;
  }
  recordSuccess(ip);
  const session = createSession(ip);
  res.setHeader('Set-Cookie', buildCookie(session.token, SESSION_TTL_SECONDS));
  res.json({ ok: true, expiresAt: session.expiresAt });
});

// --- Logout -------------------------------------------------------------

r.post('/logout', (req, res) => {
  const token = readSessionToken(req);
  if (token) deleteSession(token);
  res.setHeader('Set-Cookie', clearCookieValue());
  res.json({ ok: true });
});

// --- Disable auth entirely ---------------------------------------------

/**
 * Wipes the stored PIN and revokes every active session. Requires the
 * caller to currently be authed - otherwise someone who finds a
 * dashboard open in someone else's browser could nuke auth without
 * proving themselves with the PIN.
 */
r.post('/disable', requireAuth, (_req, res) => {
  disableAuthAndClear();
  res.setHeader('Set-Cookie', clearCookieValue());
  res.json({ ok: true, enabled: false });
});

export default r;
