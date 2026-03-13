import { test } from 'node:test';
import assert from 'node:assert/strict';

import { estimateAICallCost, extractAIResponsePayload, mergeServerAIMeta } from './metering';

test('estimateAICallCost uses default pricing table for gpt-4o-mini', () => {
  const result = estimateAICallCost({
    provider: 'openai',
    model: 'gpt-4o-mini',
    usage: {
      inputTokens: 1_000,
      outputTokens: 2_000,
    },
  });

  assert.equal(result.estimatedCostUsd, 0.00135);
  assert.equal(result.pricingSource, 'OpenAI API pricing');
});

test('estimateAICallCost accounts for cached tokens and current gemini-2.0-flash pricing', () => {
  const result = estimateAICallCost({
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    usage: {
      inputTokens: 1_000,
      outputTokens: 500,
      cachedInputTokens: 200,
    },
  });

  assert.equal(result.estimatedCostUsd, 0.000285);
  assert.equal(result.pricingSource, 'Google Gemini API pricing');
});

test('estimateAICallCost does not invent zero cost when split token counts are missing', () => {
  const result = estimateAICallCost({
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    usage: {
      totalTokens: 2_000,
    },
  });

  assert.equal(result.estimatedCostUsd, null);
  assert.equal(result.pricingSource, null);
});

test('extractAIResponsePayload strips response meta from API body', () => {
  const payload = extractAIResponsePayload({
    title: 'Example',
    meta: {
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
    },
  });

  assert.deepEqual(payload.data, { title: 'Example' });
  assert.deepEqual(payload.serverMeta, {
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
  });
});

test('mergeServerAIMeta folds usage and fallback fields into call metadata', () => {
  const merged = mergeServerAIMeta({
    gateway: 'fastapi',
    endpoint: '/api/curriculum/sections',
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    attemptCount: 1,
    retried: false,
    status: 200,
  }, {
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    attempt_count: 2,
    fallback_used: true,
    failure_kind: 'quality_failed',
    usage: {
      input_tokens: 1500,
      output_tokens: 500,
      total_tokens: 2000,
    },
  });

  assert.equal(merged.attemptCount, 2);
  assert.equal(merged.retried, true);
  assert.equal(merged.fallbackUsed, true);
  assert.equal(merged.fallbackKind, 'quality_failed');
  assert.deepEqual(merged.usage, {
    inputTokens: 1500,
    outputTokens: 500,
    totalTokens: 2000,
    cachedInputTokens: null,
  });
  assert.equal(merged.estimatedCostUsd, 0.00225);
});
