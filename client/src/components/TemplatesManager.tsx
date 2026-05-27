import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { SavedPanelTemplate } from '../types';

/**
 * Modal dialog for managing saved panel templates.
 *
 * Provides:
 *   - rename (click pencil, edit inline, Enter to save)
 *   - delete (with confirm)
 *   - export (downloads a .cwdpanel.json file)
 *   - import (file picker, accepts the JSON shape produced by export)
 *
 * The parent receives an `onChange(list)` callback whenever the
 * template list mutates, so the editor's "+ From template..." dropdown
 * can refresh without a full page reload. The modal is its own data
 * owner - it re-fetches on open and on every mutation.
 */
export function TemplatesManager({
  open, onClose, onChange
}: {
  open: boolean;
  onClose: () => void;
  /** Fired after any successful add / rename / delete with the latest list. */
  onChange: (list: SavedPanelTemplate[]) => void;
}) {
  const [templates, setTemplates] = useState<SavedPanelTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const list = await api.listTemplates();
      setTemplates(list);
      onChange(list);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (open) {
      setError(null);
      refresh();
    }
  // We deliberately omit refresh from deps - it's stable enough that
  // re-binding it every render would cause an infinite loop here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function startRename(t: SavedPanelTemplate) {
    setEditingId(t.id);
    setDraftName(t.name);
  }

  async function commitRename() {
    if (!editingId) return;
    const name = draftName.trim();
    if (!name) { setEditingId(null); return; }
    setBusy(true);
    setError(null);
    try {
      await api.renameTemplate(editingId, name);
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: SavedPanelTemplate) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteTemplate(t.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doExport(t: SavedPanelTemplate) {
    setBusy(true);
    setError(null);
    try {
      await api.exportTemplate(t.id, t.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Read a chosen .json file and POST it to the import endpoint.
   * Detects same-name collisions client-side and prompts for a new
   * name so the imported template doesn't look like a stealth
   * duplicate. We don't enforce uniqueness on the server because
   * "two templates with the same name" is technically legal.
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
      if (doc?.format !== 'cwd-panel') {
        throw new Error(`not a panel template file (format: ${doc?.format ?? 'unknown'})`);
      }
      const incoming = String(doc?.name ?? 'Imported panel');
      let nameOverride: string | undefined;
      if (templates.some(t => t.name === incoming)) {
        const choice = prompt(
          `A template named "${incoming}" already exists. Enter a new name (cancel to skip import):`,
          `${incoming} (imported)`
        );
        if (choice === null) return;
        nameOverride = choice.trim() || undefined;
      }
      await api.importTemplate(doc, nameOverride);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          background: '#141414',
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          width: 'min(720px, 90vw)',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column'
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', borderBottom: '1px solid #2a2a2a'
        }}>
          <h3 style={{ margin: 0, flex: 1, fontSize: 14 }}>Panel templates</h3>
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
            title="Import a template from a .cwdpanel.json file"
          >
            Import...
          </button>
          <button onClick={onClose}>Close</button>
        </div>

        {error && (
          <div style={{
            background: '#7f1d1d', color: '#fff', padding: '6px 16px',
            fontSize: 12
          }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {templates.length === 0 ? (
            <div style={{ color: '#888', padding: 12, fontSize: 13 }}>
              No saved templates yet. Save a panel as a template from the
              Inspector, or import one with the button above.
            </div>
          ) : (
            templates.map(t => (
              <div key={t.id} className="list-row" style={{ marginBottom: 6 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  {editingId === t.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={e => setDraftName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        else if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={commitRename}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <div
                      onDoubleClick={() => startRename(t)}
                      title="Double-click to rename"
                      style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {t.name}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#888' }}>
                    Saved {new Date(t.createdAt).toLocaleString()}
                  </div>
                </div>
                <button onClick={() => startRename(t)} disabled={busy} title="Rename">
                  Rename
                </button>
                <button onClick={() => doExport(t)} disabled={busy} title="Download as JSON">
                  Export
                </button>
                <button className="danger" onClick={() => remove(t)} disabled={busy}>
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
