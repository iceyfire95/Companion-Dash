// Standalone tally types - imported by db + routes.
// Kept in its own file so the diff against types.ts stays trivial.

/**
 * How a TallySource side (pvw OR pgm) decides whether it's "on" from
 * a raw Companion variable value.
 *
 *   truthy   - existing default. "On" if the value is in the truthy
 *              set (1/true/on/yes/live/active/...). Used by TSL listener,
 *              vMix, OBS - anything that publishes a boolean-ish flag.
 *
 *   equals   - "On" iff trim(raw) === trim(matchValue). Used by ATEM,
 *              where pgm<ME>_input_id holds the currently-live input id
 *              as a single integer; per-camera tally means "pointer == N".
 *
 *   inList   - "On" iff matchValue (a comma-separated list of tokens)
 *              has ANY token that appears as a complete token in raw
 *              (also comma-separated). Used by Barco Event Master, where
 *              source_<N>_pgm_destinations holds the LIST of destinations
 *              currently showing this source - we light the source's tally
 *              red if ANY user-tracked destination is in that list.
 *
 * Backward compat: when the column is missing or empty, callers derive
 * the mode from the matchValue field (empty → truthy, non-empty → equals).
 * Only inList needs to be set explicitly.
 */
export type TallyMatchMode = 'truthy' | 'equals' | 'inList';

export interface TallySource {
  id: string;
  name: string;          // display name, e.g. "Cam 1"
  slug: string;          // url-safe, used in /tally/:slug
  pvwVariable: string;   // canonical conn:varname (no $())
  pgmVariable: string;   // canonical conn:varname (no $())

  /**
   * Match value for the pvw / pgm side. Interpretation depends on the
   * corresponding *MatchMode field; see TallyMatchMode for details.
   * Empty string means "no match value set" - the side falls back to
   * truthy detection regardless of mode field.
   */
  pvwMatchValue?: string;
  pgmMatchValue?: string;

  /**
   * Explicit match mode override. Optional - when missing or empty we
   * derive: empty matchValue → 'truthy', non-empty → 'equals'. Only
   * 'inList' needs to be persisted explicitly.
   */
  pvwMatchMode?: TallyMatchMode;
  pgmMatchMode?: TallyMatchMode;

  showLabel: boolean;    // viewer label on/off
  createdAt: number;
  updatedAt: number;
}
