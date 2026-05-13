import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PollerStatus } from '../lib/api';
import { useVariableValues } from '../lib/useVariableValues';

export function VariablesPage() {
  const liveValues = useVariableValues();
  const [restValues, setRestValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<PollerStatus | null>(null);
  const [filter, setFilter] = useState('');

  // Poll status + values via REST every 1s so the page works even if the
  // socket snapshot was missed (e.g. when navigating between pages with a
  // shared socket).
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [s, v] = await Promise.all([api.getStatus(), api.getValues()]);
        if (alive) { setStatus(s); setRestValues(v); }
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Merge: live socket updates take priority over the REST snapshot.
  const values = useMemo(
    () => ({ ...restValues, ...liveValues }),
    [restValues, liveValues]
  );

  // Sort & filter
  const rows = useMemo(() => {
    const entries = Object.entries(values);
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? entries.filter(([k, v]) =>
          k.toLowerCase().includes(q) || v.toLowerCase().includes(q))
      : entries;
    return filtered.sort(([a], [b]) => a.localeCompare(b));
  }, [values, filter]);

  function copy(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  return (
    <div className="page">
      <div className="toolbar">
        <Link to="/"><button>← Home</button></Link>
        <h1>Variables</h1>
        <div className="spacer" />
        {status && (
          <span style={{ fontSize: 13, color: '#aaa' }}>
            <span className={`conn-dot ${status.connected ? 'on' : 'err'}`}
                  style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {status.connected
              ? `Connected — ${status.knownCount} variables`
              : 'Not connected'}
          </span>
        )}
      </div>

      <div style={{ padding: 20, maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <input
          placeholder="Filter by name or value…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
        />

        {rows.length === 0 && (
          <div style={{ color: '#888', padding: 24, textAlign: 'center' }}>
            {Object.keys(values).length === 0
              ? 'No variables polled yet. Reference a variable in a panel like $(connection:varname) and it will appear here.'
              : 'No variables match your filter.'}
          </div>
        )}

        {rows.length > 0 && (
          <div style={{
            border: '1px solid #2a2a2a',
            borderRadius: 6,
            overflow: 'hidden',
            background: '#141414'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 80px',
              padding: '8px 12px',
              borderBottom: '1px solid #2a2a2a',
              background: '#1a1a1a',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: '#888',
              fontWeight: 600
            }}>
              <div>Variable</div>
              <div>Value</div>
              <div></div>
            </div>
            {rows.map(([k, v]) => (
              <div key={k} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 80px',
                padding: '8px 12px',
                borderBottom: '1px solid #1f1f1f',
                fontSize: 13,
                alignItems: 'center'
              }}>
                <code style={{ color: '#7dd3fc', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  $({k})
                </code>
                <div style={{
                  fontFamily: 'ui-monospace, Menlo, monospace',
                  color: '#eaeaea',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }} title={v}>{v}</div>
                <button
                  onClick={() => copy(`$(${k})`)}
                  style={{ padding: '3px 8px', fontSize: 11 }}
                >Copy</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
