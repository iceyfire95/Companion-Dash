/**
 * Per-IP login attempt limiter. 4-digit PINs have only 10,000
 * possibilities — without a rate limit a scripted attacker brute-
 * forces in seconds. This caps each IP at 5 failed attempts per
 * 5-minute window; on the 6th failure within the window, all login
 * attempts from that IP are blocked until the window expires.
 *
 * State is in-memory only and resets on server restart. That's fine:
 * restarting doesn't help an attacker (they still need to start over),
 * and we don't want to persist this kind of transient state.
 *
 * The window slides per IP: each failure within an existing block
 * extends the unlock time. Successful login clears the IP's record.
 */

const WINDOW_MS = 5 * 60 * 1000;   // 5-minute window
const MAX_FAILURES = 5;

interface IpRecord {
  failures: number;
  /** Wall-clock ms at which this IP unlocks (or 0 if not locked). */
  lockedUntil: number;
  /** First failure in the current window - used to expire stale records. */
  firstFailureAt: number;
}

const records = new Map<string, IpRecord>();

export interface AttemptStatus {
  blocked: boolean;
  /** ms until block expires; 0 if not blocked. */
  retryInMs: number;
  /** How many failures left before lockout (only meaningful when not blocked). */
  remaining: number;
}

export function checkAttempt(ip: string): AttemptStatus {
  const now = Date.now();
  const rec = records.get(ip);
  if (!rec) return { blocked: false, retryInMs: 0, remaining: MAX_FAILURES };
  // If the window has fully elapsed since first failure AND we're not
  // currently locked, the record is stale - drop it.
  if (rec.lockedUntil === 0 && now - rec.firstFailureAt > WINDOW_MS) {
    records.delete(ip);
    return { blocked: false, retryInMs: 0, remaining: MAX_FAILURES };
  }
  if (rec.lockedUntil > now) {
    return { blocked: true, retryInMs: rec.lockedUntil - now, remaining: 0 };
  }
  return {
    blocked: false,
    retryInMs: 0,
    remaining: Math.max(0, MAX_FAILURES - rec.failures)
  };
}

export function recordFailure(ip: string): AttemptStatus {
  const now = Date.now();
  let rec = records.get(ip);
  if (!rec) {
    rec = { failures: 0, lockedUntil: 0, firstFailureAt: now };
    records.set(ip, rec);
  }
  rec.failures++;
  if (rec.failures >= MAX_FAILURES) {
    rec.lockedUntil = now + WINDOW_MS;
  }
  return checkAttempt(ip);
}

export function recordSuccess(ip: string): void {
  records.delete(ip);
}

/** Test helper - not exported through the route layer. */
export function _resetAttempts(): void {
  records.clear();
}
