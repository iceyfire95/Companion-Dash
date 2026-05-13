import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PollerStatus } from '../lib/api';
import type { CompanionConfig } from '../types';

export function SettingsPage() {
  const [cfg, setCfg] = useState<CompanionConfig | null>(null);
  const [status, setStatus] = useState<PollerStatus | null>(null);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => { api.getCompanion().then(setCfg); }, []);

  // Poll status every 1s so the indicator stays live.
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

  if (!cfg) return <div style={{ padding: 20 }}>Loading...</div>;

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
        <button className="primary" onClick={save}>Save</button>
      </div>
      <div style={{ padding: 20, maxWidth: 600 }}>
        <h2>Bitfocus Companion</h2>
        <p style={{ color: '#888', fontSize: 13 }}>
          The server polls Companion's HTTP API for variable values.
          Make sure Companion's HTTP API is enabled and reachable.
        </p>

        <ConnectionIndicator status={status} />

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
