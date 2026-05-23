// Mirror of server TallySource for the client.

export interface TallySource {
  id: string;
  name: string;
  slug: string;
  pvwVariable: string;
  pgmVariable: string;
  /**
   * When set (non-empty), "on" requires raw variable value to equal this
   * string (after trim, string-equal). When empty/undefined, falls back
   * to truthy detection. ATEM uses match mode (`pgm1_input_id == "5"`);
   * TSL / vMix use truthy mode.
   */
  pvwMatchValue?: string;
  pgmMatchValue?: string;
  showLabel: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Hard-coded truthy detection. Covers TSL listener (1/0 → True/False after
 * module-side conversion), vMix (true/false strings), and any sensible
 * "on / yes / active / live" string a module might emit. Anything else
 * including empty is off.
 */
const TRUTHY = new Set([
  '1', 'true', 'on', 'yes', 'y', 'live', 'active', 'program', 'preview',
  'taken', 'enabled'
]);

export function isTruthyValue(raw: string | undefined | null): boolean {
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toLowerCase();
  if (!s) return false;
  return TRUTHY.has(s);
}

/**
 * Generic "is this side on" check. If a match value is set, raw must
 * equal it (after trim). Else fall back to truthy detection.
 */
export function isSideOn(
  raw: string | undefined | null,
  matchValue: string | undefined
): boolean {
  if (matchValue && matchValue.length > 0) {
    if (raw === undefined || raw === null) return false;
    return String(raw).trim() === matchValue.trim();
  }
  return isTruthyValue(raw);
}

export type TallyState = 'pgm' | 'pvw' | 'off';

/** PGM beats PVW (standard broadcast convention). */
export function tallyState(
  values: Record<string, string>,
  source: TallySource
): TallyState {
  const pgmOn = source.pgmVariable
    ? isSideOn(values[source.pgmVariable], source.pgmMatchValue)
    : false;
  if (pgmOn) return 'pgm';
  const pvwOn = source.pvwVariable
    ? isSideOn(values[source.pvwVariable], source.pvwMatchValue)
    : false;
  if (pvwOn) return 'pvw';
  return 'off';
}

export function tallyColor(state: TallyState): string {
  if (state === 'pgm') return '#dc2626';
  if (state === 'pvw') return '#16a34a';
  return '#000000';
}

// --- Auto-populate types (shared with server) ----------------------------

export type ModuleType = 'tsl' | 'vmix' | 'atem';

export interface AutoPopulateRequest {
  module: ModuleType;
  connection: string;
  inputCount: number;
  tslStartAddress?: number;
  tslPvwBit?: 1 | 2 | 3 | 4;
  tslPgmBit?: 1 | 2 | 3 | 4;
  vmixMix?: number;
  atemME?: number;
  atemStartInput?: number;
}

export interface ProposedSource {
  partial: Partial<TallySource>;
  confirmed: boolean;
  probedVariable: string;
}

export interface AutoPopulateResult {
  proposed: ProposedSource[];
  unconfirmed: string[];
}
