/**
 * Encrypted credential storage.
 *
 * Secrets (Kaggle API tokens in `ktl_accounts`, kernel API keys in
 * `ktl_sessions`) used to live in Capacitor Preferences / localStorage as
 * plaintext. They now go through `secretStore`:
 *
 * - On native (Android/iOS): Android Keystore / iOS Keychain via
 *   `@aparajita/capacitor-secure-storage`, with automatic fallback to the
 *   legacy plaintext store if the plugin is unavailable (availability beats
 *   secrecy, and a warning is logged).
 * - On web: there is no Keystore; the legacy plaintext store is used.
 *   Documented limitation — the shipped app is native-only.
 *
 * Previously stored plaintext values are lazily migrated into the secure
 * backend on first read and wiped from the legacy store.
 */
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

/** Storage keys that hold secrets and must never be plaintext on native. */
export const SECRET_KEYS = ['ktl_accounts', 'ktl_sessions'] as const;

export interface KeyValueBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Pre-fix behavior: Capacitor Preferences, with a localStorage fallback.
 * Kept as the migration source and as the web / last-resort backend.
 */
export class LegacyPlaintextBackend implements KeyValueBackend {
  private get ls(): Storage | null {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  }

  async get(key: string): Promise<string | null> {
    try {
      const { value } = await Preferences.get({ key });
      if (value !== null && value !== undefined) return value;
    } catch {
      /* fall through to localStorage */
    }
    try {
      return this.ls?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await Preferences.set({ key, value });
    } catch {
      this.ls?.setItem(key, value);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await Preferences.remove({ key });
    } catch {
      /* ignore */
    }
    try {
      this.ls?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Native backend: Android Keystore / iOS Keychain.
 * Lazily imports the plugin so web/node bundles never pay for it.
 */
export class KeystoreBackend implements KeyValueBackend {
  private async plugin() {
    const mod = await import('@aparajita/capacitor-secure-storage');
    return mod.SecureStorage;
  }

  async get(key: string): Promise<string | null> {
    return (await this.plugin()).getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    await (await this.plugin()).setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    await (await this.plugin()).removeItem(key);
  }
}

let warnedInsecure = false;

/**
 * Tries the primary (secure) backend, falls back to the legacy plaintext
 * backend on error so the app keeps working even if the native plugin is
 * missing (e.g. `cap sync` not run). Logs a one-time warning.
 */
export class FallbackBackend implements KeyValueBackend {
  constructor(
    private primary: KeyValueBackend,
    private fallback: KeyValueBackend,
  ) {}

  private warnOnce() {
    if (!warnedInsecure) {
      warnedInsecure = true;
      console.warn(
        '[secureStore] secure backend unavailable — secrets stored in plaintext Preferences. Run `npx cap sync` and rebuild.',
      );
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.primary.get(key);
    } catch {
      this.warnOnce();
      return this.fallback.get(key);
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.primary.set(key, value);
    } catch {
      this.warnOnce();
      await this.fallback.set(key, value);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.primary.remove(key);
    } catch {
      /* ignore */
    }
    // Belt & braces: never leave a plaintext copy behind.
    await this.fallback.remove(key);
  }
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Eagerly move all known secret keys out of the legacy plaintext store. */
  migrateLegacy(): Promise<void>;
}

/**
 * Build a secret store from explicit backends (used by unit tests with
 * in-memory backends).
 */
export function createSecretStore(secure: KeyValueBackend, legacy: KeyValueBackend): SecretStore {
  const sameStore = secure === legacy;
  return {
    async get(key: string): Promise<string | null> {
      const v = await secure.get(key);
      if (v !== null && v !== undefined) return v;
      if (sameStore) return null;
      // Lazy migration: move the legacy plaintext value into the secure
      // backend on first read, then wipe the plaintext copy.
      const lv = await legacy.get(key);
      if (lv !== null && lv !== undefined) {
        await secure.set(key, lv);
        await legacy.remove(key);
        return lv;
      }
      return null;
    },
    async set(key: string, value: string): Promise<void> {
      await secure.set(key, value);
    },
    async remove(key: string): Promise<void> {
      await secure.remove(key);
      if (!sameStore) await legacy.remove(key);
    },
    async migrateLegacy(): Promise<void> {
      if (sameStore) return;
      for (const key of SECRET_KEYS) {
        const lv = await legacy.get(key);
        if (lv !== null && lv !== undefined) {
          await secure.set(key, lv);
          await legacy.remove(key);
        }
      }
    },
  };
}

const legacyBackend = new LegacyPlaintextBackend();

function resolveSecureBackend(): KeyValueBackend {
  if (Capacitor.isNativePlatform()) {
    return new FallbackBackend(new KeystoreBackend(), legacyBackend);
  }
  // Web: no Keystore exists; documented limitation (shipped app is native).
  return legacyBackend;
}

/** App-wide singleton. Secrets only — non-secret config stays in Preferences. */
export const secretStore: SecretStore = createSecretStore(resolveSecureBackend(), legacyBackend);
