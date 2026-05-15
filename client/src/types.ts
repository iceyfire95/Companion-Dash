export type RuleOp =
  | 'eq' | 'neq' | 'contains' | 'startsWith' | 'endsWith'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'regex' | 'empty' | 'notEmpty';

export interface ConditionalRule {
  id: string;
  variable: string;
  op: RuleOp;
  value: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  fontWeight?: number;
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

export interface FocusRule {
  enabled: boolean;
  variable: string;
  op: RuleOp;
  value: string;
}

export interface FocusRule {
  enabled: boolean;
  variable: string;
  op: RuleOp;
  value: string;
}

export interface FocusRule {
  enabled: boolean;
  variable: string;
  op: RuleOp;
  value: string;
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
