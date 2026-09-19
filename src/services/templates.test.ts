import { describe, it, expect } from 'vitest';
import { formatPythonValue, prepareKernel } from './templates';
import { LaunchConfig } from './types';

const config: LaunchConfig = {
  model: 'qwen38-27b',
  reasoningEffort: 'medium',
  maxModelLen: 8192,
  maxNumSeqs: 4,
  mtpTokens: 3,
  streams: 1,
  keepaliveMin: 480,
  textOnly: false,
  fastStart: true,
};

describe('formatPythonValue', () => {
  it('renders primitives as Python literals', () => {
    expect(formatPythonValue(null)).toBe('None');
    expect(formatPythonValue(undefined)).toBe('None');
    expect(formatPythonValue(true)).toBe('True');
    expect(formatPythonValue(false)).toBe('False');
    expect(formatPythonValue(42)).toBe('42');
    expect(formatPythonValue(3.5)).toBe('3.5');
    expect(formatPythonValue('hello')).toBe('"hello"');
  });

  it('escapes double quotes inside strings', () => {
    expect(formatPythonValue('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('renders nested arrays and dicts', () => {
    expect(formatPythonValue([1, 'a', null, true])).toBe('[1, "a", None, True]');
    expect(formatPythonValue({ a: 1, b: 'x' })).toBe('{"a": 1, "b": "x"}');
  });
});

describe('prepareKernel', () => {
  it('replaces every placeholder and embeds the launcher config', () => {
    const { code, slug, topic, apiKey, datasets } = prepareKernel(
      'qwen38-27b',
      config,
      'ktl-abc123',
      'sk-testkey',
    );

    expect(slug).toBe('qwen38-tpu-serve');
    expect(topic).toBe('ktl-abc123');
    expect(apiKey).toBe('sk-testkey');
    expect(datasets.length).toBeGreaterThan(0);
    expect(code).not.toContain('__LAUNCHER_CONFIG__');
    expect(code).not.toContain('__KAGGLE_USERNAME__');
    expect(code).not.toContain('__MODEL__');
    // The embedded config must carry topic + apiKey as Python literals.
    expect(code).toContain('"ntfy_topic": "ktl-abc123"');
    expect(code).toContain('"api_key": "sk-testkey"');
    expect(code).toContain('"keepalive_min": 480');
  });

  it('builds the GLM recipe with its own slug', () => {
    const { code, slug } = prepareKernel('glm53-flash', config, 'ktl-x', 'glm-y');

    expect(slug).toBe('glm53-tpu-serve');
    expect(code).not.toContain('__LAUNCHER_CONFIG__');
    expect(code).toContain('"ntfy_topic": "ktl-x"');
    expect(code).toContain('"api_key": "glm-y"');
  });

  it('embeds reasoning effort mapping for GLM', () => {
    const { code } = prepareKernel(
      'glm53-flash',
      { ...config, reasoningEffort: 'high' },
      'ktl-x',
      'glm-y',
    );
    expect(code).toContain('"reasoning_effort_default": "high"');
  });
});
