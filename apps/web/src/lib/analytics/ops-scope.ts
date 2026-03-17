function normalizeMode(value: string | null | undefined): 'rule' | 'llm' {
  return String(value || '').trim().toLowerCase() === 'llm' ? 'llm' : 'rule';
}

export function shouldIncludeAIOpsRun(params: {
  pipeline: string | null;
  assessmentAnalysisMode?: string | null;
}): boolean {
  const pipeline = String(params.pipeline || '').trim().toLowerCase();
  const assessmentAnalysisMode = normalizeMode(params.assessmentAnalysisMode);

  if (pipeline === 'assessment_analysis' && assessmentAnalysisMode !== 'llm') {
    return false;
  }

  return true;
}
