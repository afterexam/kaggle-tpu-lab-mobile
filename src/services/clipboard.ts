import { Clipboard } from '@capacitor/clipboard';
import { LiveEndpoint, getServedModelName } from './types';

/**
 * Reliable cross-platform clipboard service (Supports Web, Capacitor Android native, and fallback)
 * 1. Capacitor native Clipboard plugin
 * 2. Web navigator.clipboard
 * 3. Fallback document.execCommand('copy')
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Prefer Capacitor native clipboard
  try {
    await Clipboard.write({ string: text });
    return true;
  } catch {}

  // 2. Web Clipboard API
  if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  // 3. Fallback: using hidden textarea with execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch {}

  return false;
}

export function formatEndpointConfig(
  endpoint: LiveEndpoint,
  format: 'pair' | 'env' | 'curl' | 'url' | 'key'
): string {
  const url = endpoint.baseUrl.trim();
  const key = endpoint.apiKey.trim();
  const model = getServedModelName(endpoint.model);

  switch (format) {
    case 'pair':
      return `Base URL: ${url}\nAPI Key: ${key}\nModel: ${model}`;
    case 'env':
      return `OPENAI_BASE_URL="${url}"\nOPENAI_API_KEY="${key}"\nOPENAI_MODEL_NAME="${model}"`;
    case 'curl':
      return `curl ${url}/chat/completions \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Hello!"}]}'`;
    case 'url':
      return url;
    case 'key':
      return key;
  }
}

export async function copyEndpointBundle(
  endpoint: LiveEndpoint,
  format: 'pair' | 'env' | 'curl' | 'url' | 'key'
): Promise<boolean> {
  const formatted = formatEndpointConfig(endpoint, format);
  return copyToClipboard(formatted);
}
