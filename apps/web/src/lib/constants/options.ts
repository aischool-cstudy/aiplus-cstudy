export const DIFFICULTY_VALUES = ['beginner', 'intermediate', 'advanced'] as const;
export type DifficultyValue = (typeof DIFFICULTY_VALUES)[number];

export const DIFFICULTY_OPTIONS: Array<{ value: DifficultyValue; label: string }> = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
];

export const GOAL_TYPE_VALUES = ['job', 'work', 'hobby', 'project'] as const;
export type GoalTypeValue = (typeof GOAL_TYPE_VALUES)[number];

export const GOAL_TYPE_OPTIONS: Array<{ value: GoalTypeValue; label: string }> = [
  { value: 'job', label: '취업 준비' },
  { value: 'work', label: '실무 역량 강화' },
  { value: 'hobby', label: '취미/교양' },
  { value: 'project', label: '프로젝트 완성' },
];

export const LEARNING_STYLE_VALUES = ['concept_first', 'problem_solving', 'project_building'] as const;
export type LearningStyleValue = (typeof LEARNING_STYLE_VALUES)[number];

export const LEARNING_STYLE_OPTIONS: Array<{ value: LearningStyleValue; label: string }> = [
  { value: 'concept_first', label: '개념→실습 순차형' },
  { value: 'problem_solving', label: '짧은 문제 반복형' },
  { value: 'project_building', label: '결과물 누적형' },
];

export const LANGUAGE_VALUES = [
  'Python',
  'JavaScript',
  'TypeScript',
  'Java',
  'C++',
  'Go',
  'Rust',
  'Swift',
  'Kotlin',
  'SQL',
] as const;
export type LanguageValue = (typeof LANGUAGE_VALUES)[number];

export const LANGUAGE_OPTIONS: Array<{ value: LanguageValue; label: string }> = LANGUAGE_VALUES.map((language) => ({
  value: language,
  label: language,
}));

export const QUIZ_QUESTION_COUNT = {
  min: 3,
  max: 20,
  defaultValue: 8,
  regenerateMin: 5,
  regenerateMax: 12,
} as const;

export const WEEKLY_STUDY_HOURS = {
  min: 1,
  max: 80,
  defaultValue: 5,
} as const;

export const ONBOARDING_MIN_GOAL_LENGTH = 8;

export const DEFAULT_TARGET_AUDIENCE_BY_LEVEL: Record<DifficultyValue, string> = {
  beginner: '프로그래밍 초보자',
  intermediate: '프로그래밍 기본기를 갖춘 중급 학습자',
  advanced: '실무 경험이 있는 개발자',
};
