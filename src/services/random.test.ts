import { describe, it, expect } from 'vitest';
import { randomHex, randomTopicId, randomApiKey } from './random';

describe('randomHex', () => {
  it('returns the requested byte count as lowercase hex', () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(randomHex(8)).toMatch(/^[0-9a-f]{16}$/);
    expect(randomHex(1)).toMatch(/^[0-9a-f]{2}$/);
  });

  it('produces unique values across many calls', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => randomHex(16)));
    expect(seen.size).toBe(1000);
  });

  it('rejects invalid byte counts', () => {
    expect(() => randomHex(0)).toThrow();
    expect(() => randomHex(-3)).toThrow();
    expect(() => randomHex(1.5)).toThrow();
  });

  it('has a roughly uniform nibble distribution (sanity, wide margins)', () => {
    const hex = randomHex(2048); // 4096 nibbles, ~256 expected each
    const counts = new Array(16).fill(0);
    for (const c of hex) counts[parseInt(c, 16)]++;
    for (const n of counts) {
      expect(n).toBeGreaterThan(150);
      expect(n).toBeLessThan(362);
    }
  });
});

describe('randomTopicId / randomApiKey', () => {
  it('matches the legacy output shapes', () => {
    expect(randomTopicId()).toMatch(/^ktl-[0-9a-f]{16}$/);
    expect(randomApiKey('sk-')).toMatch(/^sk-[0-9a-f]{32}$/);
    expect(randomApiKey('glm-')).toMatch(/^glm-[0-9a-f]{32}$/);
  });

  it('is unique per call', () => {
    expect(randomTopicId()).not.toBe(randomTopicId());
    expect(randomApiKey('sk-')).not.toBe(randomApiKey('sk-'));
  });
});
