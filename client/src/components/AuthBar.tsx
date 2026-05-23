import { useEffect, useState, useRef } from 'react';
import {
  useAuthStatus, login, logout, openLoginModal,
  onLoginModalOpen, resolveLoginModal, hasPendingLogin,
  type LoginError
} from '../lib/auth';

// ===========================================================================
// LoginModal — global overlay, mounted once at the app root in main.tsx.
//
// It listens for `onLoginModalOpen` events from anywhere in the app
// (including imperative calls from the api wrapper on 401) and pops up.
// The user enters a 4-digit PIN; on success we close and signal the
// awaiting caller via `resolveLoginModal(true)`. On dismiss it's false,
// so the awaiting caller (typically the api wrapper) knows to abort.
// ===========================================================================

export function LoginModal() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for "open me" requests from the rest of the app.
  useEffect(() => {
    return onLoginModalOpen(() => {
      setOpen(true);
      setPin('');
      setError(null);
      setRetryAt(null);
      // Focus the input on next paint.
      setTimeout(() => inputRef.current?.focus(), 50);
    });
  }, []);

  // While we're showing a "blocked, retry in N" message, tick a clock so
  // the displayed seconds count down. Cleaner than a custom timer per
  // render.
  useEffect(() => {
    if (retryAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [retryAt]);

  function close(success: boolean) {
    setOpen(false);
    setPin('');
    setError(null);
    setRetryAt(null);
    resolveLoginModal(success);
  }

  async function submit() {
    if (busy) return;
    if (!/^[0-9]{4}$/.test(pin)) {
      setError('Enter a 4-digit PIN');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(pin);
      close(true);
    } catch (e) {
      const err = e as LoginError;
      if (err.blocked && err.retryInMs) {
        setRetryAt(Date.now() + err.retryInMs);
        setError(null);
      } else if (typeof err.remaining === 'number') {
        setError(`Incorrect PIN. ${err.remaining} attempts left.`);
      } else {
        setError(err.message || 'Login failed');
      }
      setPin('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const retrySecs = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
  const isBlocked = retryAt !== null && retrySecs > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000
    }}
    onMouseDown={(e) => {
      // Click outside the modal box dismisses.
      if (e.target === e.currentTarget) close(false);
    }}>
      <div style={{
        background: '#151515', border: '1px solid #2a2a2a',
        borderRadius: 8, padding: 24, minWidth: 320, maxWidth: 380,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
      }}>
        <div style={{
          fontSize: 11, color: '#888', textTransform: 'uppercase',
          letterSpacing: 0.5, fontWeight: 600, marginBottom: 14
        }}>
          🔒 Editor PIN
        </div>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { void submit(); }
            if (e.key === 'Escape') close(false);
          }}
          placeholder="••••"
          disabled={busy || isBlocked}
          style={{
            width: '100%',
            fontSize: 28,
            textAlign: 'center',
            letterSpacing: '0.4em',
            padding: '12px 8px',
            background: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#fff'
          }}
        />
        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#ef4444' }}>{error}</div>
        )}
        {isBlocked && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#f59e0b' }}>
            Too many failed attempts. Try again in {retrySecs}s.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={() => close(false)} disabled={busy}>Cancel</button>
          <button className="primary" onClick={submit}
                  disabled={busy || isBlocked || pin.length !== 4}>
            {busy ? '…' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// AuthBar — toolbar button that adapts to the current auth state.
//   - auth off              → null (rendered as empty fragment)
//   - on + not authed       → 🔓 Log in button
//   - on + authed           → 🔒 Log out button
//
// Page toolbars include `<AuthBar />` so the button appears in the top
// right of every page consistently.
// ===========================================================================

export function AuthBar() {
  const status = useAuthStatus();
  const [busy, setBusy] = useState(false);
  if (!status.enabled) return null;

  async function onLogin() {
    if (busy) return;
    setBusy(true);
    try {
      // Returns true once user is authenticated (or false if dismissed).
      // We don't actually need the return value here.
      await openLoginModal();
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    if (busy) return;
    if (!confirm('Log out?')) return;
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  }

  if (!status.authenticated) {
    return (
      <button onClick={onLogin} disabled={busy}
              title="Editing is locked - click to unlock with PIN"
              style={{ padding: '4px 10px' }}>
        🔓 Log in
      </button>
    );
  }
  return (
    <button onClick={onLogout} disabled={busy}
            title="You are authenticated; click to log out"
            style={{ padding: '4px 10px' }}>
      🔒 Log out
    </button>
  );
}

/**
 * Hook: returns true iff the current user can mutate (i.e. either auth
 * is off, or it's on and they're authenticated). Pages use this to
 * hide / disable edit-only UI.
 */
export function useCanEdit(): boolean {
  const s = useAuthStatus();
  return !s.enabled || s.authenticated;
}

// Silence unused-import warnings during tsc when nobody reads
// hasPendingLogin from a component. It's available for future use.
export { hasPendingLogin };
