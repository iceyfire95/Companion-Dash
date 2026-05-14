import { nanoid } from 'nanoid';

export const newId = (): string => nanoid(12);

/** Address of a Companion button. Page is 1-based; row/column 0-based. */
export interface ButtonAction {
  id: string;
  page: number;
  row: number;
  column: number;
}

export interface ButtonConfig {
  enabled: boolean;
  mode: 'press' | 'toggle';
  /** Used when mode === 'press'. */
  press: ButtonAction | null;
  /**
   * Used when mode === 'toggle'. Each click fires the next action in the list
   * (cycles back to start). Empty list = no-op.
   */
  toggleSteps: ButtonAction[];
}

export function defaultButtonConfig(): ButtonConfig {
  return { enabled: false, mode: 'press', press: null, toggleSteps: [] };
}

// Cell = one text field. Header is a cell too (full-width, separate flag).
export interface Cell {
  id: string;
  row: number;       // 0-indexed grid position
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;      // raw text with $(connection:var) placeholders + markdown/html
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  // Base style
  bgColor: string;
  textColor: string;
  fontSize: number;       // px, base; auto-fit shrinks to fit
  fontWeight: number;     // 400, 700
  borderColor: string;
  borderWidth: number;
  // Conditional rules
  rules: ConditionalRule[];
  // Optional Companion button binding
  button?: ButtonConfig;
}

export type RuleOp =
  | 'eq' | 'neq' | 'contains' | 'startsWith' | 'endsWith'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'regex' | 'empty' | 'notEmpty';

export interface ConditionalRule {
  id: string;
  variable: string;            // e.g. "atem:pgm1_input" or "custom:cue"
  op: RuleOp;
  value: string;               // compared against
  // Style overrides
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  fontWeight?: number;
}

export interface Panel {
  id: string;
  dashboardId: string;
  // Position (free / absolute)
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  // Structure
  headerEnabled: boolean;
  header: Cell | null;        // null when headerEnabled false
  rows: number;
  cols: number;
  cells: Cell[];              // body cells, grid layout
  // Panel-wide styling
  bgColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  padding: number;
  gap: number;
  // Template link
  templateId: string | null;  // if instantiated from template
  name: string;               // user label
  // Optional panel-level Companion button binding (click anywhere in panel
  // that isn't a button cell triggers this)
  button?: ButtonConfig;
}

export interface Dashboard {
  id: string;
  name: string;
  width: number;              // canvas width (px) - 0 for fluid
  height: number;
  bgColor: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedPanelTemplate {
  id: string;
  name: string;
  // Stored panel shape, but x/y stripped on apply
  panel: Omit<Panel, 'id' | 'dashboardId' | 'x' | 'y'>;
  createdAt: number;
}

export interface CompanionConfig {
  host: string;               // e.g. "127.0.0.1"
  port: number;               // e.g. 8000
  pollIntervalMs: number;     // 100 default
  enabled: boolean;
}
