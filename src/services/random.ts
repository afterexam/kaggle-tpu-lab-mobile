/**
 * Cryptographically secure random helpers.
 *
 * Replaces `Math.random()` for anything secret-adjacent (ntfy topics, API
 * keys). `Math.random()` is a deterministic PRNG and must never be used to
 * generate credentials.
 */

/** Return `bytes` cryptographically random bytes rendered as lowercase hex. */
export function randomHex(bytes: number): string {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(`randomHex: bytes must be a positive integer, got ${bytes}`);
  }
  const g = globalThis.crypto;
  if (!g || typeof g.getRandomValues !== 'function') {
    throw new Error('randomHex: crypto.getRandomValues is unavailable in this environment');
  }
  const buf = new Uint8Array(bytes);
  g.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Random ntfy topic id, e.g. `ktl-9f2ac41b77e0d3f8` (16 hex chars). */
export function randomTopicId(): string {
  return 'ktl-' + randomHex(8);
}

/** Random kernel API key, e.g. `sk-…` / `glm-…` + 32 hex chars. */
export function randomApiKey(prefix: string): string {
  return prefix + randomHex(16);
}
