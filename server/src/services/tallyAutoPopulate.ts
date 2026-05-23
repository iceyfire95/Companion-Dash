import { request } from 'undici';
import { getCompanionConfig } from '../db/index.js';
import type { TallySource } from '../types-tally.js';

/**
 * Auto-populate: given a known module type + connection label + options,
 * probe companion's HTTP API to discover which inputs exist, then return
 * a set of proposed TallySource rows. Caller (route) decides whether to
 * persist them via bulkInsertTallySources.
 *
 * Returned rows are PARTIAL TallySource shape (no id / timestamps / slug).
 * The DB layer fills those in via newTallySource() during bulk insert.
 *
 * Probing strategy is "user told us how many inputs" → fetch a label
 * variable per input from companion to confirm the input exists. We do
 * this strictly to populate the source name; the tally pvw/pgm vars
 * themselves are NOT probed (they may not yet have a value, esp. for TSL
 * listener which only creates vars when data arrives — but the variable
 * name pattern is stable).
 *
 * For inputs whose label probe fails (HTTP non-200), we still create the
 * source but with a fallback name like "Input 5".
 */

export type ModuleType = 'tsl' | 'vmix' | 'atem';

export interface AutoPopulateRequest {
  module: ModuleType;
  /** Companion connection label, case-sensitive in v4 (e.g. "tsl", "vmix", "atem"). */
  connection: string;
  /** How many inputs/tally-addresses to enumerate. 1-128. */
  inputCount: number;

  // Module-specific options ----------------------------------------------

  /** TSL: starting address. Default 0 (TSL listener uses 0-based addresses). */
  tslStartAddress?: number;
  /**
   * TSL: which tally bits map to PVW/PGM. TSL has 4 bits; convention is
   * tally1=PVW, tally2=PGM, but some setups invert. Default { pvw: 1, pgm: 2 }.
   */
  tslPvwBit?: 1 | 2 | 3 | 4;
  tslPgmBit?: 1 | 2 | 3 | 4;

  /** vMix: which mix number to use. Default 1. */
  vmixMix?: number;

  /** ATEM: which ME number to use. Default 1. */
  atemME?: number;
  /**
   * ATEM: starting input number. Default 1. (ATEM input ids include
   * non-camera things like Color, Media Player, SuperSource at higher
   * numbers — starting at 1 + counting up keeps it cameras-only.)
   */
  atemStartInput?: number;
}

export interface ProposedSource {
  /** Fully filled-in row WITHOUT id/slug/timestamps. */
  partial: Partial<TallySource>;
  /** True if companion confirmed this input exists (label probe succeeded). */
  confirmed: boolean;
  /** The variable we probed to confirm existence, for the UI preview. */
  probedVariable: string;
}

export interface AutoPopulateResult {
  proposed: ProposedSource[];
  /** Variables we attempted to probe but companion returned non-200 for. */
  unconfirmed: string[];
}

const PROBE_TIMEOUT_MS = 1500;
const PROBE_CONCURRENCY = 8;

export async function autoPopulate(
  req: AutoPopulateRequest
): Promise<AutoPopulateResult> {
  const cfg = getCompanionConfig();
  const base = `http://${cfg.host}:${cfg.port}`;

  // Per-module planner: returns list of "what to probe + how to interpret".
  const plans = buildPlan(req);

  // Probe each input's label variable in parallel (bounded).
  const results: ProposedSource[] = new Array(plans.length);
  const unconfirmed: string[] = [];

  for (let i = 0; i < plans.length; i += PROBE_CONCURRENCY) {
    const chunk = plans.slice(i, i + PROBE_CONCURRENCY);
    await Promise.all(chunk.map(async (plan, j) => {
      const idx = i + j;
      const label = await probeLabel(base, plan.labelVariable);
      const finalName = label ?? plan.fallbackName;
      const confirmed = label !== null;
      if (!confirmed) unconfirmed.push(plan.labelVariable);
      results[idx] = {
        partial: {
          name: finalName,
          pvwVariable: plan.pvwVariable,
          pgmVariable: plan.pgmVariable,
          pvwMatchValue: plan.pvwMatchValue,
          pgmMatchValue: plan.pgmMatchValue,
          showLabel: true
        },
        confirmed,
        probedVariable: plan.labelVariable
      };
    }));
  }

  return { proposed: results, unconfirmed };
}

interface SourcePlan {
  labelVariable: string;   // canonical conn:var to GET for the display name
  fallbackName: string;    // if label probe fails
  pvwVariable: string;
  pgmVariable: string;
  pvwMatchValue: string;
  pgmMatchValue: string;
}

function buildPlan(req: AutoPopulateRequest): SourcePlan[] {
  const conn = req.connection.trim();
  if (!conn) throw new Error('connection label is required');
  const count = clampInt(req.inputCount, 1, 128);

  switch (req.module) {
    case 'tsl': {
      const start = clampInt(req.tslStartAddress ?? 0, 0, 1024);
      const pvwBit = req.tslPvwBit ?? 1;
      const pgmBit = req.tslPgmBit ?? 2;
      const plans: SourcePlan[] = [];
      for (let i = 0; i < count; i++) {
        const addr = start + i;
        plans.push({
          labelVariable: `${conn}:tally_${addr}_label`,
          fallbackName: `Tally ${addr}`,
          // TSL listener exposes tally1..tally4 booleans per address;
          // pvw/pgm are aliases for tally1/tally2. We use the bit fields
          // directly so users with inverted conventions can set explicitly.
          pvwVariable: `${conn}:tally_${addr}_tally${pvwBit}`,
          pgmVariable: `${conn}:tally_${addr}_tally${pgmBit}`,
          pvwMatchValue: '',   // truthy mode - "True" / "False"
          pgmMatchValue: ''
        });
      }
      return plans;
    }

    case 'vmix': {
      const mix = clampInt(req.vmixMix ?? 1, 1, 32);
      const plans: SourcePlan[] = [];
      for (let n = 1; n <= count; n++) {
        plans.push({
          labelVariable: `${conn}:input_${n}_name`,
          fallbackName: `Input ${n}`,
          pvwVariable: `${conn}:input_${n}_mix_${mix}_tally_preview`,
          pgmVariable: `${conn}:input_${n}_mix_${mix}_tally_program`,
          pvwMatchValue: '',   // truthy mode - "true" / "false"
          pgmMatchValue: ''
        });
      }
      return plans;
    }

    case 'atem': {
      const me = clampInt(req.atemME ?? 1, 1, 4);
      const startInput = clampInt(req.atemStartInput ?? 1, 1, 999);
      const plans: SourcePlan[] = [];
      for (let i = 0; i < count; i++) {
        const inputN = startInput + i;
        // ATEM module exposes per-input labels as `long_<id>` (the long
        // input name) and `short_<id>` (4-char). We probe long_<N> as
        // the friendliest source name; on miss, fall back to "Input N".
        plans.push({
          labelVariable: `${conn}:long_${inputN}`,
          fallbackName: `Input ${inputN}`,
          pvwVariable: `${conn}:pvw${me}_input_id`,
          pgmVariable: `${conn}:pgm${me}_input_id`,
          pvwMatchValue: String(inputN),   // ATEM-style: equals N
          pgmMatchValue: String(inputN)
        });
      }
      return plans;
    }

    default:
      throw new Error(`unknown module type: ${req.module}`);
  }
}

/**
 * Fetch a single Companion variable. Returns its text value, or null on
 * any non-200 / error. Empty string is treated as "no value" → null,
 * because TSL listener returns empty for addresses that haven't sent data
 * yet and ATEM returns empty for unused input slots.
 */
async function probeLabel(base: string, id: string): Promise<string | null> {
  const colon = id.indexOf(':');
  if (colon < 0) return null;
  const conn = id.slice(0, colon);
  const name = id.slice(colon + 1);
  const url = conn === 'custom'
    ? `${base}/api/custom-variable/${encodeURIComponent(name)}/value`
    : `${base}/api/variable/${encodeURIComponent(conn)}/${encodeURIComponent(name)}/value`;
  try {
    const { statusCode, body } = await request(url, {
      method: 'GET',
      headersTimeout: PROBE_TIMEOUT_MS,
      bodyTimeout: PROBE_TIMEOUT_MS
    });
    if (statusCode !== 200) {
      await body.dump();
      return null;
    }
    const text = (await body.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
