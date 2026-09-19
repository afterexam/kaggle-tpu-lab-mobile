import { describe, it, expect } from 'vitest';
import { getServedModelName } from './types';

describe('getServedModelName', () => {
  it('returns the default when empty', () => {
    expect(getServedModelName()).toBe('qwen3.8-27b');
    expect(getServedModelName('')).toBe('qwen3.8-27b');
  });

  it('normalizes qwen recipe spellings', () => {
    expect(getServedModelName('qwen38-27b')).toBe('qwen3.8-27b');
    expect(getServedModelName('QWEN3.8-27B')).toBe('qwen3.8-27b');
    expect(getServedModelName('qwen3-8b')).toBe('qwen3.8-27b');
  });

  it('normalizes glm recipe spellings', () => {
    expect(getServedModelName('glm53-flash')).toBe('glm-5.3-flash');
    expect(getServedModelName('GLM-5.3-Flash')).toBe('glm-5.3-flash');
  });

  it('passes unknown names through untouched', () => {
    expect(getServedModelName('my-custom-model')).toBe('my-custom-model');
  });
});
