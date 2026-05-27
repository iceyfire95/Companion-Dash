export type RuleOp =
  | 'eq' | 'neq' | 'contains' | 'startsWith' | 'endsWith'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'regex' | 'empty' | 'notEmpty';

/** A single test against a variable. Multiple conditions are ANDed together. */
export interface Condition {
  id: string;
  variable: string;
  op: RuleOp;
  value: string;
}

/**
 * Conditional styling rule for a cell. Matches when ALL conditions are true.
 * The legacy single-condition shape (variable/op/value at the top level) is
 * still readable; on load we migrate to conditions[].
 */
export interface ConditionalRule {
  id: string;
  conditions: Condition[];
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  fontWeight?: number;
  /** @deprecated kept for read-time back-compat - see migrateRule. */
  variable?: string;
  /** @deprecated */
  op?: RuleOp;
  /** @deprecated */
  value?: string;
}

export interface ButtonAction {
  id: string;
  page: number;
  row: number;
  column: number;
}

export interface ButtonConfig {
  enabled: boolean;
  mode: 'press' | 'toggle';
  press: ButtonAction | null;
  toggleSteps: ButtonAction[];
}

/**
 * Auto-focus rule for a panel. Matches when ALL conditions are true.
 * Same back-compat strategy as ConditionalRule.
 */
export interface FocusRule {
  enabled: boolean;
  conditions: Condition[];
  /** @deprecated */
  variable?: string;
  /** @deprecated */
  op?: RuleOp;
  /** @deprecated */
  value?: string;
}

export interface Cell {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  bgColor: string;
  textColor: string;
  fontSize: number;
  fontWeight: number;
  borderColor: string;
  borderWidth: number;
  rules: ConditionalRule[];
  button?: ButtonConfig;
}

export interface Panel {
  id: string;
  dashboardId: string;
  x: number; y: number; width: number; height: number;
  zIndex: number;
  headerEnabled: boolean;
  header: Cell | null;
  rows: number;
  cols: number;
  cells: Cell[];
  /** Per-row track sizes (fractions). Absent / wrong length = uniform 1fr. */
  rowSizes?: number[];
  /** Per-column track sizes (fractions). Absent / wrong length = uniform 1fr. */
  colSizes?: number[];
  bgColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  padding: number;
  gap: number;
  templateId: string | null;
  name: string;
  button?: ButtonConfig;
  focusRule?: FocusRule;
}

export interface Dashboard {
  id: string;
  name: string;
  width: number;
  height: number;
  bgColor: string;
  /** Fit mode for the optional background image. Defaults to 'cover'. */
  backgroundFit?: 'cover' | 'contain' | 'stretch';
  /** True when this dashboard has a background image uploaded. */
  hasBackground?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SavedPanelTemplate {
  id: string;
  name: string;
  panel: Omit<Panel, 'id' | 'dashboardId' | 'x' | 'y'>;
  createdAt: number;
}

export interface CompanionConfig {
  host: string;
  port: number;
  pollIntervalMs: number;
  enabled: boolean;
}
