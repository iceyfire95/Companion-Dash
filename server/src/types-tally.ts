// Standalone tally types - imported by db + routes.
// Kept in its own file so the diff against types.ts stays trivial.

export interface TallySource {
  id: string;
  name: string;          // display name, e.g. "Cam 1"
  slug: string;          // url-safe, used in /tally/:slug
  pvwVariable: string;   // canonical conn:varname (no $())
  pgmVariable: string;   // canonical conn:varname (no $())

  /**
   * Optional explicit-match values.
   *
   * When unset (empty string / undefined) → "on" is determined by truthy
   * detection (1 / true / on / yes / live / active …). This is the right
   * mode for boolean-style tally vars like TSL listener or vMix.
   *
   * When set → "on" means the raw variable value equals this string.
   * Required for ATEM, where the variable holds a single input id
   * pointer (`atem:pgm1_input_id = "5"`) and we need to ask "is the
   * pointer currently equal to MY input number?".
   *
   * Trailing/leading whitespace is trimmed on both sides for comparison.
   */
  pvwMatchValue?: string;
  pgmMatchValue?: string;

  showLabel: boolean;    // viewer label on/off
  createdAt: number;
  updatedAt: number;
}
