import type { Panel, Cell, ConditionalRule, FocusRule, Condition, RuleOp } from '../types.js';

const VAR_RE = /\$\(([^)]+)\)/g;

/** Strip optional $(...) wrapper around a variable identifier. */
function normalizeVarId(s: string): string {
  const m = s.trim().match(/^\$\(([^)]+)\)$/);
  return (m ? m[1] : s).trim();
}

/**
 * Read the conditions of a rule, migrating the legacy flat
 * {variable, op, value} shape into a single-element conditions[] if needed.
 */
function getConditions(rule: ConditionalRule | FocusRule): Condition[] {
  if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    return rule.conditions;
  }
  if (rule.variable && rule.op) {
    return [{ id: 'legacy', variable: rule.variable, op: rule.op, value: rule.value ?? '' }];
  }
  return [];
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
      for (const cond of getConditions(r)) {
        const v = normalizeVarId(cond.variable);
        if (v.includes(':')) out.add(v);
      }
    }
  };
  if (p.headerEnabled && p.header) addFromCell(p.header);
  for (const c of p.cells) addFromCell(c);
  // Focus rule's conditions should also be polled.
  if (p.focusRule?.enabled) {
    for (const cond of getConditions(p.focusRule)) {
      const v = normalizeVarId(cond.variable);
      if (v.includes(':')) out.add(v);
    }
  }
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

/**
 * Parse a string as a number, with support for common Companion time formats:
 *   "15" -> 15, "1:30" -> 90, "01:02:30" -> 3750, "1.30" -> 90.
 */
export function parseNumeric(s: string): number {
  const trimmed = String(s).trim();
  if (!trimmed) return NaN;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(p => Number(p));
    if (parts.some(Number.isNaN)) return NaN;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return NaN;
  }
  const mmSsMatch = trimmed.match(/^(-?\d+)\.(\d{2})$/);
  if (mmSsMatch) {
    const mm = Number(mmSsMatch[1]);
    const ss = Number(mmSsMatch[2]);
    if (ss < 60 && Math.abs(mm) <= 999) {
      return (mm >= 0 ? mm * 60 + ss : mm * 60 - ss);
    }
  }
  return Number(trimmed);
}

/** Evaluate a single condition. */
export function evaluateCondition(
  cond: { variable: string; op: RuleOp; value: string },
  values: Record<string, string>
): boolean {
  const varId = normalizeVarId(cond.variable);
  const raw = values[varId] ?? '';
  const target = cond.value;
  switch (cond.op) {
    case 'eq': return raw === target;
    case 'neq': return raw !== target;
    case 'contains': return raw.includes(target);
    case 'startsWith': return raw.startsWith(target);
    case 'endsWith': return raw.endsWith(target);
    case 'empty': return raw.trim().length === 0;
    case 'notEmpty': return raw.trim().length > 0;
    case 'gt': case 'gte': case 'lt': case 'lte': {
      if (raw.trim().length === 0) return false;
      const a = parseNumeric(raw);
      const b = parseNumeric(target);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (cond.op === 'gt') return a > b;
      if (cond.op === 'gte') return a >= b;
      if (cond.op === 'lt') return a < b;
      return a <= b;
    }
    case 'regex': {
      try { return new RegExp(target).test(raw); } catch { return false; }
    }
  }
}

/** A rule matches when ALL conditions are true. Empty list never matches. */
export function evaluateRule(
  rule: ConditionalRule | FocusRule,
  values: Record<string, string>
): boolean {
  const conds = getConditions(rule);
  if (conds.length === 0) return false;
  return conds.every(c => evaluateCondition(c, values));
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
