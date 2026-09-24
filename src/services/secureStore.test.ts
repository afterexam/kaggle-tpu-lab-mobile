import { describe, it, expect, vi } from 'vitest';
import {
  createSecretStore,
  FallbackBackend,
  KeyValueBackend,
  SECRET_KEYS,
} from './secureStore';

/** In-memory stand-in for Keystore / Preferences backends. */
class MemoryBackend implements KeyValueBackend {
  readonly store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe('createSecretStore', () => {
  it('writes secrets to the secure backend only', async () => {
    const secure = new MemoryBackend();
    const legacy = new MemoryBackend();
    const store = createSecretStore(secure, legacy);

    await store.set('ktl_accounts', '[{"token":"KGAT_secret"}]');

    expect(secure.store.get('ktl_accounts')).toBe('[{"token":"KGAT_secret"}]');
    expect(legacy.store.has('ktl_accounts')).toBe(false);
  });

  it('reads from the secure backend when present', async () => {
    const secure = new MemoryBackend();
    const legacy = new MemoryBackend();
    await secure.set('ktl_accounts', 'secure-value');
    await legacy.set('ktl_accounts', 'stale-plaintext');
    const store = createSecretStore(secure, legacy);

    expect(await store.get('ktl_accounts')).toBe('secure-value');
  });

  it('lazily migrates legacy plaintext into the secure backend on first read', async () => {
    const secure = new MemoryBackend();
    const legacy = new MemoryBackend();
    await legacy.set('ktl_sessions', '[{"apiKey":"sk-secret"}]');
    const store = createSecretStore(secure, legacy);

    const value = await store.get('ktl_sessions');

    expect(value).toBe('[{"apiKey":"sk-secret"}]');
    expect(secure.store.get('ktl_sessions')).toBe('[{"apiKey":"sk-secret"}]');
    // Plaintext copy must be wiped after migration.
    expect(legacy.store.has('ktl_sessions')).toBe(false);
  });

  it('returns null when neither backend has the key', async () => {
    const store = createSecretStore(new MemoryBackend(), new MemoryBackend());
    expect(await store.get('ktl_accounts')).toBeNull();
  });

  it('remove() clears both backends', async () => {
    const secure = new MemoryBackend();
    const legacy = new MemoryBackend();
    await secure.set('ktl_accounts', 'v');
    await legacy.set('ktl_accounts', 'stale');
    const store = createSecretStore(secure, legacy);

    await store.remove('ktl_accounts');

    expect(secure.store.has('ktl_accounts')).toBe(false);
    expect(legacy.store.has('ktl_accounts')).toBe(false);
  });

  it('migrateLegacy() moves every known secret key and wipes plaintext', async () => {
    const secure = new MemoryBackend();
    const legacy = new MemoryBackend();
    for (const k of SECRET_KEYS) await legacy.set(k, `plain-${k}`);
    const store = createSecretStore(secure, legacy);

    await store.migrateLegacy();

    for (const k of SECRET_KEYS) {
      expect(secure.store.get(k)).toBe(`plain-${k}`);
      expect(legacy.store.has(k)).toBe(false);
    }
  });

  it('migrateLegacy() is a no-op when secure and legacy are the same store', async () => {
    const backend = new MemoryBackend();
    await backend.set('ktl_accounts', 'v');
    const store = createSecretStore(backend, backend);

    await store.migrateLegacy();

    expect(backend.store.get('ktl_accounts')).toBe('v');
  });

  describe('broken secure backend (regression: must never destroy the only copy)', () => {
    const brokenPrimary = (): KeyValueBackend => ({
      get: async () => { throw new Error('no keystore'); },
      set: async () => { throw new Error('no keystore'); },
      remove: async () => { throw new Error('no keystore'); },
    });

    it('migrateLegacy() keeps the legacy copy when the Keystore is unavailable', async () => {
      const legacy = new MemoryBackend();
      await legacy.set('ktl_accounts', '[{"token":"KGAT_secret"}]');
      const store = createSecretStore(new FallbackBackend(brokenPrimary(), legacy), legacy);

      await store.migrateLegacy();

      // The only copy must survive; the app keeps working on plaintext.
      expect(legacy.store.get('ktl_accounts')).toBe('[{"token":"KGAT_secret"}]');
      expect(await store.get('ktl_accounts')).toBe('[{"token":"KGAT_secret"}]');
    });

    it('lazy get() migration keeps the legacy copy when the Keystore is unavailable', async () => {
      const legacy = new MemoryBackend();
      await legacy.set('ktl_sessions', '[{"apiKey":"sk-secret"}]');
      const store = createSecretStore(new FallbackBackend(brokenPrimary(), legacy), legacy);

      const value = await store.get('ktl_sessions');

      expect(value).toBe('[{"apiKey":"sk-secret"}]');
      expect(legacy.store.has('ktl_sessions')).toBe(true);
      // Still there on the next read (restart).
      expect(await store.get('ktl_sessions')).toBe('[{"apiKey":"sk-secret"}]');
    });

    it('does not wipe legacy when the secure write does not stick (read-back mismatch)', async () => {
      // Simulate a backend that accepts writes but loses them.
      const lossy: KeyValueBackend = {
        get: async () => null,
        set: async () => {},
        remove: async () => {},
      };
      const legacy = new MemoryBackend();
      await legacy.set('ktl_accounts', 'v');
      const store = createSecretStore(new FallbackBackend(lossy, legacy), legacy);

      await store.migrateLegacy();

      expect(legacy.store.get('ktl_accounts')).toBe('v');
    });
  });
});

describe('FallbackBackend', () => {
  it('falls back to plaintext when the secure backend throws, and warns once', async () => {
    // Fresh module instance: warnedInsecure is module-level, other tests may
    // have already triggered the one-time warning.
    vi.resetModules();
    const { FallbackBackend: FreshFallback } = await import('./secureStore');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: KeyValueBackend = {
      get: async () => { throw new Error('no keystore'); },
      set: async () => { throw new Error('no keystore'); },
      remove: async () => { throw new Error('no keystore'); },
    };
    const legacy = new MemoryBackend();
    await legacy.set('ktl_accounts', 'fallback-value');
    const backend = new FreshFallback(broken, legacy);

    expect(await backend.get('ktl_accounts')).toBe('fallback-value');
    await backend.set('ktl_accounts', 'new-value');
    expect(legacy.store.get('ktl_accounts')).toBe('new-value');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('prefers the primary backend when it works', async () => {
    const primary = new MemoryBackend();
    await primary.set('k', 'primary-value');
    const backend = new FallbackBackend(primary, new MemoryBackend());

    expect(await backend.get('k')).toBe('primary-value');
  });
});
