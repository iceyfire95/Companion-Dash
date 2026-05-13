import { useState } from 'react';
import type { Panel, Cell, ConditionalRule, RuleOp } from '../types';

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

function newRule(): ConditionalRule {
  return {
    id: Math.random().toString(36).slice(2, 10),
    variable: '',
    op: 'eq',
    value: '',
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
}

export function Inspector({
  panel, selectedCellId, onPanelChange, onSelectCell, onDelete, onSaveTemplate
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
            <textarea
              value={cell.text}
              onChange={e => updateCell({ text: e.target.value })}
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
        </section>
      )}

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

function RuleEditor({
  rule, onChange, onDelete, onMove
}: {
  rule: ConditionalRule;
  onChange: (r: ConditionalRule) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rule">
      <div className="row">
        <label>If var</label>
        <input
          value={rule.variable}
          onChange={e => onChange({ ...rule, variable: e.target.value })}
          placeholder="atem:pgm1_input_id"
        />
      </div>
      <div className="row">
        <label>Operator</label>
        <select value={rule.op}
                onChange={e => onChange({ ...rule, op: e.target.value as RuleOp })}>
          {RULE_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {rule.op !== 'empty' && rule.op !== 'notEmpty' && (
        <div className="row">
          <label>Value</label>
          <input
            value={rule.value}
            onChange={e => onChange({ ...rule, value: e.target.value })}
          />
        </div>
      )}
      <div className="row">
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
        <button className="danger" onClick={onDelete}>Remove</button>
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