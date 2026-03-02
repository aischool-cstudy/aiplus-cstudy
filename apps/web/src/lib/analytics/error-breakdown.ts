export interface RunErrorSample {
  status: 'running' | 'completed' | 'failed' | 'abandoned';
  terminalErrorCode: string | null;
}

export interface ErrorMetric {
  errorCode: string;
  count: number;
}

export interface ErrorBreakdown {
  errorCodes: ErrorMetric[];
  timeoutFailures: number;
  rateLimitedFailures: number;
  timeoutOrRateLimitedFailures: number;
}

export function buildErrorBreakdown(runRows: RunErrorSample[]): ErrorBreakdown {
  const errorMap = new Map<string, number>();
  let timeoutFailures = 0;
  let rateLimitedFailures = 0;
  let timeoutOrRateLimitedFailures = 0;

  for (const row of runRows) {
    if (row.status !== 'failed') continue;
    const code = String(row.terminalErrorCode || 'unknown');
    errorMap.set(code, (errorMap.get(code) || 0) + 1);

    const isTimeout = code === 'timeout';
    const isRateLimited = code === 'rate_limited';
    if (isTimeout) timeoutFailures += 1;
    if (isRateLimited) rateLimitedFailures += 1;
    if (isTimeout || isRateLimited) timeoutOrRateLimitedFailures += 1;
  }

  const errorCodes: ErrorMetric[] = Array.from(errorMap.entries())
    .map(([errorCode, count]) => ({ errorCode, count }))
    .sort((a, b) => b.count - a.count);

  return {
    errorCodes,
    timeoutFailures,
    rateLimitedFailures,
    timeoutOrRateLimitedFailures,
  };
}
