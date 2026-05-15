import type { Cell, RuleOp, Condition, ConditionalRule, FocusRule } from '../types';

const VAR_RE = /\$\(([^)]+)\)/g;

export function resolveText(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (_m, id) => values[String(id).trim()] ?? '');
}

/** Strip optional $(...) wrapper around a variable identifier. */
function normalizeVarId(s: string): string {
  const m = s.trim().match(/^\$\(([^)]+)\)$/);
  return (m ? m[1] : s).trim();
}

/**
 * Parse a string as a number, with support for common Companion time formats:
 *   "15"        -> 15
 *   "15.5"      -> 15.5
 *   "1:30"      -> 90        (mm:ss)
 *   "01:02:30"  -> 3750      (hh:mm:ss)
 *   "1.30"      -> 90        (mm.ss - some modules send periods)
 *   ""          -> NaN       (empty/missing)
 *   "abc"       -> NaN
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

/**
 * Evaluate a single Condition against current variable values.
 *
 * For numeric operators (gt/gte/lt/lte), the raw value is parsed by
 * parseNumeric so time-formatted strings like "1:30" work. If the variable
 * is missing or empty, numeric comparisons return false (rather than
 * coercing empty to 0).
 */
export function evaluateCondition(
  cond: { variable: string; op: RuleOp; value: string },
  values: Record<string, string>
): boolean {
  const raw = values[normalizeVarId(cond.variable)] ?? '';
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

/**
 * Read the conditions of a rule, migrating the legacy flat
 * {variable, op, value} shape into a single-element conditions[] if needed.
 * Returns [] for rules that have neither a populated conditions[] nor a
 * legacy variable - those rules never match.
 */
export function getConditions(rule: ConditionalRule | FocusRule): Condition[] {
  if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    return rule.conditions;
  }
  if (rule.variable && rule.op) {
    return [{
      id: 'legacy',
      variable: rule.variable,
      op: rule.op,
      value: rule.value ?? ''
    }];
  }
  return [];
}

/**
 * Evaluate a rule (cell ConditionalRule or panel FocusRule). Matches when ALL
 * conditions are true. Empty conditions list never matches.
 */
export function evaluateRule(
  rule: ConditionalRule | FocusRule,
  values: Record<string, string>
): boolean {
  const conds = getConditions(rule);
  if (conds.length === 0) return false;
  return conds.every(c => evaluateCondition(c, values));
}

export interface AppliedStyle {
  bgColor: string;
  textColor: string;
  borderColor: string;
  fontWeight: number;
}

export function applyRules(cell: Cell, values: Record<string, string>): AppliedStyle {
  const style: AppliedStyle = {
    bgColor: cell.bgColor,
    textColor: cell.textColor,
    borderColor: cell.borderColor,
    fontWeight: cell.fontWeight
  };
  for (const r of cell.rules) {
    if (evaluateRule(r, values)) {
      if (r.bgColor !== undefined) style.bgColor = r.bgColor;
      if (r.textColor !== undefined) style.textColor = r.textColor;
      if (r.borderColor !== undefined) style.borderColor = r.borderColor;
      if (r.fontWeight !== undefined) style.fontWeight = r.fontWeight;
      break;
    }
  }
  return style;
}
