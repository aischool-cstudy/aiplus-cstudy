export function toPercent(value: number): number {
  return Math.round(value * 1000) / 10;
}

export function calculateRunFailureRate(params: {
  completedRuns: number;
  failedRuns: number;
  abandonedRuns: number;
}): number {
  const terminalRuns = params.completedRuns + params.failedRuns + params.abandonedRuns;
  return terminalRuns > 0 ? toPercent(params.failedRuns / terminalRuns) : 0;
}
