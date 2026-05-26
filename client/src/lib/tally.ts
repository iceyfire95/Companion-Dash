// Mirror of server TallySource for the client.

/**
 * How a TallySource side decides "on" from a raw Companion variable.
 * Mirrors server's TallyMatchMode.
 *
 *   truthy  - default. Existing truthy detection (1/true/on/yes/live/...).
 *   equals  - raw === matchValue (trimmed). Used by ATEM.
 *   inList  - matchValue is a comma-list; raw is a comma-list; "on" if
 *             ANY matchValue token appears as a complete token in raw.
 *             Used by Barco Event Master destination tally.
 */
export type TallyMatchMode = 'truthy' | 'equals' | 'inList';

export interface TallySource {
  id: string;
  name: string;
  slug: string;
  pvwVariable: string;
  pgmVariable: string;
  /**
   * Optional explicit match value. Interpretation depends on the
   * matching mode (see *MatchMode and isSideOn). Empty/undefined →
   * truthy detection regardless of mode.
   */
  pvwMatchValue?: string;
  pgmMatchValue?: string;
  /**
   * Optional explicit match mode. When omitted we derive from
   * matchValue: empty → 'truthy', non-empty → 'equals'. Only 'inList'
   * needs to be persisted explicitly (used for Event Master).
   */
  pvwMatchMode?: TallyMatchMode;
  pgmMatchMode?: TallyMatchMode;
  showLabel: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Hard-coded truthy detection. Covers TSL listener (True/False after
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
 * Derive the effective match mode. When the caller didn't specify
 * one explicitly, an empty matchValue means truthy and a non-empty
 * matchValue means equals. inList must always be opted into.
 */
function effectiveMode(
  matchValue: string | undefined,
  mode: TallyMatchMode | undefined
): TallyMatchMode {
  if (mode === 'truthy' || mode === 'equals' || mode === 'inList') return mode;
  if (matchValue && matchValue.length > 0) return 'equals';
  return 'truthy';
}

/**
 * Split a comma-separated string into trimmed, non-empty tokens.
 * Used for inList comparisons.
 */
function tokenize(s: string | undefined | null): string[] {
  if (!s) return [];
  return String(s).split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Generic "is this side on" check. Dispatches on effective match mode:
 *   truthy → existing truthy detection on raw
 *   equals → trim(raw) === trim(matchValue)
 *   inList → tokenize(raw) ∩ tokenize(matchValue) is non-empty, BUT
 *            wanted tokens starting with "Screen " also match raw tokens
 *            that start with "<wanted> L" (per-layer expansion from
 *            Event Master, e.g. wanted "Screen LED" matches raw token
 *            "Screen LED L2"). This mirrors the EM module's own
 *            destination-match logic.
 */
export function isSideOn(
  raw: string | undefined | null,
  matchValue: string | undefined,
  mode?: TallyMatchMode
): boolean {
  const m = effectiveMode(matchValue, mode);
  if (m === 'truthy') return isTruthyValue(raw);
  if (m === 'equals') {
    if (raw === undefined || raw === null) return false;
    return String(raw).trim() === (matchValue ?? '').trim();
  }
  // inList semantics:
  //   - exact-token match (default for any wanted token)
  //   - PLUS layer-prefix match for "Screen "-prefixed wanted tokens:
  //     a wanted "Screen Foo" matches raw token "Screen Foo Lk" for
  //     any layer suffix " L<n>". EM's destinations variable can list
  //     a screen as the bare screen OR as one-or-more layer entries
  //     depending on which layers within that screen are routing the
  //     source.
  const wanted = tokenize(matchValue);
  if (wanted.length === 0) return false;
  const have = tokenize(raw);
  if (have.length === 0) return false;
  const haveSet = new Set(have);
  for (const w of wanted) {
    if (haveSet.has(w)) return true;
    // Layer-prefix check applies only to screen-style tokens. AUX
    // destinations are exact-match only.
    if (w.startsWith('Screen ')) {
      const prefix = `${w} L`;
      for (const h of have) {
        if (h.startsWith(prefix)) return true;
      }
    }
  }
  return false;
}

export type TallyState = 'pgm' | 'aux' | 'pvw' | 'off';

/**
 * Compute the active tally state for a source.
 *
 * Priority (highest wins):
 *   1. PGM at a tracked SCREEN destination       → 'pgm'  (red)
 *   2. PGM or PVW at a tracked AUX destination   → 'aux'  (yellow)
 *   3. PVW at a tracked SCREEN destination       → 'pvw'  (green)
 *   4. (back-compat) For non-inList sources:
 *        PGM truthy/equals                       → 'pgm'
 *        PVW truthy/equals                       → 'pvw'
 *   5. Otherwise                                  → 'off'  (black)
 *
 * The aux-overrides-pvw rule is per operator request: a feed going to
 * an aux output should be visually distinct from a normal PVW preview,
 * since aux destinations are typically discrete utility feeds
 * (confidence monitors, IMAG, etc.) and aren't part of the
 * red/green broadcast convention.
 */
export function tallyState(
  values: Record<string, string>,
  source: TallySource
): TallyState {
  // First: check inList-style screen / aux matches.
  const pgmRaw = matchedRawTokens(
    values[source.pgmVariable],
    source.pgmMatchValue,
    source.pgmMatchMode
  );
  const pvwRaw = matchedRawTokens(
    values[source.pvwVariable],
    source.pvwMatchValue,
    source.pvwMatchMode
  );
  const hasPgmScreen = pgmRaw.some(t => t.startsWith('Screen '));
  if (hasPgmScreen) return 'pgm';
  const hasAnyAux =
    pgmRaw.some(t => t.startsWith('AUX ')) ||
    pvwRaw.some(t => t.startsWith('AUX '));
  if (hasAnyAux) return 'aux';
  const hasPvwScreen = pvwRaw.some(t => t.startsWith('Screen '));
  if (hasPvwScreen) return 'pvw';

  // Back-compat path for non-inList sources (TSL listener, vMix,
  // ATEM). These never returned raw tokens above (matchedRawTokens
  // only fires on inList mode) so we still need the original
  // truthy/equals check.
  const pgmOn = source.pgmVariable
    ? isSideOn(values[source.pgmVariable], source.pgmMatchValue, source.pgmMatchMode)
    : false;
  if (pgmOn) return 'pgm';
  const pvwOn = source.pvwVariable
    ? isSideOn(values[source.pvwVariable], source.pvwMatchValue, source.pvwMatchMode)
    : false;
  if (pvwOn) return 'pvw';
  return 'off';
}

export function tallyColor(state: TallyState): string {
  if (state === 'pgm') return '#dc2626';   // red
  if (state === 'aux') return '#eab308';   // yellow (Tailwind yellow-500)
  if (state === 'pvw') return '#16a34a';   // green
  return '#000000';
}

// ===========================================================================
// Live-destination introspection
//
// For inList sources (Event Master), the operator wants to know not
// just "am I live?" but "where am I live?" - which of the tracked
// destinations is the source currently routed to. These helpers
// return that list per side.
//
// Returned names are STRIPPED of the kind prefix - so "Screen LED"
// renders as just "LED" in the UI, matching what the user picked in
// the wizard checklist. Layer suffixes like " L2" / " L3" are also
// stripped - the operator cares "I'm on LED", not "I'm on LED layer 3".
// ===========================================================================

/**
 * Strip the "Screen "/"AUX " kind prefix from a token, and trim any
 * trailing " L<digits>" layer marker. Used for display only - the
 * underlying match logic still uses the full prefixed token.
 *
 *   "Screen LED"      → "LED"
 *   "Screen LED L3"   → "LED"
 *   "AUX Aux1"        → "Aux1"
 *   "Something else"  → "Something else"  (unrecognised: pass through)
 */
function stripDisplayDecoration(token: string): string {
  let t = token;
  if (t.startsWith('Screen ')) t = t.slice('Screen '.length);
  else if (t.startsWith('AUX ')) t = t.slice('AUX '.length);
  // Strip " L<digits>" layer suffix (only for screen-style tokens but
  // harmless if applied universally - aux destinations don't have
  // layer suffixes).
  t = t.replace(/ L\d+$/, '');
  return t;
}

/**
 * Like {@link matchedTokens} but returns the WANTED-side tokens with
 * their kind prefix intact ("Screen LED", "AUX Aux1"). Used by the
 * tally-state computer to decide between PGM (red) / AUX (yellow) /
 * PVW (green). Display code should use matchedTokens which strips
 * those decorations.
 */
export function matchedRawTokens(
  raw: string | undefined | null,
  matchValue: string | undefined,
  mode: TallyMatchMode | undefined
): string[] {
  const m = effectiveMode(matchValue, mode);
  if (m !== 'inList') return [];
  if (!matchValue || !raw) return [];
  const wanted = matchValue.split(',').map(t => t.trim()).filter(t => t.length > 0);
  const have = String(raw).split(',').map(t => t.trim()).filter(t => t.length > 0);
  if (wanted.length === 0 || have.length === 0) return [];
  const haveSet = new Set(have);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of wanted) {
    let hit = haveSet.has(w);
    if (!hit && w.startsWith('Screen ')) {
      const prefix = `${w} L`;
      hit = have.some(h => h.startsWith(prefix));
    }
    if (!hit) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/**
 * Given a tally source side (variable + matchValue + mode) and the
 * current raw value, return the list of TRACKED destinations that are
 * currently matched. Display-stripped (no "Screen "/"AUX " prefix, no
 * " L2" suffix) and deduplicated, preserving the matchValue order so
 * the UI is stable run to run.
 *
 * Returns [] for non-inList modes (truthy / equals don't produce a
 * list of matched things - they're scalar "on/off"). Returns [] when
 * matchValue or raw is empty / undefined.
 */
export function matchedTokens(
  raw: string | undefined | null,
  matchValue: string | undefined,
  mode: TallyMatchMode | undefined
): string[] {
  const rawMatches = matchedRawTokens(raw, matchValue, mode);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rawMatches) {
    const display = stripDisplayDecoration(r);
    if (seen.has(display)) continue;
    seen.add(display);
    out.push(display);
  }
  return out;
}

export interface SideMatches {
  pgm: string[];
  pvw: string[];
}

/**
 * Convenience: compute matchedTokens for both sides of a source in
 * one call. Returns empty arrays for non-inList sources.
 */
export function matchedTokensBothSides(
  values: Record<string, string>,
  source: TallySource
): SideMatches {
  return {
    pgm: matchedTokens(
      values[source.pgmVariable],
      source.pgmMatchValue,
      source.pgmMatchMode
    ),
    pvw: matchedTokens(
      values[source.pvwVariable],
      source.pvwMatchValue,
      source.pvwMatchMode
    )
  };
}

/**
 * Returns the display-ready list of currently-matched destinations
 * that are RELEVANT to the current tally state - the things the
 * operator wants to see at a glance:
 *
 *   pgm → screen destinations matched on the PGM side
 *   aux → aux destinations matched on either side
 *   pvw → screen destinations matched on the PVW side
 *   off → []
 *
 * For each token we strip the kind prefix and any layer suffix for
 * display, dedupe, and preserve match-value order.
 */
export function activeMatches(
  values: Record<string, string>,
  source: TallySource,
  state: TallyState
): string[] {
  if (state === 'off') return [];
  const pgmRaw = matchedRawTokens(
    values[source.pgmVariable],
    source.pgmMatchValue,
    source.pgmMatchMode
  );
  const pvwRaw = matchedRawTokens(
    values[source.pvwVariable],
    source.pvwMatchValue,
    source.pvwMatchMode
  );
  let picked: string[];
  if (state === 'pgm')      picked = pgmRaw.filter(t => t.startsWith('Screen '));
  else if (state === 'aux') picked = [
    ...pgmRaw.filter(t => t.startsWith('AUX ')),
    ...pvwRaw.filter(t => t.startsWith('AUX '))
  ];
  else                       picked = pvwRaw.filter(t => t.startsWith('Screen '));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of picked) {
    const d = stripDisplayDecoration(t);
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

// --- Auto-populate types (shared with server) ----------------------------

export type ModuleType = 'tsl' | 'vmix' | 'atem' | 'em';

/**
 * One Event Master destination. Kind distinguishes screens from aux
 * destinations because the EM module formats them differently in the
 * source's pgm/pvw destinations variable ("Screen <name>" vs
 * "AUX <name>"), and we need that to build the right inList match
 * token.
 */
export interface EMDestination {
  name: string;
  kind: 'screen' | 'aux';
}

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
  /** Event Master: destinations to track as structured (name + kind) entries. */
  emDestinations?: EMDestination[];
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

/** Reply shape for /api/tally-sources/auto-populate/em-destinations */
export interface EMDestinations {
  destinations: EMDestination[];
  screenSlots: number;
  auxSlots: number;
}
