import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Dashboard } from '../types';

export function HomePage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [name, setName] = useState('');

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

  return (
    <div className="page">
      <div className="toolbar">
        <h1>Companion Web Dashboard</h1>
        <div className="spacer" />
        <Link to="/tally"><button>Tally</button></Link>
        <Link to="/variables"><button>Variables</button></Link>
        <Link to="/settings"><button>Settings</button></Link>
      </div>
      <div style={{ padding: 20, maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <h2>Dashboards</h2>
        <div className="list-row">
          <input
            placeholder="New dashboard name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="primary" onClick={create}>Create</button>
        </div>
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
              <Link to={`/edit/${d.id}`}><button className="primary">Edit</button></Link>
              <button className="danger" onClick={() => remove(d.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
