import { useState } from 'react';
import type { Panel, Cell, ConditionalRule, Condition, RuleOp, ButtonConfig, ButtonAction, FocusRule } from '../types';
import { api } from '../lib/api';
import { VarAutocompleteTextarea, VarAutocompleteInput } from '../lib/autocomplete';
import { evaluateRule } from '../lib/variables';

const RULE_OPS: { value: RuleOp; label: string }[] = [
  { value: 'eq', label: '= equals' },
  { value: 'neq', label: '≠ not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'gt', label: '> greater' },
  { value: 'gte', label: '≥ greater/equal' },
  { value: 'lt', label: '< less' },
  { value: 'lte', label: '≤ less/equal' },
  { value: 'regex', label: 'regex' },
  { value: 'empty', label: 'empty' },
  { value: 'notEmpty', label: 'not empty' }
];

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function newCondition(): Condition {
  return { id: makeId(), variable: '', op: 'eq', value: '' };
}

function newRule(): ConditionalRule {
  return {
    id: makeId(),
    conditions: [newCondition()],
    bgColor: '#ff0000',
    textColor: '#ffffff'
  };
}

interface Props {
  panel: Panel;
  selectedCellId: string | null;
  onPanelChange: (p: Panel) => void;
  onSelectCell: (id: string | null) => void;
  onDelete: () => void;
  onSaveTemplate: () => void;
  /** Current variable values - used to live-preview the focus rule. */
  values: Record<string, string>;
}

export function Inspector({
  panel, selectedCellId, onPanelChange, onSelectCell, onDelete, onSaveTemplate,
  values
}: Props) {
  const updatePanel = (patch: Partial<Panel>) => onPanelChange({ ...panel, ...patch });

  // Find selected cell
  const cell: Cell | null =
    selectedCellId === 'header' ? panel.header
    : panel.cells.find(c => c.id === selectedCellId) ?? null;

  const updateCell = (patch: Partial<Cell>) => {
    if (!cell) return;
    if (selectedCellId === 'header') {
      onPanelChange({ ...panel, header: { ...cell, ...patch } });
    } else {
      onPanelChange({
        ...panel,
        cells: panel.cells.map(c => c.id === cell.id ? { ...c, ...patch } : c)
      });
    }
  };

  const setRows = (n: number) => {
    const rows = Math.max(1, Math.min(20, n));
    let cells = panel.cells.filter(c => c.row < rows);
    // Add new cells for any new rows
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < panel.cols; c++) {
        if (!cells.find(x => x.row === r && x.col === c)) {
          cells.push(makeCell(r, c));
        }
      }
    }
    onPanelChange({ ...panel, rows, cells });
  };
  const setCols = (n: number) => {
    const cols = Math.max(1, Math.min(20, n));
    let cells = panel.cells.filter(c => c.col < cols);
    for (let r = 0; r < panel.rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!cells.find(x => x.row === r && x.col === c)) {
          cells.push(makeCell(r, c));
        }
      }
    }
    onPanelChange({ ...panel, cols, cells });
  };

  return (
    <div className="inspector">
      <section>
        <h3>Panel</h3>
        <div className="row">
          <label>Name</label>
          <input value={panel.name} onChange={e => updatePanel({ name: e.target.value })} />
        </div>
        <div className="row">
          <label>X / Y</label>
          <input type="number" value={Math.round(panel.x)}
                 onChange={e => updatePanel({ x: Number(e.target.value) })} />
          <input type="number" value={Math.round(panel.y)}
                 onChange={e => updatePanel({ y: Number(e.target.value) })} />
        </div>
        <div className="row">
          <label>W / H</label>
          <input type="number" value={Math.round(panel.width)}
                 onChange={e => updatePanel({ width: Math.max(40, Number(e.target.value)) })} />
          <input type="number" value={Math.round(panel.height)}
                 onChange={e => updatePanel({ height: Math.max(40, Number(e.target.value)) })} />
        </div>
        <div className="row">
          <label>Background</label>
          <input type="color" value={panel.bgColor}
                 onChange={e => updatePanel({ bgColor: e.target.value })} />
          <input value={panel.bgColor}
                 onChange={e => updatePanel({ bgColor: e.target.value })} />
        </div>
        <div className="row">
          <label>Border</label>
          <input type="color" value={panel.borderColor}
                 onChange={e => updatePanel({ borderColor: e.target.value })} />
          <input type="number" value={panel.borderWidth}
                 onChange={e => updatePanel({ borderWidth: Number(e.target.value) })} />
        </div>
        <div className="row">
          <label>Radius / Pad</label>
          <input type="number" value={panel.borderRadius}
                 onChange={e => updatePanel({ borderRadius: Number(e.target.value) })} />
          <input type="number" value={panel.padding}
                 onChange={e => updatePanel({ padding: Number(e.target.value) })} />
        </div>
        <div className="row">
          <label>Gap</label>
          <input type="number" value={panel.gap}
                 onChange={e => updatePanel({ gap: Number(e.target.value) })} />
        </div>
        <div className="row">
          <label>Z-index</label>
          <input type="number" value={panel.zIndex}
                 onChange={e => updatePanel({ zIndex: Number(e.target.value) })} />
        </div>
      </section>

      <section>
        <h3>Structure</h3>
        <div className="row">
          <label>Header</label>
          <button
            onClick={() => {
              const on = !panel.headerEnabled;
              onPanelChange({
                ...panel,
                headerEnabled: on,
                header: on ? (panel.header ?? defaultHeaderCell()) : panel.header
              });
            }}
            style={{
              background: panel.headerEnabled ? '#22c55e' : '#444',
              color: '#fff',
              border: 'none',
              padding: '4px 12px',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
              minWidth: 50
            }}
          >
            {panel.headerEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="row">
          <label>Rows</label>
          <input type="number" min={1} max={20}
                 value={panel.rows}
                 onChange={e => setRows(Number(e.target.value))} />
        </div>
        <div className="row">
          <label>Columns</label>
          <input type="number" min={1} max={20}
                 value={panel.cols}
                 onChange={e => setCols(Number(e.target.value))} />
        </div>
        <div className="row">
          <label>Edit cell</label>
          <select
            value={selectedCellId ?? ''}
            onChange={e => onSelectCell(e.target.value || null)}
          >
            <option value="">— pick a cell —</option>
            {panel.headerEnabled && <option value="header">Header</option>}
            {/* Cells listed row-major: top to bottom, left to right */}
            {Array.from({ length: panel.rows }).flatMap((_, r) =>
              Array.from({ length: panel.cols }).map((__, c) => {
                const found = panel.cells.find(x => x.row === r && x.col === c);
                if (!found) return null;
                return (
                  <option key={found.id} value={found.id}>
                    C{c + 1}-R{r + 1}
                  </option>
                );
              })
            )}
          </select>
        </div>
      </section>

      {cell && (
        <section>
          <h3>
            Cell {selectedCellId === 'header'
              ? 'Header'
              : `C${cell.col + 1}-R${cell.row + 1}`}
          </h3>
          <div className="row">
            <label>Text</label>
            <VarAutocompleteTextarea
              value={cell.text}
              onChange={(v) => updateCell({ text: v })}
              placeholder="Plain text, $(custom:var), markdown or HTML"
            />
          </div>
          <div className="row">
            <label>H-align</label>
            <select value={cell.align}
                    onChange={e => updateCell({ align: e.target.value as Cell['align'] })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="row">
            <label>V-align</label>
            <select value={cell.valign ?? 'middle'}
                    onChange={e => updateCell({ valign: e.target.value as Cell['valign'] })}>
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
          <div className="row">
            <label>Min font size</label>
            <input type="number" min={6} value={cell.fontSize}
                   onChange={e => updateCell({ fontSize: Number(e.target.value) })} />
          </div>
          <div className="row">
            <label>Font weight</label>
            <select value={cell.fontWeight}
                    onChange={e => updateCell({ fontWeight: Number(e.target.value) })}>
              <option value={300}>Light</option>
              <option value={400}>Regular</option>
              <option value={600}>Semibold</option>
              <option value={700}>Bold</option>
            </select>
          </div>
          <div className="row">
            <label>Background</label>
            <input type="color" value={cell.bgColor}
                   onChange={e => updateCell({ bgColor: e.target.value })} />
            <input value={cell.bgColor}
                   onChange={e => updateCell({ bgColor: e.target.value })} />
          </div>
          <div className="row">
            <label>Text color</label>
            <input type="color" value={cell.textColor}
                   onChange={e => updateCell({ textColor: e.target.value })} />
            <input value={cell.textColor}
                   onChange={e => updateCell({ textColor: e.target.value })} />
          </div>
          <div className="row">
            <label>Border</label>
            <input type="color" value={cell.borderColor}
                   onChange={e => updateCell({ borderColor: e.target.value })} />
            <input type="number" value={cell.borderWidth}
                   onChange={e => updateCell({ borderWidth: Number(e.target.value) })} />
          </div>

          <h4 style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
            Conditional rules (first match wins)
          </h4>
          {cell.rules.map((rule, i) => (
            <RuleEditor
              key={rule.id}
              rule={rule}
              onChange={updated => {
                const rules = [...cell.rules];
                rules[i] = updated;
                updateCell({ rules });
              }}
              onDelete={() => {
                const rules = cell.rules.filter(r => r.id !== rule.id);
                updateCell({ rules });
              }}
              onMove={dir => {
                const rules = [...cell.rules];
                const swap = i + dir;
                if (swap < 0 || swap >= rules.length) return;
                [rules[i], rules[swap]] = [rules[swap], rules[i]];
                updateCell({ rules });
              }}
            />
          ))}
          <button
            style={{ marginTop: 6 }}
            onClick={() => updateCell({ rules: [...cell.rules, newRule()] })}
          >
            + Add rule
          </button>

          <ButtonEditor
            label="Cell button"
            cfg={cell.button}
            onChange={(b) => updateCell({ button: b })}
          />
        </section>
      )}

      <section>
        <h3>Panel button</h3>
        <ButtonEditor
          label="Panel button"
          cfg={panel.button}
          onChange={(b) => onPanelChange({ ...panel, button: b })}
          embedded
        />
      </section>

      <section>
        <h3>Focus mode</h3>
        <FocusRuleEditor
          rule={panel.focusRule}
          values={values}
          onChange={(fr) => onPanelChange({ ...panel, focusRule: fr })}
        />
      </section>

      <section>
        <h3>Panel actions</h3>
        <button onClick={onSaveTemplate}>Save as template</button>
        <button className="danger" onClick={onDelete} style={{ marginLeft: 6 }}>
          Delete panel
        </button>
      </section>
    </div>
  );
}

/**
 * Returns the rule's conditions, migrating the legacy single-condition shape
 * if needed. Always returns at least one condition (so the UI has something
 * to render); the empty-list case is handled at write time when the rule is
 * saved.
 */
function getRuleConditions(rule: ConditionalRule | FocusRule): Condition[] {
  if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    return rule.conditions;
  }
  if (rule.variable && rule.op) {
    return [{ id: 'legacy', variable: rule.variable, op: rule.op, value: rule.value ?? '' }];
  }
  return [newCondition()];
}

function ConditionRow({
  cond, onChange, onRemove, onMove, canRemove, isFirst
}: {
  cond: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  canRemove: boolean;
  isFirst: boolean;
}) {
  return (
    <div style={{
      borderTop: isFirst ? 'none' : '1px dashed #2a2a2a',
      paddingTop: isFirst ? 0 : 6,
      marginTop: isFirst ? 0 : 6
    }}>
      {!isFirst && (
        <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
          AND
        </div>
      )}
      <div className="row">
        <label>If var</label>
        <VarAutocompleteInput
          value={cond.variable}
          onChange={(v) => onChange({ ...cond, variable: v })}
          placeholder="atem:pgm1_input"
          wrapBareVar={false}
        />
      </div>
      <div className="row">
        <label>Operator</label>
        <select value={cond.op}
                onChange={e => onChange({ ...cond, op: e.target.value as RuleOp })}>
          {RULE_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {cond.op !== 'empty' && cond.op !== 'notEmpty' && (
        <div className="row">
          <label>Value</label>
          <input
            value={cond.value}
            onChange={e => onChange({ ...cond, value: e.target.value })}
          />
        </div>
      )}
      {canRemove && (
        <div className="row" style={{ marginTop: 4 }}>
          <button onClick={() => onMove(-1)}>↑</button>
          <button onClick={() => onMove(1)}>↓</button>
          <div style={{ flex: 1 }} />
          <button className="danger" onClick={onRemove} style={{ fontSize: 11 }}>Remove condition</button>
        </div>
      )}
    </div>
  );
}

function RuleEditor({
  rule, onChange, onDelete, onMove
}: {
  rule: ConditionalRule;
  onChange: (r: ConditionalRule) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const conds = getRuleConditions(rule);

  const setConds = (next: Condition[]) => {
    // Strip the deprecated legacy fields on the way out so we don't keep
    // writing them back into storage.
    const { variable, op, value, ...rest } = rule;
    void variable; void op; void value;
    onChange({ ...rest, conditions: next });
  };

  return (
    <div className="rule">
      {conds.map((c, i) => (
        <ConditionRow
          key={c.id}
          cond={c}
          isFirst={i === 0}
          canRemove={conds.length > 1}
          onChange={(updated) => {
            const next = [...conds]; next[i] = updated; setConds(next);
          }}
          onRemove={() => setConds(conds.filter(x => x.id !== c.id))}
          onMove={(dir) => {
            const next = [...conds];
            const j = i + dir;
            if (j < 0 || j >= next.length) return;
            [next[i], next[j]] = [next[j], next[i]];
            setConds(next);
          }}
        />
      ))}
      <button
        style={{ marginTop: 8, fontSize: 11 }}
        onClick={() => setConds([...conds, newCondition()])}
      >+ AND condition</button>

      <div className="row" style={{ marginTop: 8 }}>
        <label>BG / Text</label>
        <input type="color" value={rule.bgColor ?? '#000000'}
               onChange={e => onChange({ ...rule, bgColor: e.target.value })} />
        <input type="color" value={rule.textColor ?? '#ffffff'}
               onChange={e => onChange({ ...rule, textColor: e.target.value })} />
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <button onClick={() => onMove(-1)}>↑</button>
        <button onClick={() => onMove(1)}>↓</button>
        <div style={{ flex: 1 }} />
        <button className="danger" onClick={onDelete}>Remove rule</button>
      </div>
    </div>
  );
}

function makeCell(row: number, col: number): Cell {
  return {
    id: Math.random().toString(36).slice(2, 10),
    row, col, rowSpan: 1, colSpan: 1,
    text: '',
    align: 'center',
    valign: 'middle',
    bgColor: '#1a1a1a',
    textColor: '#ffffff',
    fontSize: 24,
    fontWeight: 400,
    borderColor: '#2a2a2a',
    borderWidth: 0,
    rules: []
  };
}

function defaultHeaderCell(): Cell {
  const c = makeCell(0, 0);
  c.text = 'Header';
  c.fontSize = 18;
  c.fontWeight = 700;
  c.bgColor = '#222222';
  return c;
}

// ---------- Button editor --------------------------------------------------

function newButtonAction(): ButtonAction {
  return {
    id: Math.random().toString(36).slice(2, 10),
    page: 1, row: 0, column: 0
  };
}

function defaultButtonConfig(): ButtonConfig {
  return { enabled: false, mode: 'press', press: null, toggleSteps: [] };
}

function ButtonEditor({
  label, cfg, onChange, embedded
}: {
  label: string;
  cfg: ButtonConfig | undefined;
  onChange: (b: ButtonConfig | undefined) => void;
  embedded?: boolean;
}) {
  const current = cfg ?? defaultButtonConfig();
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const update = (patch: Partial<ButtonConfig>) => onChange({ ...current, ...patch });

  async function fireTest(a: ButtonAction) {
    setTestMsg(null);
    try {
      const r = await api.testButton(a);
      setTestMsg({ ok: r.ok, text: r.ok ? `Fired ${a.page}/${a.row}/${a.column}` : (r.error || 'failed') });
    } catch (e) {
      setTestMsg({ ok: false, text: String((e as Error).message || e) });
    }
    setTimeout(() => setTestMsg(null), 3000);
  }

  return (
    <div style={{ marginTop: embedded ? 0 : 12, border: embedded ? 'none' : '1px solid #2a2a2a', borderRadius: 4, padding: embedded ? 0 : 10, background: embedded ? 'transparent' : '#181818' }}>
      {!embedded && (
        <h4 style={{ marginTop: 0, marginBottom: 8, fontSize: 12, color: '#888' }}>
          {label}
        </h4>
      )}

      <div className="row">
        <label>Enabled</label>
        <button
          onClick={() => update({ enabled: !current.enabled })}
          style={{
            background: current.enabled ? '#22c55e' : '#444',
            color: '#fff', border: 'none', padding: '4px 12px',
            borderRadius: 4, cursor: 'pointer', fontWeight: 600, minWidth: 50
          }}
        >
          {current.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {current.enabled && (
        <>
          <div className="row">
            <label>Mode</label>
            <select value={current.mode}
                    onChange={e => update({ mode: e.target.value as 'press' | 'toggle' })}>
              <option value="press">Press</option>
              <option value="toggle">Toggle (cycle steps)</option>
            </select>
          </div>

          {current.mode === 'press' && (
            <ActionRow
              action={current.press ?? newButtonAction()}
              onChange={a => update({ press: a })}
              onTest={fireTest}
            />
          )}

          {current.mode === 'toggle' && (
            <>
              <div style={{ fontSize: 12, color: '#888', margin: '8px 0' }}>
                Each click fires the next step, then wraps to the first.
              </div>
              {current.toggleSteps.map((step, i) => (
                <div key={step.id} style={{ borderTop: '1px solid #2a2a2a', paddingTop: 8, marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Step {i + 1}</div>
                  <ActionRow
                    action={step}
                    onChange={a => {
                      const next = [...current.toggleSteps];
                      next[i] = a;
                      update({ toggleSteps: next });
                    }}
                    onTest={fireTest}
                    onRemove={() => {
                      const next = current.toggleSteps.filter(s => s.id !== step.id);
                      update({ toggleSteps: next });
                    }}
                    onMove={dir => {
                      const next = [...current.toggleSteps];
                      const swap = i + dir;
                      if (swap < 0 || swap >= next.length) return;
                      [next[i], next[swap]] = [next[swap], next[i]];
                      update({ toggleSteps: next });
                    }}
                  />
                </div>
              ))}
              <button
                style={{ marginTop: 8 }}
                onClick={() => update({ toggleSteps: [...current.toggleSteps, newButtonAction()] })}
              >
                + Add step
              </button>
            </>
          )}

          {testMsg && (
            <div style={{
              marginTop: 8, fontSize: 12,
              color: testMsg.ok ? '#22c55e' : '#ef4444'
            }}>
              {testMsg.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActionRow({
  action, onChange, onTest, onRemove, onMove
}: {
  action: ButtonAction;
  onChange: (a: ButtonAction) => void;
  onTest: (a: ButtonAction) => void;
  onRemove?: () => void;
  onMove?: (dir: -1 | 1) => void;
}) {
  return (
    <>
      <div className="row">
        <label>Page</label>
        <input type="number" min={1} value={action.page}
               onChange={e => onChange({ ...action, page: Math.max(1, Number(e.target.value)) })} />
      </div>
      <div className="row">
        <label>Row / Col</label>
        <input type="number" min={0} value={action.row}
               onChange={e => onChange({ ...action, row: Math.max(0, Number(e.target.value)) })} />
        <input type="number" min={0} value={action.column}
               onChange={e => onChange({ ...action, column: Math.max(0, Number(e.target.value)) })} />
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button onClick={() => onTest(action)}>Test</button>
        {onMove && <button onClick={() => onMove(-1)}>↑</button>}
        {onMove && <button onClick={() => onMove(1)}>↓</button>}
        <div style={{ flex: 1 }} />
        {onRemove && <button className="danger" onClick={onRemove}>Remove</button>}
      </div>
    </>
  );
}

// ---------- Focus mode rule editor ----------------------------------------

function defaultFocusRule(): FocusRule {
  return { enabled: false, conditions: [{ id: 'init', variable: '', op: 'lt', value: '10' }] };
}

function FocusRuleEditor({
  rule, values, onChange
}: {
  rule: FocusRule | undefined;
  values: Record<string, string>;
  onChange: (r: FocusRule | undefined) => void;
}) {
  const current = rule ?? defaultFocusRule();
  const conds = getRuleConditions(current);
  const isActive = current.enabled && evaluateRule(current, values);

  const update = (patch: Partial<FocusRule>) => onChange({ ...current, ...patch });
  const setConds = (next: Condition[]) => {
    // Strip the deprecated legacy fields when writing back.
    const { variable, op, value, ...rest } = current;
    void variable; void op; void value;
    onChange({ ...rest, conditions: next });
  };

  return (
    <div>
      <p style={{ color: '#aaa', fontSize: 12, marginTop: 0, marginBottom: 8, lineHeight: 1.4 }}>
        When ALL conditions are true, this panel takes over the full canvas in
        the viewer. Returns to the normal layout when any condition becomes
        false.
      </p>

      <div className="row">
        <label>Enabled</label>
        <button
          onClick={() => update({ enabled: !current.enabled })}
          style={{
            background: current.enabled ? '#22c55e' : '#444',
            color: '#fff', border: 'none', padding: '4px 12px',
            borderRadius: 4, cursor: 'pointer', fontWeight: 600, minWidth: 50
          }}
        >
          {current.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {current.enabled && (
        <>
          {conds.map((c, i) => (
            <ConditionRow
              key={c.id}
              cond={c}
              isFirst={i === 0}
              canRemove={conds.length > 1}
              onChange={(updated) => {
                const next = [...conds]; next[i] = updated; setConds(next);
              }}
              onRemove={() => setConds(conds.filter(x => x.id !== c.id))}
              onMove={(dir) => {
                const next = [...conds];
                const j = i + dir;
                if (j < 0 || j >= next.length) return;
                [next[i], next[j]] = [next[j], next[i]];
                setConds(next);
              }}
            />
          ))}
          <button
            style={{ marginTop: 8, fontSize: 11 }}
            onClick={() => setConds([...conds, newCondition()])}
          >+ AND condition</button>

          {/* Format hint, shown when any condition uses a numeric op */}
          {conds.some(c => ['gt', 'gte', 'lt', 'lte'].includes(c.op)) && (
            <p style={{ color: '#888', fontSize: 11, lineHeight: 1.4, marginTop: 8, marginBottom: 0 }}>
              Numeric comparison supports plain numbers (<code>15</code>),
              <code> mm:ss </code>(<code>1:30</code> = 90),
              <code> hh:mm:ss </code>(<code>00:01:30</code> = 90),
              and <code>mm.ss </code>(<code>1.30</code> = 90).
              An empty / missing variable never matches.
            </p>
          )}

          {/* Live status indicator */}
          <div style={{
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 4,
            fontSize: 12,
            background: isActive ? '#0c1f12' : '#141414',
            border: `1px solid ${isActive ? '#166534' : '#2a2a2a'}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap'
          }}>
            <span style={{
              display: 'inline-block',
              width: 8, height: 8, borderRadius: '50%',
              background: isActive ? '#22c55e' : '#666',
              boxShadow: isActive ? '0 0 6px #22c55e88' : 'none'
            }} />
            <span style={{ color: isActive ? '#86efac' : '#888' }}>
              {isActive
                ? 'All conditions true - panel would be focused in viewer'
                : conds.some(c => c.variable)
                  ? 'Not all conditions true'
                  : 'No variables set'}
            </span>
          </div>

          {/* Per-condition live preview - useful when ANDing multiple */}
          {conds.length > 1 && (
            <div style={{ marginTop: 8, fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {conds.map((c, i) => {
                if (!c.variable) return null;
                const v = values[c.variable.replace(/^\$\(([^)]+)\)$/, '$1')] ?? '';
                const passes = evaluateRule(
                  { enabled: true, conditions: [c] } as FocusRule,
                  values
                );
                return (
                  <div key={c.id} style={{ color: passes ? '#86efac' : '#aaa', display: 'flex', gap: 6 }}>
                    <span style={{ color: passes ? '#22c55e' : '#666' }}>{passes ? '✓' : '✗'}</span>
                    <span style={{ color: '#7dd3fc' }}>{c.variable}</span>
                    <span style={{ color: '#666' }}>{c.op}</span>
                    <span style={{ color: '#aaa' }}>{c.value}</span>
                    <span style={{ marginLeft: 'auto', color: '#666' }}>
                      = {v === '' ? '(empty)' : v}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
