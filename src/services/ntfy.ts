import { NtfyEvent } from './types';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export class NtfyListener {
  private topic: string;
  private since: number;
  private isPolling: boolean = false;
  private pollTimer: any = null;
  private onEventCb: (event: NtfyEvent, formattedText: string) => void;
  private seenIds: Set<string> = new Set();
  private hasNotifiedReady: boolean = false;

  constructor(
    topic: string,
    onEvent: (event: NtfyEvent, formattedText: string) => void,
    sinceSecondsAgo: number = 600
  ) {
    this.topic = topic;
    // Align with launch.py: only look back within last 10 min (600s) to prevent ghost ready events from old runs
    this.since = Math.floor(Date.now() / 1000) - sinceSecondsAgo;
    this.onEventCb = onEvent;
  }

  public async start(intervalMs: number = 4000) {
    if (this.isPolling) return;
    this.isPolling = true;
    this.hasNotifiedReady = false;

    // Request notification permissions on Android 13+
    if (Capacitor.isNativePlatform()) {
      try {
        await LocalNotifications.requestPermissions();
      } catch {
        // Permissions optional
      }
    }

    const loop = async () => {
      if (!this.isPolling) return;
      try {
        await this.pollOnce();
      } catch {
        // Safe loop
      }
      if (this.isPolling) {
        this.pollTimer = setTimeout(loop, intervalMs);
      }
    };

    loop();
  }

  public stop() {
    this.isPolling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async pollOnce(): Promise<NtfyEvent[]> {
    if (!this.isPolling) return [];

    const sinceParam = this.since > 100000000 ? String(this.since) : '24h';
    const url = `https://ntfy.sh/${this.topic}/json?poll=1&since=${sinceParam}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) return [];
      const text = await res.text();
      const lines = text.split('\n');
      const events: NtfyEvent[] = [];

      for (const line of lines) {
        if (!this.isPolling) break;
        if (!line.trim()) continue;

        try {
          const raw = JSON.parse(line);
          if (raw.event !== 'message' || !raw.message) continue;

          // 1. Message Deduplication by unique raw.id
          if (raw.id) {
            if (this.seenIds.has(raw.id)) continue;
            this.seenIds.add(raw.id);
            if (this.seenIds.size > 500) {
              const oldestId = this.seenIds.values().next().value;
              if (oldestId) this.seenIds.delete(oldestId);
            }
          }

          if (raw.time) {
            this.since = Math.max(this.since, raw.time);
          }

          const evData: NtfyEvent = JSON.parse(raw.message);
          evData.rawTime = raw.time;
          events.push(evData);

          const formatted = this.formatEvent(evData);
          this.onEventCb(evData, formatted);

          // 2. Notify once when ready or serving
          if (
            (evData.phase === 'ready' || evData.phase === 'serving') &&
            !this.hasNotifiedReady
          ) {
            this.hasNotifiedReady = true;
            this.notifyApp(
              '🎉 TPU Service Ready!',
              `Model ${evData.model || 'LLM'} is online. Tap to start chatting!`
            );
          }
        } catch {
          // ignore non-json messages
        }
      }
      return events;
    } catch {
      clearTimeout(timeoutId);
      return [];
    }
  }

  // ponytail: static lookup table cuts 40 lines of if-else branching
  private static readonly PHASE_MAP: Record<string, string> = {
    install: 'Building Python runtime with uv (~30s)...',
    installed: 'Python runtime and dependencies ready.',
    'mtp-patch-applied': 'MTP speculative decoding patch applied.',
    'mtp-patch-failed': 'MTP patch not applied, falling back to standard decoding.',
    'cache-missing': 'No compilation cache found, running cold compilation (+10~15min)...',
    'weights-mounted': 'Cloud model weights dataset mounted (no redownload needed).',
    'weights-download': 'Downloading model weights from Hugging Face (~5min)...',
    'weights-downloaded': 'Model weights downloaded.',
    'server-launch': 'Starting inference engine and loading 55GB+ weights...',
    loading: 'Loading model weights into TPU HBM memory (~9min)...',
    warmed: 'Computation graph warmup complete, establishing Cloudflare Tunnel...',
    'auto-shutdown': 'Max keepalive time reached, instance shut down cleanly.',
  };

  private formatEvent(ev: NtfyEvent): string {
    const p = ev.phase;
    if (NtfyListener.PHASE_MAP[p]) return NtfyListener.PHASE_MAP[p];
    if (p === 'cache-restored') {
      return (ev as any).covers_this_config === false
        ? 'Precompiled cache loaded, but cold compilation required for current config (+10min)...'
        : 'XLA precompiled cache restored (fast boot).';
    }
    if (p === 'loaded') return `Weights loaded in ${ev.minutes || '?'} min, starting warmup compilation...`;
    if (p === 'compiling') {
      return ev.what
        ? `Completed ${ev.what} compilation (${ev.secs || 0}s)`
        : `Compiling XLA graph... Elapsed: ${Math.floor((ev.elapsed_s || 0) / 60)} min`;
    }
    if (p === 'tunnel-url') return `Public endpoint allocated: ${ev.endpoint} (waiting for final readiness)`;
    if (p === 'serving' || p === 'ready') {
      return ev.endpoint ? `🎉 Service online! Endpoint: ${ev.endpoint}` : '🎉 Inference engine started! Binding endpoint...';
    }
    if (p === 'benchmark') return `Inference benchmark: ${ev.decode_tok_s} tok/s (single stream)`;
    if (p === 'heartbeat') return `Service alive (running ${ev.up_min || '?'} min)${ev.endpoint ? ` — ${ev.endpoint}` : ''}`;
    if (p === 'stopped' || p === 'failed') return `⚠️ Service stopped: ${ev.cause || ev.hint || 'Unknown cause'}`;

    return `[${p}] ${JSON.stringify(ev)}`;
  }

  private async notifyApp(title: string, body: string) {
    if (Capacitor.isNativePlatform()) {
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: Math.floor(Math.random() * 10000),
              schedule: { at: new Date(Date.now() + 100) },
              sound: 'default',
            },
          ],
        });
      } catch {
        // fallback
      }
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }
}
