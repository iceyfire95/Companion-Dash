import { EventEmitter } from 'events';
import { request } from 'undici';
import type { CompanionConfig } from '../types.js';
import { getCompanionConfig } from '../db/index.js';

/**
 * CompanionPoller
 *
 * Tracks the set of variables referenced by panels and polls Companion
 * for each one at the configured interval. Emits 'change' when a value
 * differs from the cached value.
 *
 * Variable identifier format: "<connectionLabel>:<varName>"
 *   - "custom:foo"        -> GET /api/custom-variable/foo/value
 *   - "atem:pgm1_input"   -> GET /api/variable/atem/pgm1_input/value
 *
 * Companion HTTP API ref:
 *   GET /api/variable/<connectionLabel>/<name>/value
 *   GET /api/custom-variable/<name>/value
 * (returns the value as text/plain)
 */
export class CompanionPoller extends EventEmitter {
  private cfg: CompanionConfig;
  private wanted = new Set<string>();          // variable ids currently in use
  private values = new Map<string, string>();  // last known value per id
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  // Status tracking
  private lastPollAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;
  private successInLastPoll = 0;
  private failInLastPoll = 0;

  constructor() {
    super();
    this.cfg = getCompanionConfig();
  }

  /** Snapshot of current poller status, used by the /status endpoint. */
  getStatus() {
    const wantedCount = this.wanted.size;
    const knownCount = this.values.size;
    const enabled = this.cfg.enabled;
    // "connected" means: enabled, AND last poll either had no work or had
    // at least one successful fetch in the most recent cycle. If everything
    // failed in the last cycle we treat as not connected.
    let connected = false;
    if (enabled) {
      if (wantedCount === 0) {
        // Nothing to poll — treat as connected if we never errored, else not.
        connected = this.lastError === null;
      } else {
        connected = this.successInLastPoll > 0;
      }
    }
    return {
      enabled,
      connected,
      host: this.cfg.host,
      port: this.cfg.port,
      pollIntervalMs: this.cfg.pollIntervalMs,
      wantedCount,
      knownCount,
      lastPollAt: this.lastPollAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      successInLastPoll: this.successInLastPoll,
      failInLastPoll: this.failInLastPoll
    };
  }

  setConfig(cfg: CompanionConfig): void {
    const restartNeeded =
      cfg.host !== this.cfg.host ||
      cfg.port !== this.cfg.port ||
      cfg.pollIntervalMs !== this.cfg.pollIntervalMs ||
      cfg.enabled !== this.cfg.enabled;
    this.cfg = cfg;
    if (restartNeeded) this.restart();
  }

  /** Replace the set of variables to poll. */
  setWantedVariables(vars: Iterable<string>): void {
    const next = new Set<string>();
    for (const v of vars) if (v) next.add(v);
    this.wanted = next;
    // Drop cached values for variables no longer wanted
    for (const k of [...this.values.keys()]) {
      if (!next.has(k)) this.values.delete(k);
    }
  }

  getAll(): Record<string, string> {
    return Object.fromEntries(this.values);
  }

  start(): void {
    if (this.timer) return;
    if (!this.cfg.enabled) return;
    const tick = async () => {
      if (!this.inFlight) {
        this.inFlight = true;
        try { await this.pollOnce(); } finally { this.inFlight = false; }
      }
    };
    this.timer = setInterval(tick, Math.max(50, this.cfg.pollIntervalMs));
    void tick(); // immediate
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  restart(): void {
    this.stop();
    this.start();
  }

  private async pollOnce(): Promise<void> {
    this.lastPollAt = Date.now();
    this.successInLastPoll = 0;
    this.failInLastPoll = 0;
    if (this.wanted.size === 0) {
      // No variables to poll. Do a single dummy probe to keep status fresh.
      try {
        const probeUrl = `http://${this.cfg.host}:${this.cfg.port}/api/version`;
        const { statusCode, body } = await request(probeUrl, {
          method: 'GET', headersTimeout: 2000, bodyTimeout: 2000
        });
        await body.dump();
        if (statusCode === 200 || statusCode === 404) {
          // Either endpoint exists (200) or Companion is up but the path
          // didn't match (404). Both = host reachable = "connected".
          this.lastError = null;
          this.lastSuccessAt = Date.now();
        } else {
          this.lastError = `probe returned ${statusCode}`;
        }
      } catch (e) {
        this.lastError = (e as Error)?.message || 'probe failed';
      }
      return;
    }
    // Parallelise but cap concurrency so we don't blast Companion
    const ids = [...this.wanted];
    const CONCURRENCY = 16;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const chunk = ids.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(id => this.fetchOne(id)));
    }
    if (this.successInLastPoll > 0) {
      this.lastSuccessAt = Date.now();
      this.lastError = null;
    }
  }

  private async fetchOne(id: string): Promise<void> {
    const url = this.buildUrl(id);
    if (!url) return;
    try {
      const { statusCode, body } = await request(url, {
        method: 'GET',
        headersTimeout: 2000,
        bodyTimeout: 2000
      });
      if (statusCode !== 200) {
        await body.dump();
        this.failInLastPoll++;
        this.lastError = `HTTP ${statusCode} for ${id}`;
        return;
      }
      const text = await body.text();
      this.successInLastPoll++;
      const prev = this.values.get(id);
      if (prev !== text) {
        this.values.set(id, text);
        this.emit('change', { id, value: text });
      }
    } catch (e) {
      this.failInLastPoll++;
      this.lastError = (e as Error)?.message || 'request failed';
    }
  }

  private buildUrl(id: string): string | null {
    const colon = id.indexOf(':');
    if (colon < 0) return null;
    const conn = id.slice(0, colon);
    const name = id.slice(colon + 1);
    if (!conn || !name) return null;
    const base = `http://${this.cfg.host}:${this.cfg.port}`;
    if (conn === 'custom') {
      return `${base}/api/custom-variable/${encodeURIComponent(name)}/value`;
    }
    return `${base}/api/variable/${encodeURIComponent(conn)}/${encodeURIComponent(name)}/value`;
  }
}

export const poller = new CompanionPoller();
