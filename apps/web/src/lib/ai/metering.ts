import type { AICallMeta, AITokenUsage } from './schemas';

interface PricingInfo {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion: number | null;
  source: string;
  referenceUrl: string;
}

const DEFAULT_MODEL_PRICING: Record<string, PricingInfo> = {
  'gpt-4o-mini': {
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.6,
    cachedInputUsdPerMillion: 0.075,
    source: 'OpenAI API pricing',
    referenceUrl: 'https://platform.openai.com/docs/pricing',
  },
  'gemini-2.0-flash': {
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.4,
    cachedInputUsdPerMillion: 0.025,
    source: 'Google Gemini API pricing',
    referenceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  'gemini-3-flash-preview': {
    inputUsdPerMillion: 0.5,
    outputUsdPerMillion: 3,
    cachedInputUsdPerMillion: 0.05,
    source: 'Google Gemini API pricing',
    referenceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  'gemini-3.0-flash-preview': {
    inputUsdPerMillion: 0.5,
    outputUsdPerMillion: 3,
    cachedInputUsdPerMillion: 0.05,
    source: 'Google Gemini API pricing',
    referenceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonNegativeInt(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseServerUsage(value: unknown): AITokenUsage | null {
  const usage = asObject(value);
  if (!usage) return null;

  const parsed: AITokenUsage = {
    inputTokens: asNonNegativeInt(usage.input_tokens),
    outputTokens: asNonNegativeInt(usage.output_tokens),
    totalTokens: asNonNegativeInt(usage.total_tokens),
    cachedInputTokens: asNonNegativeInt(usage.cached_input_tokens),
  };

  if (
    parsed.inputTokens === null
    && parsed.outputTokens === null
    && parsed.totalTokens === null
    && parsed.cachedInputTokens === null
  ) {
    return null;
  }

  return parsed;
}

function resolvePricing(provider: string, model: string): PricingInfo | null {
  const inputOverrideRaw = String(process.env.AI_PRICE_INPUT_USD_PER_MILLION || '').trim();
  const outputOverrideRaw = String(process.env.AI_PRICE_OUTPUT_USD_PER_MILLION || '').trim();
  const inputOverride = Number(inputOverrideRaw);
  const outputOverride = Number(outputOverrideRaw);
  const hasInputOverride = Number.isFinite(inputOverride) && inputOverride >= 0;
  const hasOutputOverride = Number.isFinite(outputOverride) && outputOverride >= 0;

  if (inputOverrideRaw.length > 0 && outputOverrideRaw.length > 0 && hasInputOverride && hasOutputOverride) {
    return {
      inputUsdPerMillion: inputOverride,
      outputUsdPerMillion: outputOverride,
      cachedInputUsdPerMillion: inputOverride,
      source: 'env override',
      referenceUrl: `env:${provider}/${model}`,
    };
  }

  const normalizedModel = String(model || '').trim().toLowerCase();
  const exact = DEFAULT_MODEL_PRICING[normalizedModel];
  if (exact) {
    return exact;
  }

  for (const [candidate, pricing] of Object.entries(DEFAULT_MODEL_PRICING)) {
    if (normalizedModel.startsWith(`${candidate}-`) || normalizedModel.startsWith(`${candidate}@`)) {
      return pricing;
    }
  }

  return null;
}

export function estimateAICallCost(params: {
  provider: string;
  model: string;
  usage?: AITokenUsage | null;
}): {
  estimatedCostUsd: number | null;
  pricingSource: string | null;
  pricingReferenceUrl: string | null;
} {
  const usage = params.usage || null;
  if (!usage) {
    return {
      estimatedCostUsd: null,
      pricingSource: null,
      pricingReferenceUrl: null,
    };
  }

  const pricing = resolvePricing(params.provider, params.model);
  if (!pricing) {
    return {
      estimatedCostUsd: null,
      pricingSource: null,
      pricingReferenceUrl: null,
    };
  }

  const inputTokens = typeof usage.inputTokens === 'number' ? usage.inputTokens : null;
  const outputTokens = typeof usage.outputTokens === 'number' ? usage.outputTokens : null;
  if (inputTokens === null && outputTokens === null) {
    return {
      estimatedCostUsd: null,
      pricingSource: null,
      pricingReferenceUrl: null,
    };
  }

  const cachedInputTokens = Math.min(
    inputTokens ?? 0,
    typeof usage.cachedInputTokens === 'number' ? usage.cachedInputTokens : 0
  );
  const billableInputTokens = Math.max(0, (inputTokens ?? 0) - cachedInputTokens);
  const cachedInputUsdPerMillion = pricing.cachedInputUsdPerMillion ?? pricing.inputUsdPerMillion;
  const estimatedCostUsd = Math.round(
    (
      (billableInputTokens * pricing.inputUsdPerMillion)
      + (cachedInputTokens * cachedInputUsdPerMillion)
      + ((outputTokens ?? 0) * pricing.outputUsdPerMillion)
    ) / 1_000_000 * 100_000_000
  ) / 100_000_000;

  return {
    estimatedCostUsd,
    pricingSource: pricing.source,
    pricingReferenceUrl: pricing.referenceUrl,
  };
}

export function extractAIResponsePayload<T>(raw: T): { data: T; serverMeta: Record<string, unknown> | null } {
  const objectValue = asObject(raw);
  if (!objectValue || !('meta' in objectValue)) {
    return { data: raw, serverMeta: null };
  }

  const { meta, ...rest } = objectValue;
  return {
    data: rest as T,
    serverMeta: asObject(meta),
  };
}

export function mergeServerAIMeta(callMeta: AICallMeta, serverMetaValue: unknown): AICallMeta {
  const serverMeta = asObject(serverMetaValue);
  if (!serverMeta) {
    return callMeta;
  }

  const provider = asNonEmptyString(serverMeta.provider) || callMeta.provider;
  const model = asNonEmptyString(serverMeta.model) || callMeta.model;
  const attemptCandidate = Number(serverMeta.attempt_count);
  const attemptCount = Number.isFinite(attemptCandidate) && attemptCandidate > 0
    ? Math.max(callMeta.attemptCount, Math.round(attemptCandidate))
    : callMeta.attemptCount;
  const fallbackUsed = serverMeta.fallback_used === true || callMeta.fallbackUsed === true;
  const fallbackKind = asNonEmptyString(serverMeta.failure_kind) || callMeta.fallbackKind || null;
  const usage = parseServerUsage(serverMeta.usage) || callMeta.usage || null;
  const estimate = estimateAICallCost({ provider, model, usage });

  return {
    ...callMeta,
    provider,
    model,
    attemptCount,
    retried: attemptCount > 1,
    fallbackUsed,
    fallbackKind,
    usage,
    estimatedCostUsd: estimate.estimatedCostUsd ?? callMeta.estimatedCostUsd ?? null,
    pricingSource: estimate.pricingSource ?? callMeta.pricingSource ?? null,
    pricingReferenceUrl: estimate.pricingReferenceUrl ?? callMeta.pricingReferenceUrl ?? null,
  };
}
