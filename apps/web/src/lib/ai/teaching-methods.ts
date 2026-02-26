export const TEACHING_METHOD_VALUES = [
  'direct_instruction',
  'problem_based',
] as const;

export type TeachingMethod = (typeof TEACHING_METHOD_VALUES)[number];

export const DEFAULT_TEACHING_METHOD: TeachingMethod = 'direct_instruction';

const LEGACY_TO_CANONICAL: Record<string, TeachingMethod> = {
  direct_instruction: 'direct_instruction',
  problem_based: 'problem_based',
  socratic: 'problem_based',
  project_based: 'problem_based',
};

export const TEACHING_METHOD_OPTIONS: { value: TeachingMethod; label: string }[] = [
  { value: 'direct_instruction', label: '개념 설명형' },
  { value: 'problem_based', label: '문제 해결형' },
];

export function normalizeTeachingMethod(method: string | null | undefined): TeachingMethod {
  const normalized = String(method || '').trim().toLowerCase();
  return LEGACY_TO_CANONICAL[normalized] || DEFAULT_TEACHING_METHOD;
}

export function getTeachingMethodLabel(method: string): string {
  const canonical = normalizeTeachingMethod(method);
  const found = TEACHING_METHOD_OPTIONS.find((item) => item.value === canonical);
  return found?.label ?? '기본 학습법';
}

export function getTeachingMethodGuideline(method: string): string {
  switch (normalizeTeachingMethod(method)) {
    case 'direct_instruction':
      return '개념 설명형: 핵심 개념을 먼저 정리하고, 이해 확인 문제로 바로 연결합니다.';
    case 'problem_based':
      return '문제 해결형: 문제를 먼저 제시한 뒤 풀이 전략과 오답 포인트를 중심으로 설명합니다.';
    default:
      return '개념 설명형: 핵심 개념을 먼저 정리하고, 이해 확인 문제로 바로 연결합니다.';
  }
}
