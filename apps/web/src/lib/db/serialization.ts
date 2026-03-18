const POSTGRES_ARRAY_COLUMNS = new Set([
  'assessment_attempts.wrong_question_indexes',
  'learner_profiles.interests',
  'learning_feedback.difficult_concepts',
  'learning_progress.difficult_concepts',
]);

function normalizeIdentifier(identifier: string): string {
  return identifier.replace(/^"+|"+$/g, '').toLowerCase();
}

function normalizeTableName(table: string): string {
  const parts = table.split('.');
  return normalizeIdentifier(parts[parts.length - 1] || table);
}

function isPostgresArrayColumn(table: string, column: string): boolean {
  return POSTGRES_ARRAY_COLUMNS.has(`${normalizeTableName(table)}.${normalizeIdentifier(column)}`);
}

export function serializeColumnValue(
  table: string,
  column: string,
  value: unknown
): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return isPostgresArrayColumn(table, column) ? value : JSON.stringify(value);
  }
  if (value instanceof Date) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}
