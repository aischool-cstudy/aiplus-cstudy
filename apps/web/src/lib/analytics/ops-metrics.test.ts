import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLogRows, parseUsageSummary, summarizeUsageTotals, type AILogRow } from './ops-metrics';

test('parseUsageSummary reads token and cost fields from nested or flat metadata', () => {
  const usage = parseUsageSummary({
    aiCall: {
      usage: {
        inputTokens: 120,
        outputTokens: 30,
      },
      estimatedCostUsd: 0.00033,
    },
  });

  assert.deepEqual(usage, {
    inputTokens: 120,
    outputTokens: 30,
    totalTokens: 150,
    estimatedCostUsd: 0.00033,
    costEstimated: true,
    metered: true,
  });

  const flatUsage = parseUsageSummary({
    inputTokens: 40,
    outputTokens: 10,
    estimatedCostUsd: 0.00008,
  });

  assert.deepEqual(flatUsage, {
    inputTokens: 40,
    outputTokens: 10,
    totalTokens: 50,
    estimatedCostUsd: 0.00008,
    costEstimated: true,
    metered: true,
  });

  const tokensOnly = parseUsageSummary({
    inputTokens: 40,
    outputTokens: 10,
  });

  assert.deepEqual(tokensOnly, {
    inputTokens: 40,
    outputTokens: 10,
    totalTokens: 50,
    estimatedCostUsd: 0,
    costEstimated: false,
    metered: true,
  });
});

test('normalizeLogRows aggregates usage across rows in a single run', () => {
  const rows: AILogRow[] = [
    {
      id: '1',
      pipeline: 'curriculum_generate',
      status: 'started',
      error_code: null,
      error_message: null,
      latency_ms: null,
      metadata: { traceId: 'trace-1' },
      created_at: '2026-03-09T05:00:00.000Z',
    },
    {
      id: '2',
      pipeline: 'curriculum_generate',
      status: 'success',
      error_code: null,
      error_message: null,
      latency_ms: 900,
      metadata: {
        traceId: 'trace-1',
        aiCall: {
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          attemptCount: 2,
          usage: {
            inputTokens: 100,
            outputTokens: 50,
          },
          estimatedCostUsd: 0.0002,
        },
      },
      created_at: '2026-03-09T05:00:02.000Z',
    },
    {
      id: '3',
      pipeline: 'curriculum_generate',
      status: 'success',
      error_code: null,
      error_message: null,
      latency_ms: 1200,
      metadata: {
        traceId: 'trace-1',
        inputTokens: 20,
        outputTokens: 5,
        estimatedCostUsd: 0.00004,
      },
      created_at: '2026-03-09T05:00:03.000Z',
    },
  ];

  const runs = normalizeLogRows(rows, Date.parse('2026-03-09T05:20:00.000Z'));
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], {
    pipeline: 'curriculum_generate',
    status: 'completed',
    latencyMs: 1200,
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    retried: true,
    fallbackUsed: false,
    attemptCount: 2,
    terminalErrorCode: null,
    terminalErrorMessage: '',
    usage: {
      inputTokens: 120,
      outputTokens: 55,
      totalTokens: 175,
      estimatedCostUsd: 0.00024,
      costEstimated: true,
      metered: true,
    },
  });

  const totals = summarizeUsageTotals(runs);
  assert.deepEqual(totals, {
    inputTokens: 120,
    outputTokens: 55,
    totalTokens: 175,
    estimatedCostUsd: 0.00024,
    costEstimated: true,
    metered: true,
    meteredRuns: 1,
    costEstimatedRuns: 1,
    avgTokensPerMeteredRun: 175,
    avgEstimatedCostUsdPerEstimatedRun: 0.00024,
  });
});
