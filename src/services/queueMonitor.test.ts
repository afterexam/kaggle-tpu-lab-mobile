import { describe, it, expect } from 'vitest';
import {
  startQueueMonitoring,
  stopQueueMonitoring,
  isValidMonitorTopic,
} from './queueMonitor';

describe('isValidMonitorTopic', () => {
  it('accepts real topic ids', () => {
    expect(isValidMonitorTopic('ktl-a1b2c3d4e5f60718')).toBe(true);
    expect(isValidMonitorTopic('ktl_ABC-123')).toBe(true);
  });

  it('rejects empty, overlong and hostile input', () => {
    expect(isValidMonitorTopic('')).toBe(false);
    expect(isValidMonitorTopic('a'.repeat(65))).toBe(false);
    expect(isValidMonitorTopic('ktl-abc/def')).toBe(false);
    expect(isValidMonitorTopic('ktl-abc?since=1')).toBe(false);
    expect(isValidMonitorTopic('https://ntfy.sh/ktl-abc')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidMonitorTopic(null)).toBe(false);
    expect(isValidMonitorTopic(undefined)).toBe(false);
    expect(isValidMonitorTopic(123)).toBe(false);
    expect(isValidMonitorTopic({})).toBe(false);
  });
});

describe('queueMonitor on web (node)', () => {
  it('start/stop are silent no-ops without a native platform', async () => {
    // Capacitor.isNativePlatform() is false under vitest/node, so the
    // wrapper must resolve without touching any plugin.
    await expect(startQueueMonitoring('ktl-a1b2c3d4e5f60718')).resolves.toBeUndefined();
    await expect(stopQueueMonitoring('ktl-a1b2c3d4e5f60718')).resolves.toBeUndefined();
    await expect(stopQueueMonitoring()).resolves.toBeUndefined();
  });

  it('still validates the topic even when native is absent', async () => {
    await expect(startQueueMonitoring('')).rejects.toThrow(/Invalid ntfy topic/);
    await expect(startQueueMonitoring('not a topic!')).rejects.toThrow(/Invalid ntfy topic/);
    await expect(stopQueueMonitoring('')).rejects.toThrow(/Invalid ntfy topic/);
  });
});
