import { describe, it, expect } from 'vitest';
import { formatEndpointConfig } from './clipboard';
import { LiveEndpoint } from './types';

const endpoint: LiveEndpoint = {
  accountId: 'acc-1',
  accountName: 'Primary Account',
  baseUrl: 'https://example.trycloudflare.com/v1',
  apiKey: 'sk-testkey123',
  model: 'qwen38-27b',
  status: 'READY',
};

describe('formatEndpointConfig', () => {
  it('pair format lists URL, key and normalized model', () => {
    const out = formatEndpointConfig(endpoint, 'pair');
    expect(out).toContain('Base URL: https://example.trycloudflare.com/v1');
    expect(out).toContain('API Key: sk-testkey123');
    expect(out).toContain('Model: qwen3.8-27b');
  });

  it('env format emits shell exports', () => {
    const out = formatEndpointConfig(endpoint, 'env');
    expect(out).toContain('OPENAI_BASE_URL="https://example.trycloudflare.com/v1"');
    expect(out).toContain('OPENAI_API_KEY="sk-testkey123"');
    expect(out).toContain('OPENAI_MODEL_NAME="qwen3.8-27b"');
  });

  it('curl format is a runnable chat-completions call', () => {
    const out = formatEndpointConfig(endpoint, 'curl');
    expect(out).toContain('curl https://example.trycloudflare.com/v1/chat/completions');
    expect(out).toContain('-H "Authorization: Bearer sk-testkey123"');
    expect(out).toContain('"model": "qwen3.8-27b"');
  });

  it('url/key formats return the raw values', () => {
    expect(formatEndpointConfig(endpoint, 'url')).toBe('https://example.trycloudflare.com/v1');
    expect(formatEndpointConfig(endpoint, 'key')).toBe('sk-testkey123');
  });

  it('trims surrounding whitespace', () => {
    const messy: LiveEndpoint = {
      ...endpoint,
      baseUrl: '  https://example.trycloudflare.com/v1  ',
      apiKey: '\nsk-testkey123\n',
    };
    expect(formatEndpointConfig(messy, 'url')).toBe('https://example.trycloudflare.com/v1');
    expect(formatEndpointConfig(messy, 'key')).toBe('sk-testkey123');
  });
});
