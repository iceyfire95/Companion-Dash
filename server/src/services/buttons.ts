import { request } from 'undici';
import type { ButtonAction, ButtonConfig } from '../types.js';
import { getCompanionConfig } from '../db/index.js';

/**
 * Sends a press to a Companion button (down + up). Returns true on success.
 *
 * Companion HTTP API:
 *   POST /api/location/<page>/<row>/<column>/press
 * Returns 200 on success.
 */
export async function fireCompanionAction(a: ButtonAction): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = getCompanionConfig();
  if (!cfg.enabled) return { ok: false, error: 'Companion polling/triggering is disabled in settings' };
  const url = `http://${cfg.host}:${cfg.port}/api/location/${a.page}/${a.row}/${a.column}/press`;
  try {
    const { statusCode, body } = await request(url, {
      method: 'POST',
      headersTimeout: 3000,
      bodyTimeout: 3000
    });
    await body.dump();
    if (statusCode === 200 || statusCode === 204) return { ok: true };
    return { ok: false, error: `Companion returned HTTP ${statusCode}` };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'request failed' };
  }
}

/**
 * In-memory toggle step state. Keyed by `${panelId}:${cellId | 'panel'}` so
 * each button binding has its own cycle counter. Server-side restart resets
 * to step 0 — fine for v1.
 */
const toggleStepIndex = new Map<string, number>();

function toggleKey(panelId: string, cellId: string | null): string {
  return `${panelId}:${cellId ?? 'panel'}`;
}

export function getToggleStep(panelId: string, cellId: string | null): number {
  return toggleStepIndex.get(toggleKey(panelId, cellId)) ?? 0;
}

/**
 * Trigger the next action for a button binding.
 * - 'press' mode: fires the single configured action.
 * - 'toggle' mode: fires the action at current step index, then advances
 *   (wrap-around).
 */
export async function triggerButton(
  panelId: string,
  cellId: string | null,
  cfg: ButtonConfig
): Promise<{ ok: boolean; error?: string; firedAction?: ButtonAction; nextStep?: number }> {
  if (!cfg.enabled) return { ok: false, error: 'button not enabled' };
  if (cfg.mode === 'press') {
    if (!cfg.press) return { ok: false, error: 'no action configured' };
    const r = await fireCompanionAction(cfg.press);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, firedAction: cfg.press };
  }
  // toggle
  if (cfg.toggleSteps.length === 0) return { ok: false, error: 'no toggle steps configured' };
  const key = toggleKey(panelId, cellId);
  const idx = toggleStepIndex.get(key) ?? 0;
  const action = cfg.toggleSteps[idx % cfg.toggleSteps.length];
  const next = (idx + 1) % cfg.toggleSteps.length;
  const r = await fireCompanionAction(action);
  if (!r.ok) return { ok: false, error: r.error };
  // Only advance step on success, so retries don't skip steps.
  toggleStepIndex.set(key, next);
  return { ok: true, firedAction: action, nextStep: next };
}

/** Clear step state when a button binding changes or panel is deleted. */
export function clearToggleState(panelId: string, cellId?: string | null) {
  if (cellId === undefined) {
    // clear all entries for this panel
    for (const k of [...toggleStepIndex.keys()]) {
      if (k.startsWith(`${panelId}:`)) toggleStepIndex.delete(k);
    }
  } else {
    toggleStepIndex.delete(toggleKey(panelId, cellId));
  }
}
