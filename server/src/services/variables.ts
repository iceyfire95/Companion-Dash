import type { Panel, Cell, ConditionalRule } from '../types.js';

const VAR_RE = /\$\(([^)]+)\)/g;

/** Strip optional $(...) wrapper around a variable identifier. */
function normalizeVarId(s: string): string {
  const m = s.trim().match(/^\$\(([^)]+)\)$/);
  return (m ? m[1] : s).trim();
}

/** Pull every $(conn:var) id out of a Panel. */
export function extractPanelVariables(p: Panel): Set<string> {
  const out = new Set<string>();
  const addFromText = (s: string) => {
    s.replace(VAR_RE, (_m, id) => {
      const trimmed = String(id).trim();
      if (trimmed.includes(':')) out.add(trimmed);
      return '';
    });
  };
  const addFromCell = (c: Cell) => {
    addFromText(c.text);
    for (const r of c.rules) {
      const v = normalizeVarId(r.variable);
      if (v.includes(':')) out.add(v);
    }
  };
  if (p.headerEnabled && p.header) addFromCell(p.header);
  for (const c of p.cells) addFromCell(c);
  return out;
}

export function extractAllVariables(panels: Panel[]): Set<string> {
  const all = new Set<string>();
  for (const p of panels) for (const v of extractPanelVariables(p)) all.add(v);
  return all;
}

/** Replace $(conn:var) tokens with resolved values (or empty string). */
export function resolveText(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (_m, id) => {
    const trimmed = String(id).trim();
    return values[trimmed] ?? '';
  });
}

export function evaluateRule(rule: ConditionalRule, values: Record<string, string>): boolean {
  const raw = values[rule.variable] ?? '';
  const target = rule.value;
  switch (rule.op) {
    case 'eq': return raw === target;
    case 'neq': return raw !== target;
    case 'contains': return raw.includes(target);
    case 'startsWith': return raw.startsWith(target);
    case 'endsWith': return raw.endsWith(target);
    case 'empty': return raw.length === 0;
    case 'notEmpty': return raw.length > 0;
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const a = Number(raw); const b = Number(target);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (rule.op === 'gt') return a > b;
      if (rule.op === 'gte') return a >= b;
      if (rule.op === 'lt') return a < b;
      return a <= b;
    }
    case 'regex': {
      try { return new RegExp(target).test(raw); } catch { return false; }
    }
  }
}

/** First matching rule wins; returns merged style overrides or null. */
export function pickRuleOverrides(
  cell: Cell,
  values: Record<string, string>
): Partial<Cell> | null {
  for (const r of cell.rules) {
    if (evaluateRule(r, values)) {
      const o: Partial<Cell> = {};
      if (r.bgColor !== undefined) o.bgColor = r.bgColor;
      if (r.textColor !== undefined) o.textColor = r.textColor;
      if (r.borderColor !== undefined) o.borderColor = r.borderColor;
      if (r.fontWeight !== undefined) o.fontWeight = r.fontWeight;
      return o;
    }
  }
  return null;
}