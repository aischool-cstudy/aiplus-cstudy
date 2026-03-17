const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeCurriculumTotalDays(
  totalDaysValue: number | string | null | undefined
): number {
  const numeric = Number(totalDaysValue);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return 1;
  }

  return Math.max(1, Math.round(numeric));
}

export function parseCurriculumStartDate(
  startDateValue: string | null | undefined
): Date | null {
  if (typeof startDateValue !== 'string') {
    return null;
  }

  const trimmed = startDateValue.trim();
  if (!trimmed) {
    return null;
  }

  const dateOnly = trimmed.slice(0, 10);
  if (!DATE_ONLY_PATTERN.test(dateOnly)) {
    return null;
  }

  const parsed = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getCurriculumDay(
  startDateValue: string | null | undefined,
  totalDaysValue: number | string | null | undefined,
  now = new Date()
): number {
  const totalDays = normalizeCurriculumTotalDays(totalDaysValue);
  const startDate = parseCurriculumStartDate(startDateValue);

  if (!startDate) {
    return 1;
  }

  const elapsedDays = Math.max(
    0,
    Math.floor((now.getTime() - startDate.getTime()) / MS_PER_DAY)
  );

  return Math.min(Math.max(1, elapsedDays + 1), totalDays);
}
