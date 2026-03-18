interface AICallInfo {
  provider: string;
  model: string;
  attemptCount: number;
  retried: boolean;
  fallbackUsed: boolean;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  costEstimated: boolean;
  metered: boolean;
}

type LogStatus = 'started' | 'success' | 'failed';
export type RunStatus = 'running' | 'completed' | 'failed' | 'abandoned';

export interface AILogRow {
  id: string | null;
  pipeline: string | null;
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  latency_ms: number | null;
  metadata: unknown;
  created_at: string | null;
}

interface RunRowSnapshot {
  status: LogStatus;
  errorCode: string | null;
  errorMessage: string;
  latencyMs: number | null;
  callInfo: AICallInfo;
  usage: UsageSummary;
  createdAtMs: number | null;
}

export interface RunMetric {
  pipeline: string;
  status: RunStatus;
  latencyMs: number | null;
  provider: string;
  model: string;
  retried: boolean;
  fallbackUsed: boolean;
  attemptCount: number;
  terminalErrorCode: string | null;
  terminalErrorMessage: string;
  usage: UsageSummary;
}

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonNegativeNumber(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function parseAICallInfo(metadataValue: unknown): AICallInfo {
  const metadata = asObject(metadataValue) || {};
  const aiCall = asObject(metadata.aiCall) || {};

  const provider = String(aiCall.provider || metadata.provider || metadata.aiProvider || 'unknown').trim() || 'unknown';
  const model = String(aiCall.model || metadata.model || metadata.aiModel || 'unknown').trim() || 'unknown';
  const attemptCandidate = Number(aiCall.attemptCount || metadata.attemptCount || metadata.aiAttemptCount || 1);
  const attemptCount = Number.isFinite(attemptCandidate) && attemptCandidate > 0
    ? Math.max(1, Math.round(attemptCandidate))
    : 1;
  const fallbackUsed = (
    aiCall.fallbackUsed === true
    || metadata.fallbackUsed === true
  );

  return {
    provider,
    model,
    attemptCount,
    retried: attemptCount > 1,
    fallbackUsed,
  };
}

export function parseUsageSummary(metadataValue: unknown): UsageSummary {
  const metadata = asObject(metadataValue) || {};
  const aiCall = asObject(metadata.aiCall) || {};
  const usage = asObject(aiCall.usage) || asObject(metadata.usage) || {};

  const inputTokens = asNonNegativeNumber(
    usage.inputTokens
    ?? usage.input_tokens
    ?? metadata.inputTokens
    ?? metadata.input_tokens
  );
  const outputTokens = asNonNegativeNumber(
    usage.outputTokens
    ?? usage.output_tokens
    ?? metadata.outputTokens
    ?? metadata.output_tokens
  );
  const totalTokensCandidate = asNonNegativeNumber(
    usage.totalTokens
    ?? usage.total_tokens
    ?? metadata.totalTokens
    ?? metadata.total_tokens
  );
  const estimatedCostUsd = asNonNegativeNumber(
    aiCall.estimatedCostUsd
    ?? metadata.estimatedCostUsd
  );

  const totalTokens = totalTokensCandidate ?? (
    inputTokens !== null || outputTokens !== null
      ? (inputTokens || 0) + (outputTokens || 0)
      : null
  );

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? 0,
    estimatedCostUsd: estimatedCostUsd !== null ? roundUsd(estimatedCostUsd) : 0,
    costEstimated: estimatedCostUsd !== null,
    metered: (
      inputTokens !== null
      || outputTokens !== null
      || totalTokens !== null
      || estimatedCostUsd !== null
    ),
  };
}

function normalizeStatus(value: unknown): LogStatus {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'success' || normalized === 'failed') return normalized;
  return 'started';
}

function parseTraceId(metadataValue: unknown): string | null {
  const metadata = asObject(metadataValue);
  const traceId = metadata?.traceId;
  if (typeof traceId !== 'string') return null;
  const trimmed = traceId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseLatency(value: unknown): number | null {
  const latency = Number(value);
  if (!Number.isFinite(latency) || latency < 0) return null;
  return latency;
}

function parseCreatedAtMs(value: unknown): number | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function addUsage(left: UsageSummary, right: UsageSummary): UsageSummary {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    estimatedCostUsd: roundUsd(left.estimatedCostUsd + right.estimatedCostUsd),
    costEstimated: left.costEstimated || right.costEstimated,
    metered: left.metered || right.metered,
  };
}

export function summarizeUsageTotals(rows: Array<{ usage: UsageSummary }>) {
  const usage = rows.reduce(
    (acc, row) => addUsage(acc, row.usage),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      costEstimated: false,
      metered: false,
    }
  );
  const meteredRuns = rows.filter((row) => row.usage.metered).length;
  const costEstimatedRuns = rows.filter((row) => row.usage.costEstimated).length;
  return {
    ...usage,
    meteredRuns,
    costEstimatedRuns,
    avgTokensPerMeteredRun: meteredRuns > 0 ? Math.round(usage.totalTokens / meteredRuns) : 0,
    avgEstimatedCostUsdPerEstimatedRun: costEstimatedRuns > 0
      ? roundUsd(usage.estimatedCostUsd / costEstimatedRuns)
      : 0,
  };
}

export function normalizeLogRows(logRows: AILogRow[], now = Date.now()): RunMetric[] {
  const RUNNING_STALE_MS = 15 * 60 * 1000;
  const runMap = new Map<string, {
    pipeline: string;
    rows: RunRowSnapshot[];
  }>();

  logRows.forEach((row, idx) => {
    const pipeline = String(row.pipeline || 'unknown');
    const traceId = parseTraceId(row.metadata);
    const fallbackKey = row.id || `${pipeline}:${idx}`;
    const runKey = traceId ? `${pipeline}::${traceId}` : `legacy::${fallbackKey}`;
    const bucket = runMap.get(runKey) || { pipeline, rows: [] };

    bucket.rows.push({
      status: normalizeStatus(row.status),
      errorCode: row.error_code ? String(row.error_code) : null,
      errorMessage: String(row.error_message || ''),
      latencyMs: parseLatency(row.latency_ms),
      callInfo: parseAICallInfo(row.metadata),
      usage: parseUsageSummary(row.metadata),
      createdAtMs: parseCreatedAtMs(row.created_at),
    });

    runMap.set(runKey, bucket);
  });

  const runs: RunMetric[] = [];

  for (const bucket of runMap.values()) {
    if (bucket.rows.length === 0) continue;

    const rows = bucket.rows;
    const terminalRow = [...rows].reverse().find((row) => row.status === 'success' || row.status === 'failed') || null;
    const representativeRow = [...rows].reverse().find((row) => (
      row.callInfo.provider !== 'unknown'
      || row.callInfo.model !== 'unknown'
    )) || [...rows].reverse().find((row) => row.usage.metered) || terminalRow || rows[rows.length - 1];

    const lastCreatedAtMs = rows
      .map((row) => row.createdAtMs)
      .filter((value): value is number => value !== null)
      .sort((a, b) => b - a)[0] || null;

    let status: RunStatus;
    if (terminalRow?.status === 'success') {
      status = 'completed';
    } else if (terminalRow?.status === 'failed') {
      status = 'failed';
    } else if (lastCreatedAtMs !== null && (now - lastCreatedAtMs) <= RUNNING_STALE_MS) {
      status = 'running';
    } else {
      status = 'abandoned';
    }

    const attemptCount = rows.reduce(
      (maxAttempt, row) => Math.max(maxAttempt, row.callInfo.attemptCount),
      1
    );
    const retried = rows.some((row) => row.callInfo.retried);
    const fallbackUsed = rows.some((row) => row.callInfo.fallbackUsed);
    const latencies = rows
      .map((row) => row.latencyMs)
      .filter((value): value is number => value !== null);
    const latencyMs = terminalRow?.latencyMs ?? (latencies.length > 0 ? Math.max(...latencies) : null);
    const usage = rows.reduce(
      (acc, row) => addUsage(acc, row.usage),
      {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        costEstimated: false,
        metered: false,
      }
    );

    runs.push({
      pipeline: bucket.pipeline,
      status,
      latencyMs,
      provider: representativeRow.callInfo.provider,
      model: representativeRow.callInfo.model,
      retried,
      fallbackUsed,
      attemptCount,
      terminalErrorCode: status === 'failed'
        ? (terminalRow?.errorCode || 'unknown')
        : status === 'abandoned'
          ? 'terminal_status_missing'
          : null,
      terminalErrorMessage: status === 'failed'
        ? String(terminalRow?.errorMessage || '')
        : status === 'abandoned'
          ? 'terminal status missing'
          : '',
      usage,
    });
  }

  return runs;
}
