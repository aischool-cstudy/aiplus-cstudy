'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateRunFailureRate, toPercent } from '@/lib/analytics/run-metrics';
import { buildErrorBreakdown, type ErrorMetric } from '@/lib/analytics/error-breakdown';
import { avg, normalizeLogRows, summarizeUsageTotals, type AILogRow } from '@/lib/analytics/ops-metrics';
import { shouldIncludeAIOpsRun } from '@/lib/analytics/ops-scope';

interface PipelineMetric {
  pipeline: string;
  total: number;
  running: number;
  completed: number;
  failed: number;
  abandoned: number;
  failureRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  costEstimatedRuns: number;
  totalEstimatedCostUsd: number;
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
  totalTokens: number;
  costEstimatedRuns: number;
  totalEstimatedCostUsd: number;
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

interface RecommendationEventRow {
  surface: string | null;
  action_type: string | null;
  created_at?: string | null;
}

interface AssessmentAttemptRow {
  attempt_type: string | null;
  score: number | string | null;
  created_at?: string | null;
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
  usage: {
    meteredRuns: number;
    costEstimatedRuns: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    avgTokensPerMeteredRun: number;
    totalEstimatedCostUsd: number;
    avgEstimatedCostUsdPerEstimatedRun: number;
  };
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
    usage: {
      meteredRuns: 0,
      costEstimatedRuns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      avgTokensPerMeteredRun: 0,
      totalEstimatedCostUsd: 0,
      avgEstimatedCostUsdPerEstimatedRun: 0,
    },
  };
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
  const recommendationRows: RecommendationEventRow[] = recommendationError
    ? []
    : ((recommendationEvents || []) as RecommendationEventRow[]);
  const attemptRows: AssessmentAttemptRow[] = attemptsError
    ? []
    : ((attempts || []) as AssessmentAttemptRow[]);
  const filteredLogRows = logRows.filter((row) => shouldIncludeAIOpsRun({
    pipeline: row.pipeline,
    assessmentAnalysisMode: process.env.ASSESSMENT_ANALYSIS_MODE,
  }));
  const runRows = normalizeLogRows(filteredLogRows);
  const usageTotals = summarizeUsageTotals(runRows);

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
    meteredRuns: number;
    totalTokens: number;
    costEstimatedRuns: number;
    totalEstimatedCostUsd: number;
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
    meteredRuns: number;
    totalTokens: number;
    costEstimatedRuns: number;
    totalEstimatedCostUsd: number;
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
      meteredRuns: 0,
      totalTokens: 0,
      costEstimatedRuns: 0,
      totalEstimatedCostUsd: 0,
    };
    existing.total += 1;
    if (row.status === 'running') existing.running += 1;
    if (row.status === 'completed') existing.completed += 1;
    if (row.status === 'failed') existing.failed += 1;
    if (row.status === 'abandoned') existing.abandoned += 1;
    if (typeof row.latencyMs === 'number') existing.latencies.push(row.latencyMs);
    if (row.usage.metered) existing.meteredRuns += 1;
    existing.totalTokens += row.usage.totalTokens;
    if (row.usage.costEstimated) existing.costEstimatedRuns += 1;
    existing.totalEstimatedCostUsd += row.usage.estimatedCostUsd;
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
      meteredRuns: 0,
      totalTokens: 0,
      costEstimatedRuns: 0,
      totalEstimatedCostUsd: 0,
    };
    existingModel.total += 1;
    if (row.status === 'running') existingModel.running += 1;
    if (row.status === 'completed') existingModel.completed += 1;
    if (row.status === 'failed') existingModel.failed += 1;
    if (row.status === 'abandoned') existingModel.abandoned += 1;
    if (typeof row.latencyMs === 'number') existingModel.latencies.push(row.latencyMs);
    if (row.usage.metered) existingModel.meteredRuns += 1;
    existingModel.totalTokens += row.usage.totalTokens;
    if (row.usage.costEstimated) existingModel.costEstimatedRuns += 1;
    existingModel.totalEstimatedCostUsd += row.usage.estimatedCostUsd;
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
        totalTokens: metric.totalTokens,
        costEstimatedRuns: metric.costEstimatedRuns,
        totalEstimatedCostUsd: metric.totalEstimatedCostUsd,
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
        totalTokens: metric.totalTokens,
        costEstimatedRuns: metric.costEstimatedRuns,
        totalEstimatedCostUsd: metric.totalEstimatedCostUsd,
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
    usage: {
      meteredRuns: usageTotals.meteredRuns,
      costEstimatedRuns: usageTotals.costEstimatedRuns,
      totalInputTokens: usageTotals.inputTokens,
      totalOutputTokens: usageTotals.outputTokens,
      totalTokens: usageTotals.totalTokens,
      avgTokensPerMeteredRun: usageTotals.avgTokensPerMeteredRun,
      totalEstimatedCostUsd: usageTotals.estimatedCostUsd,
      avgEstimatedCostUsdPerEstimatedRun: usageTotals.avgEstimatedCostUsdPerEstimatedRun,
    },
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
