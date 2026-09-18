import { ChatMessage, LiveEndpoint, getServedModelName } from './types';

export class ChatService {
  private abortController: AbortController | null = null;

  public async sendMessage(
    endpoint: LiveEndpoint,
    messages: ChatMessage[],
    reasoningEffort: string = '',
    onChunk: (delta: string, reasoningDelta?: string) => void,
    onError: (err: Error) => void,
    onDone: () => void
  ) {
    this.stop();
    this.abortController = new AbortController();

    const formattedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (!endpoint.baseUrl || !endpoint.baseUrl.startsWith('http')) {
      throw new Error(`Endpoint URL is not ready or invalid: "${endpoint.baseUrl}". Please ensure Cloudflare Tunnel allocation is complete.`);
    }

    let activeModel = getServedModelName(endpoint.model);

    const trySend = async (modelToUse: string): Promise<Response> => {
      const body: Record<string, any> = {
        model: modelToUse,
        messages: formattedMessages,
        stream: true,
        temperature: 0.7,
      };

      if (reasoningEffort && reasoningEffort !== 'none' && reasoningEffort !== 'default') {
        body.chat_template_kwargs = { reasoning_effort: reasoningEffort };
      }

      const url = endpoint.baseUrl.replace(/\/+$/, '') + '/chat/completions';
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: this.abortController?.signal,
      });
    };

    try {
      let res = await trySend(activeModel);

      // If model name mismatch returns 404, query /v1/models to fetch actual model ID and retry
      if (res.status === 404) {
        try {
          const modelsUrl = endpoint.baseUrl.replace(/\/+$/, '') + '/models';
          const mRes = await fetch(modelsUrl, {
            headers: { Authorization: `Bearer ${endpoint.apiKey}` },
          });
          if (mRes.ok) {
            const mData = await mRes.json();
            if (mData.data && mData.data.length > 0 && mData.data[0].id) {
              activeModel = mData.data[0].id;
              endpoint.model = activeModel;
              res = await trySend(activeModel);
            }
          }
        } catch {}
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      if (!res.body) {
        throw new Error('Response body is null');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // comments / keepalive
          if (trimmed === 'data: [DONE]') {
            onDone();
            return;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const choice = json.choices?.[0];
              if (choice) {
                const delta = choice.delta?.content || '';
                const reasoning = choice.delta?.reasoning_content || choice.delta?.reasoning || choice.delta?.thought || '';
                if (delta || reasoning) {
                  onChunk(delta, reasoning);
                }
              }
            } catch {
              // ignore partial line parsing
            }
          }
        }
      }

      onDone();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        onDone();
      } else {
        onError(err);
      }
    } finally {
      this.abortController = null;
    }
  }

  public stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
