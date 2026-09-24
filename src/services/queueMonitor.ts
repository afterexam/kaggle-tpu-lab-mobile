import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * TS wrapper for the local native {@code QueueMonitor} plugin
 * (android/.../QueueMonitorPlugin.java).
 *
 * The plugin drives a foreground Service that holds one ntfy.sh SSE stream
 * per queued TPU topic while the app is backgrounded, and fires a
 * high-priority notification on ready/serving. The WebView JS polling loop
 * (NtfyListener) cannot do this: Android suspends it via Doze / App Standby.
 *
 * On web (or when the plugin is absent) every call is a silent no-op so the
 * same code path runs in all environments.
 */

export interface QueueMonitorPlugin {
  startMonitoring(options: { topic: string }): Promise<void>;
  stopMonitoring(options?: { topic?: string }): Promise<void>;
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  requestBatteryOptimizationExemption(): Promise<void>;
}

const NativeQueueMonitor: QueueMonitorPlugin | null = Capacitor.isNativePlatform()
  ? registerPlugin<QueueMonitorPlugin>('QueueMonitor')
  : null;

const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** ntfy topic guard — mirrors the native-side validation. */
export function isValidMonitorTopic(topic: unknown): topic is string {
  return typeof topic === 'string' && TOPIC_RE.test(topic);
}

/** Hand a topic to the native background monitor. No-op on web. */
export async function startQueueMonitoring(topic: string): Promise<void> {
  if (!isValidMonitorTopic(topic)) throw new Error(`Invalid ntfy topic: ${topic}`);
  if (!NativeQueueMonitor) return;
  await NativeQueueMonitor.startMonitoring({ topic });
}

/**
 * Stop monitoring one topic, or every topic when omitted. No-op on web.
 */
export async function stopQueueMonitoring(topic?: string): Promise<void> {
  if (topic !== undefined && !isValidMonitorTopic(topic)) {
    throw new Error(`Invalid ntfy topic: ${topic}`);
  }
  if (!NativeQueueMonitor) return;
  await NativeQueueMonitor.stopMonitoring(topic === undefined ? {} : { topic });
}

/**
 * Whether the app is exempt from battery optimizations. Doze suspends network
 * for non-exempt apps, which silently kills the background SSE stream — this
 * is the single most important setting for reliable background alerts.
 */
export async function isBatteryOptimizationIgnored(): Promise<boolean> {
  if (!NativeQueueMonitor) return false;
  const res = await NativeQueueMonitor.isIgnoringBatteryOptimizations();
  return !!res.ignoring;
}

/** Opens the system dialog requesting the battery-optimization exemption. */
export async function requestBatteryOptimizationExemption(): Promise<void> {
  if (!NativeQueueMonitor) return;
  await NativeQueueMonitor.requestBatteryOptimizationExemption();
}
