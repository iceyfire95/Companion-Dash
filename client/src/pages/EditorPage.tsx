import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useVariableValues } from '../lib/useVariableValues';
import { evaluateRule } from '../lib/variables';
import type { Dashboard, Panel, SavedPanelTemplate } from '../types';
import { PanelView } from '../components/PanelView';
import { Inspector } from '../components/Inspector';

const SAVE_DEBOUNCE_MS = 300;

export function EditorPage() {
  const { dashboardId = '' } = useParams();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<SavedPanelTemplate[]>([]);
  const values = useVariableValues();

  // Load
  useEffect(() => {
    api.getDashboard(dashboardId).then(setDashboard).catch(() => {});
    api.listPanels(dashboardId).then(setPanels);
    api.listTemplates().then(setTemplates);
  }, [dashboardId]);

  // Debounced save for panels
  const saveTimers = useRef<Map<string, number>>(new Map());
  const queueSave = useCallback((p: Panel) => {
    const prev = saveTimers.current.get(p.id);
    if (prev !== undefined) window.clearTimeout(prev);
    const t = window.setTimeout(() => {
      api.updatePanel(p.id, p).catch(console.error);
      saveTimers.current.delete(p.id);
    }, SAVE_DEBOUNCE_MS);
    saveTimers.current.set(p.id, t);
  }, []);

  const updatePanel = useCallback((p: Panel) => {
    setPanels(prev => prev.map(x => x.id === p.id ? p : x));
    queueSave(p);
  }, [queueSave]);

  // Add panel (blank)
  async function addPanel() {
    const p = await api.createPanel({ dashboardId, x: 40, y: 40 });
    setPanels(prev => [...prev, p]);
    setSelectedPanelId(p.id);
    setSelectedCellId(null);
  }
  async function addFromTemplate(tplId: string) {
    const p = await api.createPanel({ dashboardId, templateId: tplId, x: 60, y: 60 });
    setPanels(prev => [...prev, p]);
    setSelectedPanelId(p.id);
  }

  async function deletePanel(id: string) {
    await api.deletePanel(id);
    setPanels(prev => prev.filter(p => p.id !== id));
    if (selectedPanelId === id) {
      setSelectedPanelId(null);
      setSelectedCellId(null);
    }
  }

  async function saveAsTemplate(p: Panel) {
    const name = prompt('Template name', p.name) ?? '';
    if (!name.trim()) return;
    const tpl = await api.saveTemplate(p.id, name.trim());
    setTemplates(prev => [tpl, ...prev]);
  }

  // Drag / resize handlers
  const dragRef = useRef<null | {
    id: string;
    mode: 'move' | 'r' | 'b' | 'br';
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  }>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      setPanels(prev => prev.map(p => {
        if (p.id !== drag.id) return p;
        let next = p;
        if (drag.mode === 'move') {
          next = { ...p, x: Math.max(0, drag.origX + dx), y: Math.max(0, drag.origY + dy) };
        } else if (drag.mode === 'r') {
          next = { ...p, width: Math.max(40, drag.origW + dx) };
        } else if (drag.mode === 'b') {
          next = { ...p, height: Math.max(40, drag.origH + dy) };
        } else {
          next = {
            ...p,
            width: Math.max(40, drag.origW + dx),
            height: Math.max(40, drag.origH + dy)
          };
        }
        queueSave(next);
        return next;
      }));
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [queueSave]);

  function startDrag(e: React.MouseEvent, p: Panel, mode: 'move' | 'r' | 'b' | 'br') {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      id: p.id, mode,
      startX: e.clientX, startY: e.clientY,
      origX: p.x, origY: p.y, origW: p.width, origH: p.height
    };
    setSelectedPanelId(p.id);
  }

  // Click cell to edit
  function onPanelMouseDown(e: React.MouseEvent, p: Panel) {
    setSelectedPanelId(p.id);

    // Detect cell click via DOM walking
    const target = e.target as HTMLElement;
    const cellEl = target.closest('.cell') as HTMLElement | null;
    if (cellEl) {
      // Find which cell - we attach data-cell-id
      const cellId = cellEl.getAttribute('data-cell-id');
      setSelectedCellId(cellId);
    } else {
      setSelectedCellId(null);
    }

    startDrag(e, p, 'move');
  }

  const selectedPanel = panels.find(p => p.id === selectedPanelId) ?? null;

  // Dashboard-level edits
  async function updateDashboardFields(patch: Partial<Dashboard>) {
    if (!dashboard) return;
    const d = await api.updateDashboard(dashboard.id, patch);
    setDashboard(d);
  }

  if (!dashboard) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div className="page">
      <div className="toolbar">
        <Link to="/"><button>← Home</button></Link>
        <h1>{dashboard.name}</h1>
        <button className="primary" onClick={addPanel}>+ Add panel</button>
        <select
          onChange={e => { if (e.target.value) { addFromTemplate(e.target.value); e.target.value = ''; } }}
          defaultValue=""
        >
          <option value="">+ From template...</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="spacer" />
        <label style={{ fontSize: 12, color: '#aaa' }}>Canvas</label>
        <input type="number" value={dashboard.width}
               onChange={e => updateDashboardFields({ width: Number(e.target.value) })}
               style={{ width: 80 }} />
        ×
        <input type="number" value={dashboard.height}
               onChange={e => updateDashboardFields({ height: Number(e.target.value) })}
               style={{ width: 80 }} />
        <input type="color" value={dashboard.bgColor}
               onChange={e => updateDashboardFields({ bgColor: e.target.value })} />
        <Link to={`/view/${dashboardId}`} target="_blank">
          <button>Open viewer ↗</button>
        </Link>
      </div>

      <div className="editor-layout">
        <div className="canvas-wrap" onMouseDown={() => { setSelectedPanelId(null); setSelectedCellId(null); }}>
          <div
            className="canvas"
            style={{
              width: dashboard.width,
              height: dashboard.height,
              background: dashboard.bgColor
            }}
          >
            {panels.map(p => (
              <PanelWithCellIds
                key={p.id}
                panel={p}
                values={values}
                editing={selectedPanelId === p.id}
                selectedCellId={selectedPanelId === p.id ? selectedCellId : null}
                focusActive={
                  !!(p.focusRule?.enabled &&
                     p.focusRule.variable &&
                     evaluateRule(p.focusRule, values))
                }
                onMouseDownPanel={e => onPanelMouseDown(e, p)}
                onMouseDownResize={(e, kind) => startDrag(e, p, kind)}
              />
            ))}
          </div>
        </div>

        {selectedPanel ? (
          <Inspector
            panel={selectedPanel}
            selectedCellId={selectedCellId}
            values={values}
            onPanelChange={updatePanel}
            onSelectCell={setSelectedCellId}
            onDelete={() => deletePanel(selectedPanel.id)}
            onSaveTemplate={() => saveAsTemplate(selectedPanel)}
          />
        ) : (
          <div className="inspector">
            <div style={{ color: '#888', fontSize: 13 }}>
              No panel selected. Click a panel, or click + Add panel.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Wrapper that injects data-cell-id attributes on cells so clicks select cells. */
function PanelWithCellIds(props: React.ComponentProps<typeof PanelView>) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const cellEls = root.querySelectorAll('.cell');
    const ids: string[] = [];
    if (props.panel.headerEnabled && props.panel.header) ids.push('header');
    for (const c of props.panel.cells) ids.push(c.id);
    cellEls.forEach((el, i) => {
      if (ids[i]) el.setAttribute('data-cell-id', ids[i]);
    });
  });

  return (
    <div ref={wrapRef} style={{ display: 'contents' }}>
      <PanelView {...props} />
    </div>
  );
}
