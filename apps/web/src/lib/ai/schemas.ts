import { z } from 'zod';
import { TEACHING_METHOD_VALUES } from './teaching-methods';
import type { ApiErrorCode } from '@aiplus/contracts';

// ==========================================
// AI Input / Output Schemas
// ==========================================

export const GenerateContentInputSchema = z.object({
  language: z.string().min(1, '프로그래밍 언어를 입력하세요'),
  topic: z.string().min(1, '주제를 입력하세요'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  targetAudience: z.string().min(1, '대상을 입력하세요'),
  teachingMethod: z.enum(TEACHING_METHOD_VALUES, '설명 방식을 선택하세요'),
  contentMode: z.enum(['lesson', 'quiz_only']).optional(),
  questionCount: z.coerce.number().int().min(3).max(20).optional(),
});

export type GenerateContentInput = z.infer<typeof GenerateContentInputSchema>;

export const CodeExampleSchema = z.object({
  title: z.string(),
  code: z.string(),
  explanation: z.string(),
  language: z.string(),
});

export const QuizQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2).max(5),
  correct_answer: z.number().min(0),
  explanation: z.string(),
});

export const GeneratedContentSchema = z.object({
  title: z.string(),
  content: z.string(),
  code_examples: z.array(CodeExampleSchema),
  quiz: z.array(QuizQuestionSchema).min(1).max(20),
});

export type GeneratedContentOutput = z.infer<typeof GeneratedContentSchema>;

export interface AICallMeta {
  gateway: 'fastapi';
  endpoint: string;
  provider: string;
  model: string;
  attemptCount: number;
  retried: boolean;
  status: number | null;
  errorCode?: ApiErrorCode | null;
  retryable?: boolean | null;
  fallbackUsed?: boolean | null;
  fallbackKind?: string | null;
}

export interface AIResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: AICallMeta;
}

export interface SearchResult {
  chunks: { text: string; source: string }[];
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export interface RecommendationItem {
  contentId: string;
  topicId?: string;
  reason: string;
}

export interface RecommendationsResult {
  items: RecommendationItem[];
}

// ==========================================
// Curriculum AI Schemas
// ==========================================

export const AssessmentQuestionSchema = z.object({
  id: z.number(),
  question: z.string(),
  options: z.array(z.string()).length(4),
  correct_answer: z.number().min(0).max(3),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topic_area: z.string(),
});

export const AIFallbackMetaSchema = z.object({
  fallback_used: z.boolean(),
  failure_kind: z.string().nullable(),
  attempt_count: z.number().int().min(1),
});

export const AssessmentQuestionsOutputSchema = z.object({
  questions: z.array(AssessmentQuestionSchema).min(5).max(10),
  meta: AIFallbackMetaSchema.optional(),
});

export type AssessmentQuestionsOutput = z.infer<typeof AssessmentQuestionsOutputSchema>;

export const LevelAssessmentResultSchema = z.object({
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
});

export type LevelAssessmentResult = z.infer<typeof LevelAssessmentResultSchema>;

export const CurriculumTopicSchema = z.object({
  title: z.string(),
  description: z.string(),
  estimated_minutes: z.number(),
});

export const CurriculumOutputSchema = z.object({
  title: z.string(),
  topics: z.array(CurriculumTopicSchema).min(3).max(30),
  total_estimated_hours: z.number(),
  summary: z.string(),
});

export type CurriculumOutput = z.infer<typeof CurriculumOutputSchema>;

// ==========================================
// v2: 교육적 추론 스키마 (Phase 1)
// ==========================================

export const PedagogicalReasoningSchema = z.object({
  learning_objectives: z.array(z.string()),
  prerequisite_concepts: z.array(z.string()),
  why_this_topic: z.string(),
  teaching_strategy: z.string(),
  difficulty_calibration: z.string(),
  connection_to_goal: z.string(),
});

export type PedagogicalReasoningOutput = z.infer<typeof PedagogicalReasoningSchema>;

// ==========================================
// v2: 섹션 기반 콘텐츠 스키마 (Phase 2)
// optional 없음 — Gemini 호환성을 위해 전부 required, 불필요 시 빈 문자열/배열 사용
// ==========================================

export const ContentSectionSchema = z.object({
  type: z.string(),
  title: z.string(),
  body: z.string(),
  code: z.string(),
  explanation: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  correct_answer: z.number(),
  next_preview: z.string(),
});

export const SectionedContentOutputSchema = z.object({
  title: z.string(),
  sections: z.array(ContentSectionSchema),
  meta: AIFallbackMetaSchema.optional(),
});

export type SectionedContentOutput = z.infer<typeof SectionedContentOutputSchema>;

// 합쳐진 최종 결과 (코드에서 사용)
export interface CurriculumContentOutput {
  title: string;
  reasoning: PedagogicalReasoningOutput;
  sections: z.infer<typeof ContentSectionSchema>[];
}

export interface AssessLevelInput {
  goal: string;
  background?: string;
  interests?: string[];
}

export interface AnalyzeAnswersInput {
  goal: string;
  questions: z.infer<typeof AssessmentQuestionSchema>[];
  answers: { question_id: number; selected: number }[];
}

export interface GenerateCurriculumInput {
  goal: string;
  level: string;
  strengths: string[];
  weaknesses: string[];
  background?: string;
  interests?: string[];
  teachingMethod?: string;
  goalType?: string;
  weeklyStudyHours?: number;
  learningStyle?: string;
}

export interface RefineCurriculumInput {
  currentCurriculum: CurriculumOutput;
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  userMessage: string;
}

export interface GenerateCurriculumContentInput {
  topic: string;
  topicDescription: string;
  curriculumGoal: string;
  learnerLevel: string;
  language: string;
  teachingMethod: string;
  prevTopics: string[];
  nextTopics: string[];
  learnerFeedback?: {
    understanding_rating: number;
    difficult_concepts: string[];
  }[];
  learnerConceptFocus?: {
    concept_tag: string;
    mastery_score: number;
    forgetting_risk: number;
    confidence_score: number;
  }[];
  learningStyle?: string;
}
