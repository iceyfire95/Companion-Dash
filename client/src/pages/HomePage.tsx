import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Dashboard } from '../types';
import { AuthBar, useCanEdit } from '../components/AuthBar';

export function HomePage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canEdit = useCanEdit();

  async function load() {
    setDashboards(await api.listDashboards());
  }
  useEffect(() => { load(); }, []);

  async function create() {
    const n = name.trim() || 'Untitled';
    await api.createDashboard({ name: n });
    setName('');
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete dashboard?')) return;
    await api.deleteDashboard(id);
    load();
  }

  async function doExport(d: Dashboard) {
    setBusy(true);
    setError(null);
    try {
      await api.exportDashboard(d.id, d.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Read a chosen .cwddash.json file and POST it to the import
   * endpoint. The server appends "(imported)" to the name by default;
   * we prompt to override only if the user wants to.
   */
  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      let doc: any;
      try { doc = JSON.parse(text); }
      catch { throw new Error('not valid JSON'); }
      if (doc?.format !== 'cwd-dashboard') {
        throw new Error(`not a dashboard file (format: ${doc?.format ?? 'unknown'})`);
      }
      const incoming = String(doc?.dashboard?.name ?? 'Imported dashboard');
      const choice = prompt(
        'Name for the imported dashboard:',
        `${incoming} (imported)`
      );
      if (choice === null) return;
      const nameOverride = choice.trim() || undefined;
      await api.importDashboard(doc, nameOverride);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h1>Companion Web Dashboard</h1>
        <div className="spacer" />
        <Link to="/tally"><button>Tally</button></Link>
        <Link to="/variables"><button>Variables</button></Link>
        <Link to="/settings"><button>Settings</button></Link>
        <AuthBar />
      </div>
      <div style={{
        padding: 20, maxWidth: 800, margin: '0 auto', width: '100%',
        flex: 1, overflow: 'auto', minHeight: 0
      }}>
        <h2>Dashboards</h2>
        {error && (
          <div style={{
            background: '#7f1d1d', color: '#fff', padding: '8px 12px',
            borderRadius: 4, marginBottom: 12, fontSize: 12
          }}>
            {error}
          </div>
        )}
        {/* Create + Import are editor-only. Hidden entirely when locked. */}
        {canEdit && (
          <div className="list-row">
            <input
              placeholder="New dashboard name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="primary" onClick={create}>Create</button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={e => handleFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              title="Import a dashboard from a .cwddash.json file"
            >
              Import...
            </button>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          {dashboards.length === 0 && (
            <div style={{ color: '#888', padding: 12 }}>No dashboards yet.</div>
          )}
          {dashboards.map(d => (
            <div key={d.id} className="list-row">
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {d.width}×{d.height} · updated {new Date(d.updatedAt).toLocaleString()}
                </div>
              </div>
              <Link to={`/view/${d.id}`}><button>View</button></Link>
              {canEdit && (
                <>
                  <Link to={`/edit/${d.id}`}><button className="primary">Edit</button></Link>
                  <button
                    onClick={() => doExport(d)}
                    disabled={busy}
                    title="Download as JSON (includes background image)"
                  >
                    Export
                  </button>
                  <button className="danger" onClick={() => remove(d.id)}>Delete</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
