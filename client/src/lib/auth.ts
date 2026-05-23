import { useEffect, useState, useCallback } from 'react';

/**
 * Shared auth-status singleton.
 *
 * One subscriber tree updates whenever any page calls
 * `refreshAuthStatus()` (typically after login / logout / 401 from a
 * mutation). Also re-polls on focus and every 60s so a logout from
 * another tab eventually propagates.
 *
 * The status itself is just three booleans, so we don't bother with a
 * full state library. A Set<setter> + an `await fetch` is enough.
 */

export interface AuthStatus {
  /** Auth feature on/off globally. When false, the UI behaves like v0.7. */
  enabled: boolean;
  /** True iff the current cookie corresponds to a live session. */
  authenticated: boolean;
  /** True iff a PIN has been set (regardless of enabled). */
  hasPin: boolean;
}

const DEFAULT: AuthStatus = {
  enabled: false,
  authenticated: false,
  hasPin: false
};

let cached: AuthStatus = DEFAULT;
let inflight: Promise<AuthStatus> | null = null;
const subs = new Set<(s: AuthStatus) => void>();

async function fetchStatus(): Promise<AuthStatus> {
  // Coalesce concurrent fetches so a burst of 401s doesn't hammer.
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/auth/status', { credentials: 'same-origin' });
      if (!r.ok) return cached;
      const next = (await r.json()) as AuthStatus;
      cached = next;
      for (const fn of subs) fn(next);
      return next;
    } catch {
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Trigger a status refresh from anywhere. Use after login/logout
 * actions, or after the api wrapper sees a 401 so the UI knows to
 * pop the login modal.
 */
export function refreshAuthStatus(): Promise<AuthStatus> {
  return fetchStatus();
}

export function useAuthStatus(): AuthStatus {
  const [s, setS] = useState<AuthStatus>(cached);
  useEffect(() => {
    subs.add(setS);
    void fetchStatus();
    const onFocus = () => { void fetchStatus(); };
    const id = setInterval(() => { void fetchStatus(); }, 60_000);
    window.addEventListener('focus', onFocus);
    return () => {
      subs.delete(setS);
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  return s;
}

/**
 * Login. Returns the parsed server body on success; throws an Error
 * with `.message = "<error>"` on failure. The 'remaining' / 'blocked'
 * / 'retryInMs' fields, when present, are attached to the error so
 * the modal can show specific feedback.
 */
export interface LoginError extends Error {
  remaining?: number;
  blocked?: boolean;
  retryInMs?: number;
  httpStatus?: number;
}

export async function login(pin: string): Promise<void> {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  let body: any = {};
  try { body = await r.json(); } catch { /* ignore */ }
  if (!r.ok) {
    const err = new Error(body?.error ?? `HTTP ${r.status}`) as LoginError;
    err.httpStatus = r.status;
    err.remaining = body?.remaining;
    err.blocked = body?.blocked;
    err.retryInMs = body?.retryInMs;
    throw err;
  }
  await refreshAuthStatus();
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  // Optimistic local update before the refresh round-trip.
  cached = { ...cached, authenticated: false };
  for (const fn of subs) fn(cached);
  await refreshAuthStatus();
}

/**
 * Set the PIN AND enable auth (first-time setup), OR change the PIN
 * if already authenticated. Server enforces "must already be authed
 * if currently enabled".
 */
export async function setupPin(pin: string): Promise<void> {
  const r = await fetch('/api/auth/setup', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { msg = (await r.json())?.error ?? msg; } catch { /* */ }
    throw new Error(msg);
  }
  await refreshAuthStatus();
}

export async function disableAuth(): Promise<void> {
  const r = await fetch('/api/auth/disable', {
    method: 'POST',
    credentials: 'same-origin'
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { msg = (await r.json())?.error ?? msg; } catch { /* */ }
    throw new Error(msg);
  }
  await refreshAuthStatus();
}

// ---------------------------------------------------------------------------
// Login modal global open/close.
//
// Triggering a modal from imperative code (e.g. the API wrapper on a
// 401 response) is awkward in plain React. We expose a tiny event-bus
// so the API layer can call `openLoginModal()` and the root component
// listens.
//
// Returns a Promise that resolves after the user successfully logs in
// (or rejects if they close the modal without authenticating). The
// API wrapper awaits this and retries its original request.
// ---------------------------------------------------------------------------

type ModalResolver = (ok: boolean) => void;
let pendingResolver: ModalResolver | null = null;
const openListeners = new Set<() => void>();

export function openLoginModal(): Promise<boolean> {
  // If a modal is already open, return the existing promise so callers
  // queue up. Only one modal at a time.
  if (pendingResolver) {
    return new Promise<boolean>((res) => {
      const prev = pendingResolver!;
      pendingResolver = (ok) => { prev(ok); res(ok); };
    });
  }
  return new Promise<boolean>((res) => {
    pendingResolver = res;
    for (const fn of openListeners) fn();
  });
}

export function onLoginModalOpen(fn: () => void): () => void {
  openListeners.add(fn);
  return () => openListeners.delete(fn);
}

/** Called from the modal when it resolves. */
export function resolveLoginModal(ok: boolean): void {
  const r = pendingResolver;
  pendingResolver = null;
  if (r) r(ok);
}

/** True when something is awaiting a modal-resolution. */
export function hasPendingLogin(): boolean {
  return pendingResolver !== null;
}
