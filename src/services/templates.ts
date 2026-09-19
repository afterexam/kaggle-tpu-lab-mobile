import { ModelId, LaunchConfig } from './types';
import { QWEN_TEMPLATE, GLM_TEMPLATE, GLM_ENGINE_B64 } from './templates_data';

export const ENV_DATASET = 'rahim3/qwen38-tpu-env-v5e8';
export const QWEN_WEIGHTS_DATASET = 'rahim3/qwen3-8-27b-bf16';

export const GLM_EXPERT_DATASETS = [
  'rahim3/glm53-flash-iq3xxs-1',
  'rahim3/glm53-flash-iq3xxs-2',
];
export const GLM_SERVE_DATASET = 'rahim3/glm53-flash-serve';
export const GLM_DATASETS = [
  'rahim3/glm53-flash-iq3xxs-1',
  'rahim3/glm53-flash-iq3xxs-2',
  'rahim3/glm53-flash-fp8-1',
  'rahim3/glm53-flash-fp8-2',
  'rahim3/glm53-flash-fp8-3',
  'rahim3/glm53-flash-fp8-4',
];

/**
 * Format a JS object as a Python dict literal
 */
/** Render a JS value as a Python literal (exported for unit tests). */
export function formatPythonValue(val: unknown): string {
  if (val === null || val === undefined) return 'None';
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return JSON.stringify(val);
  if (Array.isArray(val)) {
    return '[' + val.map(formatPythonValue).join(', ') + ']';
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>).map(
      ([k, v]) => `${JSON.stringify(k)}: ${formatPythonValue(v)}`
    );
    return '{' + entries.join(', ') + '}';
  }
  return String(val);
}

export interface PreparedKernel {
  code: string;
  datasets: string[];
  slug: string;
  topic: string;
  apiKey: string;
}

export function prepareKernel(
  model: ModelId,
  config: LaunchConfig,
  topic: string,
  apiKey: string
): PreparedKernel {
  if (model === 'qwen38-27b') {
    const slug = 'qwen38-tpu-serve';
    const cfg: Record<string, unknown> = {
      ntfy_topic: topic,
      api_key: apiKey,
      max_model_len: config.maxModelLen,
      max_num_seqs: config.maxNumSeqs,
      mtp_tokens: config.mtpTokens,
      reasoning_effort_default: config.reasoningEffort,
      keepalive_min: config.keepaliveMin,
      weights_dataset: QWEN_WEIGHTS_DATASET,
      text_only: config.textOnly,
      fast_start: config.fastStart,
    };

    const cfgStr = formatPythonValue(cfg);
    let code = QWEN_TEMPLATE.replace(
      /^CFG = None  # __LAUNCHER_CONFIG__.*$/m,
      `CFG = ${cfgStr}`
    );

    return {
      code,
      datasets: [QWEN_WEIGHTS_DATASET, ENV_DATASET],
      slug,
      topic,
      apiKey,
    };
  } else {
    const slug = 'glm53-tpu-serve';
    const cfg: Record<string, unknown> = {
      ntfy_topic: topic,
      api_key: apiKey,
      max_len: config.maxModelLen,
      streams: config.streams,
      reasoning_effort_default:
        config.reasoningEffort === 'high' ? 'high' :
        config.reasoningEffort === 'medium' ? 'medium' : 'low',
      keepalive_min: config.keepaliveMin,
      vision: !config.textOnly,
      serve_dataset: GLM_SERVE_DATASET,
    };

    const cfgStr = formatPythonValue(cfg);
    let code = GLM_TEMPLATE.replace(
      /^CFG = None  # __LAUNCHER_CONFIG__.*$/m,
      `CFG = ${cfgStr}`
    );
    code = code.replace(
      /^ENGINE_B64 = ""  # __ENGINE__.*$/m,
      `ENGINE_B64 = "${GLM_ENGINE_B64}"`
    );

    // Aligned with launch.py: experts (iq3xxs-1, iq3xxs-2) + serve dataset (base/ + jax_cache/)
    const datasets = [GLM_EXPERT_DATASETS[0], GLM_EXPERT_DATASETS[1], GLM_SERVE_DATASET];

    return {
      code,
      datasets,
      slug,
      topic,
      apiKey,
    };
  }
}
