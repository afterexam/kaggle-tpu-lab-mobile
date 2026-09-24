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
  it('set() writes the durability anchor first, then mirrors into secure', async () => {
    const secure = new MemoryBackend();
    const legacy = new MemoryBackend();
    const store = createSecretStore(secure, legacy);

    await store.set('ktl_accounts', '[{"token":"KGAT_secret"}]');

    // Legacy is the durability anchor: always written. Secure is a mirror.
    expect(legacy.store.get('ktl_accounts')).toBe('[{"token":"KGAT_secret"}]');
    expect(secure.store.get('ktl_accounts')).toBe('[{"token":"KGAT_secret"}]');
  });

  it('set() never rejects when the secure backend throws (save must succeed)', async () => {
    const broken: KeyValueBackend = {
      get: async () => { throw new Error('no keystore'); },
      set: async () => { throw new Error('no keystore'); },
      remove: async () => { throw new Error('no keystore'); },
    };
    const legacy = new MemoryBackend();
    const store = createSecretStore(broken, legacy);

    await expect(store.set('ktl_accounts', 'v')).resolves.toBeUndefined();
    expect(legacy.store.get('ktl_accounts')).toBe('v');
  });

  it('get() serves the legacy anchor when the secure copy disagrees', async () => {
    // A secure backend stuck on a stale value (e.g. writes stopped sticking
    // after an earlier success): the anchor holds the fresher value and the
    // reconcile must not wipe it.
    const staleSecure: KeyValueBackend = {
      get: async () => 'stale-secure',
      set: async () => {},
      remove: async () => {},
    };
    const legacy = new MemoryBackend();
    await legacy.set('ktl_accounts', 'fresh-anchor');
    const store = createSecretStore(staleSecure, legacy);

    expect(await store.get('ktl_accounts')).toBe('fresh-anchor');
    // Disagreement means secure is unreliable: the anchor must be kept.
    expect(legacy.store.get('ktl_accounts')).toBe('fresh-anchor');
  });

  it('migrates legacy plaintext into the secure backend at boot and wipes it once proven', async () => {
    const secure = new MemoryBackend();
    const legacy = new MemoryBackend();
    await legacy.set('ktl_sessions', '[{"apiKey":"sk-secret"}]');
    const store = createSecretStore(secure, legacy);

    const value = await store.get('ktl_sessions');

    expect(value).toBe('[{"apiKey":"sk-secret"}]');
    expect(secure.store.get('ktl_sessions')).toBe('[{"apiKey":"sk-secret"}]');
    // Plaintext copy wiped only after the secure copy proved itself.
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
    // Simulates the real-world failure: writes resolve but nothing survives
    // (silent loss, no throw) — the exact v1.1.2 data-loss report.
    const lossyPrimary = (): KeyValueBackend => ({
      get: async () => null,
      set: async () => {},
      remove: async () => {},
    });
    // A "restart" is a new store over the same backend instances: the lossy
    // secure backend drops everything, the legacy anchor persists.
    const restart = (secure: KeyValueBackend, legacy: KeyValueBackend) =>
      createSecretStore(secure, legacy);

    it('migrateLegacy() keeps the legacy copy when the Keystore throws', async () => {
      const legacy = new MemoryBackend();
      await legacy.set('ktl_accounts', '[{"token":"KGAT_secret"}]');
      const store = createSecretStore(brokenPrimary(), legacy);

      await store.migrateLegacy();

      // The only copy must survive; the app keeps working on plaintext.
      expect(legacy.store.get('ktl_accounts')).toBe('[{"token":"KGAT_secret"}]');
      expect(await store.get('ktl_accounts')).toBe('[{"token":"KGAT_secret"}]');
    });

    it('get() keeps serving the legacy copy when the Keystore throws', async () => {
      const legacy = new MemoryBackend();
      await legacy.set('ktl_sessions', '[{"apiKey":"sk-secret"}]');
      const store = createSecretStore(brokenPrimary(), legacy);

      const value = await store.get('ktl_sessions');

      expect(value).toBe('[{"apiKey":"sk-secret"}]');
      expect(legacy.store.has('ktl_sessions')).toBe(true);
      // Still there on the next read (restart).
      expect(await restart(brokenPrimary(), legacy).get('ktl_sessions')).toBe(
        '[{"apiKey":"sk-secret"}]',
      );
    });

    it('does not wipe legacy when the secure write does not stick (silent loss)', async () => {
      const legacy = new MemoryBackend();
      await legacy.set('ktl_accounts', 'v');
      const store = createSecretStore(lossyPrimary(), legacy);

      await store.migrateLegacy();

      expect(legacy.store.get('ktl_accounts')).toBe('v');
    });

    it('set() then restart: data survives a secure backend that silently loses writes', async () => {
      // This is the reported v1.1.2 bug: save resolved, reopen showed empty.
      const lossy = lossyPrimary();
      const legacy = new MemoryBackend();
      const store = createSecretStore(lossy, legacy);

      await store.set('ktl_accounts', '[{"user":"retgry"}]');

      const afterRestart = restart(lossy, legacy);
      expect(await afterRestart.get('ktl_accounts')).toBe('[{"user":"retgry"}]');
      expect(legacy.store.get('ktl_accounts')).toBe('[{"user":"retgry"}]');
    });

    it('set() then restart: data survives a secure backend that throws', async () => {
      const broken = brokenPrimary();
      const legacy = new MemoryBackend();
      const store = createSecretStore(broken, legacy);

      await store.set('ktl_accounts', '[{"user":"retgry"}]');

      const afterRestart = restart(broken, legacy);
      expect(await afterRestart.get('ktl_accounts')).toBe('[{"user":"retgry"}]');
    });

    it('converges to secure-only on a healthy device across restarts', async () => {
      const secure = new MemoryBackend();
      const legacy = new MemoryBackend();
      const store = createSecretStore(secure, legacy);

      await store.set('ktl_accounts', 'v');
      // Plaintext anchor present until the secure copy proves itself.
      expect(legacy.store.has('ktl_accounts')).toBe(true);

      const afterRestart = restart(secure, legacy);
      expect(await afterRestart.get('ktl_accounts')).toBe('v');
      // Secure copy matched the anchor across the restart: wiped.
      expect(legacy.store.has('ktl_accounts')).toBe(false);
      expect(secure.store.get('ktl_accounts')).toBe('v');
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
