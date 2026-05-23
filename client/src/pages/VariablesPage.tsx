import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PollerStatus, type WatchedVariable } from '../lib/api';
import { useVariableValues } from '../lib/useVariableValues';
import { AuthBar, useCanEdit } from '../components/AuthBar';

export function VariablesPage() {
  const liveValues = useVariableValues();
  const canEdit = useCanEdit();
  const [restValues, setRestValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<PollerStatus | null>(null);
  const [watched, setWatched] = useState<WatchedVariable[]>([]);
  const [filter, setFilter] = useState('');
  const [addInput, setAddInput] = useState('');
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkInput, setBulkInput] = useState('');

  // Poll status + values + watched every 1s.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [s, v, w] = await Promise.all([
          api.getStatus(), api.getValues(), api.listWatched()
        ]);
        if (alive) { setStatus(s); setRestValues(v); setWatched(w); }
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const values = useMemo(
    () => ({ ...restValues, ...liveValues }),
    [restValues, liveValues]
  );

  // For each watched name compute status: 'receiving' | 'not-found' | 'waiting'
  function watchStatus(name: string): 'receiving' | 'not-found' | 'waiting' {
    if (Object.prototype.hasOwnProperty.call(values, name)) return 'receiving';
    if (!status) return 'waiting';
    if (!status.connected) return 'waiting';
    // We're connected and the variable isn't in values - likely a 404 from Companion.
    return 'not-found';
  }

  // Visible rows: union of (watched names) ∪ (values keys). Watched first.
  const rows = useMemo(() => {
    const set = new Map<string, { source: 'watched' | 'panel'; value: string | null }>();
    for (const w of watched) {
      set.set(w.name, { source: 'watched', value: values[w.name] ?? null });
    }
    for (const [k, v] of Object.entries(values)) {
      if (!set.has(k)) set.set(k, { source: 'panel', value: v });
    }
    const all = [...set.entries()].map(([name, info]) => ({ name, ...info }));
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? all.filter(r =>
          r.name.toLowerCase().includes(q) ||
          (r.value ?? '').toLowerCase().includes(q))
      : all;
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [watched, values, filter]);

  const watchedById = useMemo(() => {
    const m = new Map<string, WatchedVariable>();
    for (const w of watched) m.set(w.name, w);
    return m;
  }, [watched]);

  function copy(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  async function doAdd(value: string) {
    setAddMsg(null);
    const name = value.trim();
    if (!name) return;
    try {
      const r = await api.addWatched(name);
      if (r.added.length > 0) {
        setAddMsg({ ok: true, text: `Watching ${r.added[0].name}` });
        setAddInput('');
        // Refresh watched immediately (don't wait for the 1s tick).
        setWatched(await api.listWatched());
      } else {
        setAddMsg({ ok: false, text: `Invalid: ${name}` });
      }
    } catch (e) {
      setAddMsg({ ok: false, text: (e as Error).message });
    }
    setTimeout(() => setAddMsg(null), 3000);
  }

  async function doBulkAdd() {
    setAddMsg(null);
    if (!bulkInput.trim()) return;
    try {
      const r = await api.addWatchedBulk(bulkInput);
      setAddMsg({
        ok: r.added.length > 0,
        text: `Added ${r.added.length}${r.skipped.length ? `, skipped ${r.skipped.length}` : ''}`
      });
      setBulkInput('');
      setShowBulk(false);
      setWatched(await api.listWatched());
    } catch (e) {
      setAddMsg({ ok: false, text: (e as Error).message });
    }
    setTimeout(() => setAddMsg(null), 4000);
  }

  async function doRemove(id: string) {
    try {
      await api.removeWatched(id);
      setWatched(await api.listWatched());
    } catch { /* ignore */ }
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
              ? `Connected — ${status.knownCount}/${status.wantedCount} variables`
              : 'Not connected'}
          </span>
        )}
        <AuthBar />
      </div>

      <div style={{ padding: 20, maxWidth: 900, margin: '0 auto', width: '100%' }}>
        {/* Add to watch list - editor-only */}
        {canEdit && (
        <div style={{
          background: '#141414', border: '1px solid #2a2a2a', borderRadius: 6,
          padding: 14, marginBottom: 16
        }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
            Add variables to watch
          </div>
          <p style={{ color: '#aaa', fontSize: 12, marginTop: 0, marginBottom: 10, lineHeight: 1.4 }}>
            Variables referenced by your panels are polled automatically.
            Add others here to preview their values without using them in a panel.
            Format: <code>connection:varname</code> (e.g. <code>atem:pgm1_input</code>, <code>custom:cue</code>).
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="connection:variable"
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doAdd(addInput); }}
              style={{ flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }}
            />
            <button className="primary" onClick={() => doAdd(addInput)}>Add</button>
            <button onClick={() => setShowBulk(s => !s)}>{showBulk ? 'Cancel bulk' : 'Bulk add…'}</button>
          </div>
          {showBulk && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12, color: '#888', marginTop: 0, marginBottom: 6 }}>
                Paste many variables, one per line. In Companion, open Variables, copy the names from the table.
              </p>
              <textarea
                rows={6}
                placeholder={`atem:pgm1_input\natem:pgm2_input\ncustom:cue\ninternal:time_hms`}
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                style={{
                  width: '100%', fontFamily: 'ui-monospace, Menlo, monospace',
                  background: '#0f0f0f', color: '#eaeaea', border: '1px solid #2a2a2a',
                  borderRadius: 4, padding: 8
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button className="primary" onClick={doBulkAdd}>Add all</button>
              </div>
            </div>
          )}
          {addMsg && (
            <div style={{ marginTop: 8, fontSize: 12, color: addMsg.ok ? '#22c55e' : '#ef4444' }}>
              {addMsg.text}
            </div>
          )}
        </div>
        )}

        {/* Filter */}
        <input
          placeholder="Filter by name or value…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
        />

        {rows.length === 0 && (
          <div style={{ color: '#888', padding: 24, textAlign: 'center' }}>
            {watched.length === 0 && Object.keys(values).length === 0
              ? 'No variables yet. Add one above, or reference a variable in a panel.'
              : 'No variables match your filter.'}
          </div>
        )}

        {rows.length > 0 && (
          <div style={{
            border: '1px solid #2a2a2a', borderRadius: 6, overflow: 'hidden', background: '#141414'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr 1fr 120px',
              padding: '8px 12px',
              borderBottom: '1px solid #2a2a2a',
              background: '#1a1a1a',
              fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
              color: '#888', fontWeight: 600
            }}>
              <div></div>
              <div>Variable</div>
              <div>Value</div>
              <div></div>
            </div>
            {rows.map(r => {
              const ws = watchStatus(r.name);
              const dotColor =
                ws === 'receiving' ? '#22c55e' :
                ws === 'not-found' ? '#ef4444' :
                                     '#888';
              const dotTitle =
                ws === 'receiving' ? 'Receiving' :
                ws === 'not-found' ? 'Not found in Companion (check spelling/connection label)' :
                                     'Waiting for connection';
              const isWatched = watchedById.has(r.name);
              return (
                <div key={r.name} style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr 1fr 120px',
                  padding: '8px 12px',
                  borderBottom: '1px solid #1f1f1f',
                  fontSize: 13, alignItems: 'center'
                }}>
                  <div title={dotTitle}>
                    <span style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                      background: dotColor
                    }} />
                  </div>
                  <code style={{ color: '#7dd3fc', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    $({r.name})
                    {r.source === 'panel' && !isWatched && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: '#666' }}>(panel)</span>
                    )}
                  </code>
                  <div style={{
                    fontFamily: 'ui-monospace, Menlo, monospace',
                    color: r.value !== null ? '#eaeaea' : '#666',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }} title={r.value ?? ''}>
                    {r.value !== null ? r.value : '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button onClick={() => copy(`$(${r.name})`)} style={{ padding: '3px 8px', fontSize: 11 }}>Copy</button>
                    {isWatched && canEdit && (
                      <button
                        className="danger"
                        onClick={() => doRemove(watchedById.get(r.name)!.id)}
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        title="Stop watching"
                      >✕</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
