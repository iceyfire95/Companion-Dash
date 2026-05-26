import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useVariableValues } from '../lib/useVariableValues';
import {
  type TallySource, tallyState, tallyColor, activeMatches
} from '../lib/tally';
import { VarAutocompleteInput, refreshVariableSuggestions } from '../lib/autocomplete';
import { AutoPopulateWizard } from './AutoPopulateWizard';
import { AuthBar, useCanEdit } from '../components/AuthBar';

export function TallyHubPage() {
  const liveValues = useVariableValues();
  const canEdit = useCanEdit();
  const [restValues, setRestValues] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<TallySource[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<TallySource>>({});
  const [showNew, setShowNew] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  async function load() {
    setSources(await api.listTallySources());
  }

  useEffect(() => {
    load();
    let alive = true;
    const tick = async () => {
      try {
        const v = await api.getValues();
        if (alive) setRestValues(v);
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

  function startEdit(s: TallySource) {
    setEditingId(s.id);
    setDraft({ ...s });
    setShowNew(false);
    setShowWizard(false);
  }

  function startNew() {
    setShowNew(true);
    setEditingId(null);
    setShowWizard(false);
    setDraft({
      name: '', pvwVariable: '', pgmVariable: '',
      pvwMatchValue: '', pgmMatchValue: '',
      showLabel: true
    });
  }

  function cancelDraft() {
    setEditingId(null);
    setShowNew(false);
    setDraft({});
  }

  async function saveDraft() {
    const name = (draft.name ?? '').trim();
    if (!name) return;
    try {
      if (editingId) {
        await api.updateTallySource(editingId, draft);
      } else {
        await api.createTallySource(draft);
      }
      cancelDraft();
      load();
      refreshVariableSuggestions();
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this tally source?')) return;
    await api.deleteTallySource(id);
    load();
    refreshVariableSuggestions();
  }

  const editorOpen = !!editingId || showNew || showWizard;

  return (
    <div className="page">
      <div className="toolbar">
        <Link to="/"><button>← Home</button></Link>
        <h1>Tally</h1>
        <div className="spacer" />
        <Link to="/variables"><button>Variables</button></Link>
        <Link to="/settings"><button>Settings</button></Link>
        <AuthBar />
      </div>

      <div style={{
        padding: 20, maxWidth: 1100, margin: '0 auto', width: '100%',
        // Pages have height:100vh + overflow:hidden on .page; without
        // a flex-1 + overflow-auto wrapper around the content, long
        // lists get clipped at the bottom of the viewport.
        flex: 1, overflow: 'auto', minHeight: 0
      }}>

        <div style={{
          background: '#141414', border: '1px solid #2a2a2a', borderRadius: 6,
          padding: 14, marginBottom: 16, fontSize: 13, color: '#aaa', lineHeight: 1.5
        }}>
          <div style={{
            fontSize: 11, color: '#888', textTransform: 'uppercase',
            letterSpacing: 0.5, fontWeight: 600, marginBottom: 6
          }}>
            How tally works
          </div>
          A tally source is a named camera/input with PVW and PGM Companion
          variables. Each source gets a fullscreen page at{' '}
          <code>/tally/&lt;slug&gt;</code> — open it on a tablet, phone, or
          monitor next to the camera. PVW shows green, PGM shows red, both →
          PGM wins, neither → black.
          <br /><br />
          Click <b>Auto-populate</b> to generate sources in bulk from a TSL
          listener / vMix / ATEM connection, or <b>Add tally source</b> to
          configure one manually.
        </div>

        {!editorOpen && canEdit && (
          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <button className="primary" onClick={startNew}>+ Add tally source</button>
            <button onClick={() => setShowWizard(true)}>⚡ Auto-populate from connection</button>
          </div>
        )}

        {showWizard && (
          <AutoPopulateWizard
            onCancel={() => setShowWizard(false)}
            onCreated={() => {
              setShowWizard(false);
              load();
              refreshVariableSuggestions();
            }}
          />
        )}

        {(showNew || editingId) && (
          <DraftEditor
            draft={draft}
            setDraft={setDraft}
            isNew={!editingId}
            onCancel={cancelDraft}
            onSave={saveDraft}
          />
        )}

        {sources.length === 0 && !showNew && !showWizard && (
          <div style={{ color: '#888', padding: 32, textAlign: 'center' }}>
            No tally sources yet. Click <b>+ Add tally source</b> to create
            one manually, or <b>⚡ Auto-populate</b> to scan a connection.
          </div>
        )}

        {sources.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12
          }}>
            {sources.map(s => (
              <TallyTile
                key={s.id}
                source={s}
                values={values}
                onEdit={() => startEdit(s)}
                onRemove={() => remove(s.id)}
                disabled={editorOpen}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------

function TallyTile({
  source, values, onEdit, onRemove, disabled, canEdit
}: {
  source: TallySource;
  values: Record<string, string>;
  onEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
  canEdit: boolean;
}) {
  const state = tallyState(values, source);
  const bg = tallyColor(state);
  const stateLabel =
    state === 'pgm' ? 'PROGRAM' :
    state === 'aux' ? 'AUX' :
    state === 'pvw' ? 'PREVIEW' :
                      'OFF';
  // PGM (red) and AUX (yellow) get black text for legibility against
  // the bright background; PVW (green) and OFF (black) keep white/gray.
  const fg = state === 'off' ? '#666' :
             state === 'aux' ? '#0a0a0a' :
                               '#fff';

  // Currently-routed destinations relevant to the active state. See
  // activeMatches() in lib/tally for the full rules.
  const activeList = activeMatches(values, source, state);
  const matchSummary = activeList.join(', ');

  // Mode-aware label. `inList` shows the comma-list in {braces} to
  // make it clear any one of the items matches; `equals` keeps the
  // existing `==` notation; truthy / no-match shows the bare var.
  function describeSide(v: string, mv: string | undefined, mode: string | undefined): string {
    if (!v) return '(none)';
    if (!mv) return v;
    if (mode === 'inList') return `${v} ∈ {${mv}}`;
    return `${v} == ${mv}`;
  }
  const pvwLabel = describeSide(source.pvwVariable, source.pvwMatchValue, source.pvwMatchMode);
  const pgmLabel = describeSide(source.pgmVariable, source.pgmMatchValue, source.pgmMatchMode);

  return (
    <div style={{
      background: '#141414', border: '1px solid #2a2a2a', borderRadius: 6,
      overflow: 'hidden', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{
        background: bg, padding: '20px 14px', color: fg,
        transition: 'background 80ms linear'
      }}>
        <div style={{
          fontSize: 11, opacity: 0.85, letterSpacing: 0.5,
          textTransform: 'uppercase', fontWeight: 600
        }}>
          {stateLabel}
        </div>
        <div style={{
          fontSize: 20, fontWeight: 700, marginTop: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }} title={source.name}>
          {source.name}
        </div>
        {/* Matched destinations - only shown for inList sources when
            currently on. Bare comma-list in muted-but-readable text. */}
        {matchSummary && (
          <div style={{
            fontSize: 11, opacity: 0.9, marginTop: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }} title={`On at: ${matchSummary}`}>
            on: {matchSummary}
          </div>
        )}
      </div>

      <div style={{ padding: 10, fontSize: 12, color: '#aaa' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ color: '#666', minWidth: 32 }}>PVW</span>
          <code style={{
            color: '#7dd3fc', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }} title={pvwLabel}>{pvwLabel}</code>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <span style={{ color: '#666', minWidth: 32 }}>PGM</span>
          <code style={{
            color: '#7dd3fc', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }} title={pgmLabel}>{pgmLabel}</code>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
          <Link to={`/tally/${source.slug}`} target="_blank">
            <button title="Open fullscreen tally page in a new tab"
                    style={{ padding: '3px 10px', fontSize: 11 }}>
              Open ↗
            </button>
          </Link>
          {canEdit && (
            <>
              <button onClick={onEdit} disabled={disabled}
                      style={{ padding: '3px 10px', fontSize: 11 }}>Edit</button>
              <button onClick={onRemove} disabled={disabled} className="danger"
                      style={{ padding: '3px 10px', fontSize: 11 }}>Delete</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------

function DraftEditor({
  draft, setDraft, isNew, onCancel, onSave
}: {
  draft: Partial<TallySource>;
  setDraft: (d: Partial<TallySource>) => void;
  isNew: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof TallySource>(k: K, v: TallySource[K]) =>
    setDraft({ ...draft, [k]: v });

  return (
    <div style={{
      background: '#141414', border: '1px solid #2a2a2a', borderRadius: 6,
      padding: 14, marginBottom: 16
    }}>
      <div style={{
        fontSize: 11, color: '#888', textTransform: 'uppercase',
        letterSpacing: 0.5, fontWeight: 600, marginBottom: 10
      }}>
        {isNew ? 'New tally source' : 'Edit tally source'}
      </div>

      <Row label="Name">
        <input
          placeholder="Cam 1"
          value={draft.name ?? ''}
          onChange={e => set('name', e.target.value)}
          style={{ width: '100%' }}
          autoFocus
        />
      </Row>

      {!isNew && (
        <Row label="Slug">
          <input
            placeholder="auto from name"
            value={draft.slug ?? ''}
            onChange={e => set('slug', e.target.value)}
            style={{
              width: '100%',
              fontFamily: 'ui-monospace, Menlo, monospace'
            }}
          />
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            URL path: <code>/tally/{draft.slug || '…'}</code>
          </div>
        </Row>
      )}

      <Row label="Preview variable">
        <VarAutocompleteInput
          value={draft.pvwVariable ?? ''}
          onChange={v => set('pvwVariable', v)}
          wrapBareVar={false}
          placeholder="tsl:tally_1_pvw"
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, Menlo, monospace'
          }}
        />
      </Row>

      <Row label="Preview match value (optional)">
        <input
          placeholder="leave empty for truthy detection"
          value={draft.pvwMatchValue ?? ''}
          onChange={e => set('pvwMatchValue', e.target.value)}
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, Menlo, monospace'
          }}
        />
        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
          Leave empty for boolean-style vars (TSL / vMix). For ATEM, set
          to the input number (e.g. <code>5</code>) so PVW is "on" only
          when the variable equals "5".
        </div>
      </Row>

      <Row label="Program variable">
        <VarAutocompleteInput
          value={draft.pgmVariable ?? ''}
          onChange={v => set('pgmVariable', v)}
          wrapBareVar={false}
          placeholder="tsl:tally_1_pgm"
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, Menlo, monospace'
          }}
        />
      </Row>

      <Row label="Program match value (optional)">
        <input
          placeholder="leave empty for truthy detection"
          value={draft.pgmMatchValue ?? ''}
          onChange={e => set('pgmMatchValue', e.target.value)}
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, Menlo, monospace'
          }}
        />
      </Row>

      <Row label="Show label on viewer">
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13
        }}>
          <input type="checkbox"
                 checked={draft.showLabel !== false}
                 onChange={e => set('showLabel', e.target.checked)} />
          Show source name as overlay on fullscreen page
        </label>
      </Row>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 11, color: '#888', textTransform: 'uppercase',
        letterSpacing: 0.5, fontWeight: 600, marginBottom: 4
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
