import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PollerStatus } from '../lib/api';
import type { CompanionConfig } from '../types';
import { AuthBar, useCanEdit } from '../components/AuthBar';
import {
  useAuthStatus, setupPin, disableAuth, openLoginModal
} from '../lib/auth';

export function SettingsPage() {
  const [cfg, setCfg] = useState<CompanionConfig | null>(null);
  const [status, setStatus] = useState<PollerStatus | null>(null);
  const [savedMsg, setSavedMsg] = useState('');
  const canEdit = useCanEdit();
  const auth = useAuthStatus();

  // Companion config is gated (PUT obviously, but GET too because it
  // contains host+port). If the user isn't allowed to edit, we don't
  // even try to fetch it - the API would 401 and pop a login modal,
  // which we don't want as an automatic side effect of just landing
  // on the Settings page.
  useEffect(() => {
    if (!canEdit) { setCfg(null); return; }
    api.getCompanion().then(setCfg).catch(() => {});
  }, [canEdit]);

  // Status is public, poll regardless.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const s = await api.getStatus(); if (alive) setStatus(s); }
      catch { /* ignore transient errors */ }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  async function save() {
    if (!cfg) return;
    const updated = await api.setCompanion(cfg);
    setCfg(updated);
    setSavedMsg('Saved');
    setTimeout(() => setSavedMsg(''), 1500);
  }

  return (
    <div className="page">
      <div className="toolbar">
        <Link to="/"><button>← Back</button></Link>
        <h1>Settings</h1>
        <div className="spacer" />
        {savedMsg && <span style={{ color: '#22c55e' }}>{savedMsg}</span>}
        {canEdit && cfg && (
          <button className="primary" onClick={save}>Save</button>
        )}
        <AuthBar />
      </div>
      <div style={{
        padding: 20, maxWidth: 600,
        flex: 1, overflow: 'auto', minHeight: 0
      }}>
        <h2>Bitfocus Companion</h2>
        <p style={{ color: '#888', fontSize: 13 }}>
          The server polls Companion's HTTP API for variable values.
          Make sure Companion's HTTP API is enabled and reachable.
        </p>

        <ConnectionIndicator status={status} />

        {/* Locked view: the connection settings are hidden because GET
            /companion is auth-gated (the host+port shouldn't leak to
            unauth'd viewers). The user can still see polling status
            above. */}
        {!canEdit && (
          <div style={{
            marginTop: 12,
            padding: 14,
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: 6,
            fontSize: 13,
            color: '#aaa'
          }}>
            🔒 Connection settings are hidden. Log in with your PIN to
            view or change the Companion host, port, and poll interval.
            <div style={{ marginTop: 8 }}>
              <button className="primary" onClick={() => openLoginModal()}>
                🔓 Log in
              </button>
            </div>
          </div>
        )}

        {canEdit && cfg && (
          <div className="inspector" style={{ width: '100%', border: '1px solid #2a2a2a', borderRadius: 6, marginTop: 12 }}>
            <section>
              <div className="row">
                <label>Enabled</label>
                <button
                  onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
                  style={{
                    background: cfg.enabled ? '#22c55e' : '#444',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 16px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 600,
                    minWidth: 60
                  }}
                >
                  {cfg.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="row">
                <label>Host</label>
                <input
                  value={cfg.host}
                  onChange={e => setCfg({ ...cfg, host: e.target.value })}
                />
              </div>
              <div className="row">
                <label>Port</label>
                <input
                  type="number"
                  value={cfg.port}
                  onChange={e => setCfg({ ...cfg, port: Number(e.target.value) })}
                />
              </div>
              <div className="row">
                <label>Poll interval (ms)</label>
                <input
                  type="number"
                  min={50}
                  value={cfg.pollIntervalMs}
                  onChange={e => setCfg({ ...cfg, pollIntervalMs: Number(e.target.value) })}
                />
              </div>
            </section>
          </div>
        )}

        {/* Auth section - always visible so the user can enable / change
            PIN / disable from one place. Behavior depends on current state. */}
        <h2 style={{ marginTop: 32 }}>Authentication</h2>
        <AuthSection auth={auth} />

        <h3 style={{ marginTop: 24 }}>Variable syntax</h3>
        <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.5 }}>
          Use <code>$(connection:variable)</code> in any text field.
          Examples:
          <br />
          <code>$(custom:cue)</code> &nbsp; reads a custom variable named <code>cue</code>.
          <br />
          <code>$(atem:pgm1_input)</code> &nbsp; reads variable <code>pgm1_input</code>
          from the connection labelled <code>atem</code>.
        </p>
      </div>
    </div>
  );
}

// ===========================================================================
// AuthSection - the single source of truth for enabling / changing /
// disabling PIN-based editor lock.
//
// Three states based on auth status:
//   - disabled                  → button "Enable PIN lock" + PIN entry
//   - enabled, not authed       → tells user to log in to manage
//   - enabled, authed           → "Change PIN" + "Disable" buttons
// ===========================================================================

function AuthSection({ auth }: { auth: ReturnType<typeof useAuthStatus> }) {
  const [showSetup, setShowSetup] = useState(false);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function reset() {
    setShowSetup(false);
    setPin1('');
    setPin2('');
    setError(null);
  }

  async function submitNewPin() {
    setError(null);
    if (!/^[0-9]{4}$/.test(pin1)) { setError('PIN must be 4 digits'); return; }
    if (pin1 !== pin2)             { setError('PINs do not match'); return; }
    setBusy(true);
    try {
      await setupPin(pin1);
      reset();
      setMsg(auth.enabled ? 'PIN changed.' : 'PIN lock enabled. Stay logged in or log in next time you edit.');
      setTimeout(() => setMsg(null), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDisable() {
    if (!confirm('Disable PIN lock? Anyone with access to this server will be able to edit again.')) return;
    setBusy(true);
    try {
      await disableAuth();
      reset();
      setMsg('PIN lock disabled.');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // --- Render --------------------------------------------------------------

  return (
    <div style={{
      border: '1px solid #2a2a2a', borderRadius: 6,
      background: '#141414', padding: 14
    }}>
      <p style={{ color: '#aaa', fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
        Optional 4-digit PIN that gates editing the dashboard. Viewers
        (and tally pages) always work without a PIN; only editing
        features are locked. Sessions last 24 hours.
      </p>

      {/* Status line */}
      <div style={{ fontSize: 13, color: '#ccc', marginBottom: 10 }}>
        Status:{' '}
        {!auth.enabled ? (
          <span style={{ color: '#888' }}>🔓 PIN lock is OFF — anyone on this network can edit.</span>
        ) : auth.authenticated ? (
          <span style={{ color: '#22c55e' }}>🔒 PIN lock is ON and you are logged in.</span>
        ) : (
          <span style={{ color: '#f59e0b' }}>🔒 PIN lock is ON. You are not logged in.</span>
        )}
      </div>

      {/* Disabled → enable button OR setup form */}
      {!auth.enabled && !showSetup && (
        <button className="primary" onClick={() => setShowSetup(true)} disabled={busy}>
          Enable PIN lock
        </button>
      )}

      {/* Enabled & authed → change PIN, disable */}
      {auth.enabled && auth.authenticated && !showSetup && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSetup(true)} disabled={busy}>
            Change PIN
          </button>
          <button className="danger" onClick={onDisable} disabled={busy}>
            Disable PIN lock
          </button>
        </div>
      )}

      {/* Enabled but not authed → must log in to change anything */}
      {auth.enabled && !auth.authenticated && (
        <button className="primary" onClick={() => openLoginModal()}>
          🔓 Log in to manage
        </button>
      )}

      {/* PIN entry form (used for both "enable" and "change") */}
      {showSetup && (
        <div style={{
          marginTop: 10, padding: 10, background: '#0a0a0a',
          border: '1px solid #2a2a2a', borderRadius: 4
        }}>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
            {auth.enabled ? 'Change PIN' : 'Set a new 4-digit PIN'}:
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="PIN"
              value={pin1}
              onChange={e => setPin1(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              style={{ width: 90, fontSize: 18, textAlign: 'center', letterSpacing: '0.3em' }}
              disabled={busy}
            />
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="Confirm"
              value={pin2}
              onChange={e => setPin2(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              onKeyDown={e => { if (e.key === 'Enter') void submitNewPin(); }}
              style={{ width: 90, fontSize: 18, textAlign: 'center', letterSpacing: '0.3em' }}
              disabled={busy}
            />
          </div>
          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 6 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={reset} disabled={busy}>Cancel</button>
            <button className="primary" onClick={submitNewPin}
                    disabled={busy || pin1.length !== 4 || pin2.length !== 4}>
              Save
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div style={{ fontSize: 12, color: '#22c55e', marginTop: 10 }}>{msg}</div>
      )}
    </div>
  );
}

function ConnectionIndicator({ status }: { status: PollerStatus | null }) {
  if (!status) {
    return (
      <div className="conn-indicator">
        <span className="conn-dot off" /> <span>Loading status...</span>
      </div>
    );
  }
  if (!status.enabled) {
    return (
      <div className="conn-indicator">
        <span className="conn-dot off" /> <span>Polling is OFF — toggle Enabled below to start.</span>
      </div>
    );
  }
  if (status.connected) {
    return (
      <div className="conn-indicator on">
        <span className="conn-dot on" />
        <span>
          <strong>Connected</strong> to {status.host}:{status.port}
          {status.wantedCount > 0
            ? ` — receiving ${status.knownCount}/${status.wantedCount} variables`
            : ' — no variables referenced yet'}
          {status.failInLastPoll > 0 && status.successInLastPoll > 0 && (
            <span style={{ color: '#f59e0b', marginLeft: 8 }}>
              ({status.failInLastPoll} failing)
            </span>
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="conn-indicator err">
      <span className="conn-dot err" />
      <span>
        <strong>Not connected</strong> to {status.host}:{status.port}
        {status.lastError && (
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
            {status.lastError}
          </div>
        )}
      </span>
    </div>
  );
}
