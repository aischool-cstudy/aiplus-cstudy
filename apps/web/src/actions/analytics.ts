'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateRunFailureRate, toPercent } from '@/lib/analytics/run-metrics';
import { buildErrorBreakdown, type ErrorMetric } from '@/lib/analytics/error-breakdown';

interface PipelineMetric {
  pipeline: string;
  total: number;
  running: number;
  completed: number;
  failed: number;
  abandoned: number;
  failureRate: number;
  avgLatencyMs: number;
}

interface ProviderModelMetric {
  provider: string;
  model: string;
  total: number;
  running: number;
  completed: number;
  failed: number;
  abandoned: number;
  failureRate: number;
  avgLatencyMs: number;
}

interface RecommendationMetric {
  surface: string;
  impressions: number;
  clicks: number;
  starts: number;
  completes: number;
  clickThroughRate: number;
  completionRate: number;
}

export interface AIOpsMetrics {
  days: number;
  totalRuns: number;
  runningRuns: number;
  completedRuns: number;
  failedRuns: number;
  abandonedRuns: number;
  failureRate: number;
  avgLatencyMs: number;
  pipelines: PipelineMetric[];
  providerModels: ProviderModelMetric[];
  errorCodes: ErrorMetric[];
  retries: {
    retriedRuns: number;
    retriedRate: number;
    avgAttemptCount: number;
  };
  reliability: {
    fallbackRuns: number;
    fallbackRate: number;
    timeoutFailures: number;
    rateLimitedFailures: number;
    timeoutOrRateLimitedRate: number;
  };
  recommendation: {
    totalEvents: number;
    bySurface: RecommendationMetric[];
  };
  assessment: {
    totalAttempts: number;
    avgScore: number;
    wrongOnlyAttempts: number;
    variantAttempts: number;
  };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

function emptyMetrics(days: number): AIOpsMetrics {
  return {
    days,
    totalRuns: 0,
    runningRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    abandonedRuns: 0,
    failureRate: 0,
    avgLatencyMs: 0,
    pipelines: [],
    providerModels: [],
    errorCodes: [],
    retries: {
      retriedRuns: 0,
      retriedRate: 0,
      avgAttemptCount: 0,
    },
    reliability: {
      fallbackRuns: 0,
      fallbackRate: 0,
      timeoutFailures: 0,
      rateLimitedFailures: 0,
      timeoutOrRateLimitedRate: 0,
    },
    recommendation: {
      totalEvents: 0,
      bySurface: [],
    },
    assessment: {
      totalAttempts: 0,
      avgScore: 0,
      wrongOnlyAttempts: 0,
      variantAttempts: 0,
    },
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseAICallInfo(metadataValue: unknown): {
  provider: string;
  model: string;
  attemptCount: number;
  retried: boolean;
  fallbackUsed: boolean;
  fallbackKind: string | null;
} {
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
  const fallbackKindCandidate = aiCall.fallbackKind ?? metadata.fallbackKind;
  const fallbackKind = typeof fallbackKindCandidate === 'string'
    ? fallbackKindCandidate
    : null;

  return {
    provider,
    model,
    attemptCount,
    retried: attemptCount > 1,
    fallbackUsed,
    fallbackKind,
  };
}

type LogStatus = 'started' | 'success' | 'failed';
type RunStatus = 'running' | 'completed' | 'failed' | 'abandoned';

interface AILogRow {
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
  callInfo: ReturnType<typeof parseAICallInfo>;
  createdAtMs: number | null;
}

interface RunMetric {
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

function normalizeLogRows(logRows: AILogRow[]): RunMetric[] {
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
      createdAtMs: parseCreatedAtMs(row.created_at),
    });

    runMap.set(runKey, bucket);
  });

  const now = Date.now();
  const runs: RunMetric[] = [];

  for (const bucket of runMap.values()) {
    if (bucket.rows.length === 0) continue;

    const rows = bucket.rows;
    const terminalRow = [...rows].reverse().find((row) => row.status === 'success' || row.status === 'failed') || null;
    const representativeRow = terminalRow || rows[rows.length - 1];

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
    });
  }

  return runs;
}

export async function getAIOpsMetrics(days = 7): Promise<AIOpsMetrics> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return emptyMetrics(days);

  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: logs, error: logsError }, { data: recommendationEvents, error: recommendationError }, { data: attempts, error: attemptsError }] = await Promise.all([
    supabase
      .from('ai_generation_logs')
      .select('id, pipeline, status, error_code, error_message, latency_ms, metadata, created_at')
      .eq('user_id', user.id)
      .gte('created_at', from)
      .order('created_at', { ascending: true }),
    supabase
      .from('recommendation_events')
      .select('surface, action_type, created_at')
      .eq('user_id', user.id)
      .gte('created_at', from),
    supabase
      .from('assessment_attempts')
      .select('attempt_type, score, created_at')
      .eq('user_id', user.id)
      .gte('created_at', from),
  ]);

  const logRows: AILogRow[] = logsError ? [] : ((logs || []) as AILogRow[]);
  const recommendationRows = recommendationError ? [] : (recommendationEvents || []);
  const attemptRows = attemptsError ? [] : (attempts || []);
  const runRows = normalizeLogRows(logRows);

  const totalRuns = runRows.length;
  const runningRuns = runRows.filter((row) => row.status === 'running').length;
  const completedRuns = runRows.filter((row) => row.status === 'completed').length;
  const failedRuns = runRows.filter((row) => row.status === 'failed').length;
  const abandonedRuns = runRows.filter((row) => row.status === 'abandoned').length;

  const latencies = runRows
    .map((row) => row.latencyMs)
    .filter((value): value is number => value !== null);

  const pipelineMap = new Map<string, {
    total: number;
    running: number;
    completed: number;
    failed: number;
    abandoned: number;
    latencies: number[];
  }>();
  const providerModelMap = new Map<string, {
    provider: string;
    model: string;
    total: number;
    running: number;
    completed: number;
    failed: number;
    abandoned: number;
    latencies: number[];
  }>();

  for (const row of runRows) {
    const key = row.pipeline;
    const existing = pipelineMap.get(key) || {
      total: 0,
      running: 0,
      completed: 0,
      failed: 0,
      abandoned: 0,
      latencies: [],
    };
    existing.total += 1;
    if (row.status === 'running') existing.running += 1;
    if (row.status === 'completed') existing.completed += 1;
    if (row.status === 'failed') existing.failed += 1;
    if (row.status === 'abandoned') existing.abandoned += 1;
    if (typeof row.latencyMs === 'number') existing.latencies.push(row.latencyMs);
    pipelineMap.set(key, existing);

    const modelKey = `${row.provider}::${row.model}`;
    const existingModel = providerModelMap.get(modelKey) || {
      provider: row.provider,
      model: row.model,
      total: 0,
      running: 0,
      completed: 0,
      failed: 0,
      abandoned: 0,
      latencies: [],
    };
    existingModel.total += 1;
    if (row.status === 'running') existingModel.running += 1;
    if (row.status === 'completed') existingModel.completed += 1;
    if (row.status === 'failed') existingModel.failed += 1;
    if (row.status === 'abandoned') existingModel.abandoned += 1;
    if (typeof row.latencyMs === 'number') existingModel.latencies.push(row.latencyMs);
    providerModelMap.set(modelKey, existingModel);
  }

  const pipelines: PipelineMetric[] = Array.from(pipelineMap.entries())
    .map(([pipeline, metric]) => {
      return {
        pipeline,
        total: metric.total,
        running: metric.running,
        completed: metric.completed,
        failed: metric.failed,
        abandoned: metric.abandoned,
        failureRate: calculateRunFailureRate({
          completedRuns: metric.completed,
          failedRuns: metric.failed,
          abandonedRuns: metric.abandoned,
        }),
        avgLatencyMs: avg(metric.latencies),
      };
    })
    .sort((a, b) => b.total - a.total);

  const providerModels: ProviderModelMetric[] = Array.from(providerModelMap.values())
    .map((metric) => {
      return {
        provider: metric.provider,
        model: metric.model,
        total: metric.total,
        running: metric.running,
        completed: metric.completed,
        failed: metric.failed,
        abandoned: metric.abandoned,
        failureRate: calculateRunFailureRate({
          completedRuns: metric.completed,
          failedRuns: metric.failed,
          abandonedRuns: metric.abandoned,
        }),
        avgLatencyMs: avg(metric.latencies),
      };
    })
    .sort((a, b) => b.total - a.total);

  const {
    errorCodes,
    timeoutFailures,
    rateLimitedFailures,
    timeoutOrRateLimitedFailures,
  } = buildErrorBreakdown(runRows);

  const settledRunRows = runRows.filter((row) => row.status !== 'running');
  const retriedRuns = settledRunRows.filter((row) => row.retried).length;
  const fallbackRuns = settledRunRows.filter((row) => row.fallbackUsed).length;
  const attemptCountTotal = settledRunRows.reduce((sum, row) => sum + row.attemptCount, 0);

  const recommendationMap = new Map<string, {
    impressions: number;
    clicks: number;
    starts: number;
    completes: number;
  }>();
  for (const row of recommendationRows) {
    const surface = String(row.surface || 'unknown');
    const actionType = String(row.action_type || '');
    const existing = recommendationMap.get(surface) || {
      impressions: 0,
      clicks: 0,
      starts: 0,
      completes: 0,
    };
    if (actionType === 'impression') existing.impressions += 1;
    if (actionType === 'click') existing.clicks += 1;
    if (actionType === 'start') existing.starts += 1;
    if (actionType === 'complete') existing.completes += 1;
    recommendationMap.set(surface, existing);
  }

  const bySurface: RecommendationMetric[] = Array.from(recommendationMap.entries())
    .map(([surface, metric]) => ({
      surface,
      impressions: metric.impressions,
      clicks: metric.clicks,
      starts: metric.starts,
      completes: metric.completes,
      clickThroughRate: metric.impressions > 0 ? toPercent(metric.clicks / metric.impressions) : 0,
      completionRate: metric.starts > 0 ? toPercent(metric.completes / metric.starts) : 0,
    }))
    .sort((a, b) => (b.impressions + b.clicks) - (a.impressions + a.clicks));

  const avgScore = avg(
    attemptRows
      .map((row) => Number(row.score))
      .filter((value) => Number.isFinite(value))
  );

  const wrongOnlyAttempts = attemptRows.filter((row) => row.attempt_type === 'wrong_only').length;
  const variantAttempts = attemptRows.filter((row) => row.attempt_type === 'variant').length;

  return {
    days,
    totalRuns,
    runningRuns,
    completedRuns,
    failedRuns,
    abandonedRuns,
    failureRate: calculateRunFailureRate({
      completedRuns,
      failedRuns,
      abandonedRuns,
    }),
    avgLatencyMs: avg(latencies),
    pipelines,
    providerModels,
    errorCodes,
    retries: {
      retriedRuns,
      retriedRate: settledRunRows.length > 0 ? toPercent(retriedRuns / settledRunRows.length) : 0,
      avgAttemptCount: settledRunRows.length > 0 ? Math.round((attemptCountTotal / settledRunRows.length) * 100) / 100 : 0,
    },
    reliability: {
      fallbackRuns,
      fallbackRate: settledRunRows.length > 0 ? toPercent(fallbackRuns / settledRunRows.length) : 0,
      timeoutFailures,
      rateLimitedFailures,
      timeoutOrRateLimitedRate: failedRuns > 0
        ? toPercent(timeoutOrRateLimitedFailures / failedRuns)
        : 0,
    },
    recommendation: {
      totalEvents: recommendationRows.length,
      bySurface,
    },
    assessment: {
      totalAttempts: attemptRows.length,
      avgScore,
      wrongOnlyAttempts,
      variantAttempts,
    },
  };
}
