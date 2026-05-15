import type { Cell, RuleOp } from '../types';

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
 * Evaluate a rule-shaped object against current variable values. Accepts
 * anything with { variable, op, value } so it works for ConditionalRule and
 * FocusRule.
 */
export function evaluateRule(
  rule: { variable: string; op: RuleOp; value: string },
  values: Record<string, string>
): boolean {
  const raw = values[normalizeVarId(rule.variable)] ?? '';
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