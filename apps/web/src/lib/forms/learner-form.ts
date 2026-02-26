import { z } from 'zod';
import {
  DIFFICULTY_VALUES,
  GOAL_TYPE_VALUES,
  LEARNING_STYLE_VALUES,
  WEEKLY_STUDY_HOURS,
  type DifficultyValue,
  type GoalTypeValue,
  type LearningStyleValue,
} from '@/lib/constants/options';
import { DEFAULT_ASSISTANT_PERSONA, isAssistantPersona, type AssistantPersona } from '@/lib/ai/personas';
import { DEFAULT_TEACHING_METHOD, normalizeTeachingMethod, type TeachingMethod } from '@/lib/ai/teaching-methods';

const DIFFICULTY_SET = new Set<string>(DIFFICULTY_VALUES);
const GOAL_TYPE_SET = new Set<string>(GOAL_TYPE_VALUES);
const LEARNING_STYLE_SET = new Set<string>(LEARNING_STYLE_VALUES);

export function getString(formData: FormData, key: string, fallback = ''): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : fallback;
}

export function getOptionalString(formData: FormData, key: string): string | null {
  const value = getString(formData, key, '');
  return value.length > 0 ? value : null;
}

function getStringArray(formData: FormData, key: string): string[] {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
}

export interface ParsedLearnerFormData {
  name: string | null;
  goal: string | null;
  background: string | null;
  level: DifficultyValue;
  preferredTeachingMethod: TeachingMethod;
  goalType: GoalTypeValue | null;
  weeklyStudyHours: number;
  learningStyle: LearningStyleValue;
  assistantPersona: AssistantPersona;
  interests: string[];
}

export function parseLearnerFormData(formData: FormData): ParsedLearnerFormData {
  const rawLevel = getString(formData, 'level', 'beginner');
  const level = DIFFICULTY_SET.has(rawLevel)
    ? rawLevel as DifficultyValue
    : 'beginner';

  const rawGoalType = getString(formData, 'goalType', '');
  const goalType = GOAL_TYPE_SET.has(rawGoalType)
    ? rawGoalType as GoalTypeValue
    : null;

  const rawLearningStyle = getString(formData, 'learningStyle', 'concept_first');
  const learningStyle = LEARNING_STYLE_SET.has(rawLearningStyle)
    ? rawLearningStyle as LearningStyleValue
    : 'concept_first';

  const rawWeeklyHours = Number.parseInt(getString(formData, 'weeklyStudyHours', String(WEEKLY_STUDY_HOURS.defaultValue)), 10);
  const weeklyStudyHours = Number.isFinite(rawWeeklyHours)
    ? Math.min(WEEKLY_STUDY_HOURS.max, Math.max(WEEKLY_STUDY_HOURS.min, rawWeeklyHours))
    : WEEKLY_STUDY_HOURS.defaultValue;

  const rawPersona = getString(formData, 'assistantPersona', DEFAULT_ASSISTANT_PERSONA);
  const assistantPersona = isAssistantPersona(rawPersona)
    ? rawPersona
    : DEFAULT_ASSISTANT_PERSONA;

  return {
    name: getOptionalString(formData, 'name'),
    goal: getOptionalString(formData, 'goal'),
    background: getOptionalString(formData, 'background'),
    level,
    preferredTeachingMethod: normalizeTeachingMethod(getString(formData, 'preferredTeachingMethod', DEFAULT_TEACHING_METHOD)),
    goalType,
    weeklyStudyHours,
    learningStyle,
    assistantPersona,
    interests: getStringArray(formData, 'interests'),
  };
}

const BaseLearnerInputSchema = z.object({
  name: z.string().trim().min(1).nullable(),
  goal: z.string().trim().min(1).nullable(),
  background: z.string().trim().nullable(),
  level: z.enum(DIFFICULTY_VALUES),
  preferredTeachingMethod: z.string().trim().min(1),
  goalType: z.enum(GOAL_TYPE_VALUES).nullable(),
  weeklyStudyHours: z.number().int().min(WEEKLY_STUDY_HOURS.min).max(WEEKLY_STUDY_HOURS.max),
  learningStyle: z.enum(LEARNING_STYLE_VALUES),
  assistantPersona: z.enum(['coach', 'mate']),
  interests: z.array(z.string().trim().min(1)).max(20),
});

export const OnboardingLearnerInputSchema = BaseLearnerInputSchema.superRefine((value, ctx) => {
  if (!value.name) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '이름 또는 닉네임을 입력해주세요.', path: ['name'] });
  }
  if (!value.goal) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '학습 목표를 입력해주세요.', path: ['goal'] });
  }
});

export const SettingsLearnerInputSchema = BaseLearnerInputSchema;
