/**
 * ★ AI 레이어 진입점
 *
 * 모든 AI 호출은 FastAPI(remote) 단일 경로를 사용합니다.
 * actions / API route / 컴포넌트는 impl 파일을 직접 import하지 않습니다.
 */

import type {
  GenerateContentInput,
  GeneratedContentOutput,
  AIResult,
  SearchResult,
  ValidationResult,
  RecommendationsResult,
  AssessLevelInput,
  AssessmentQuestionsOutput,
  AnalyzeAnswersInput,
  LevelAssessmentResult,
  GenerateCurriculumInput,
  CurriculumOutput,
  RefineCurriculumInput,
  GenerateCurriculumContentInput,
  PedagogicalReasoningOutput,
  SectionedContentOutput,
} from './schemas';
import {
  remoteGenerate,
  remoteSearchRelevantDocs,
  remoteValidateContent,
  remoteGetRecommendations,
  remoteAssessLevel,
  remoteAnalyzeAnswers,
  remoteGenerateCurriculum,
  remoteRefineCurriculum,
  remoteGenerateReasoning,
  remoteGenerateSections,
} from './impl/remote';

export async function generateContent(
  params: GenerateContentInput
): Promise<AIResult<GeneratedContentOutput>> {
  return remoteGenerate(params);
}

export async function searchRelevantDocs(
  params: { query: string; language?: string; topK?: number }
): Promise<SearchResult> {
  return remoteSearchRelevantDocs(params);
}

export async function validateContent(
  params: { content: string; type: 'generated' | 'user' }
): Promise<ValidationResult> {
  return remoteValidateContent(params);
}

export async function getRecommendations(
  params: { userId: string; limit?: number }
): Promise<RecommendationsResult> {
  return remoteGetRecommendations(params);
}

// ==========================================
// Curriculum AI Functions
// ==========================================

export async function assessLevel(
  params: AssessLevelInput
): Promise<AIResult<AssessmentQuestionsOutput>> {
  return remoteAssessLevel(params);
}

export async function analyzeAnswers(
  params: AnalyzeAnswersInput
): Promise<AIResult<LevelAssessmentResult>> {
  return remoteAnalyzeAnswers(params);
}

export async function generateCurriculum(
  params: GenerateCurriculumInput
): Promise<AIResult<CurriculumOutput>> {
  return remoteGenerateCurriculum(params);
}

export async function refineCurriculum(
  params: RefineCurriculumInput
): Promise<AIResult<CurriculumOutput>> {
  return remoteRefineCurriculum(params);
}

// ==========================================
// v2: 분리된 2단계 콘텐츠 생성
// ==========================================

/** Phase 1: 교육적 추론 */
export async function generateReasoning(
  params: GenerateCurriculumContentInput
): Promise<AIResult<PedagogicalReasoningOutput>> {
  return remoteGenerateReasoning(params);
}

/** Phase 2: 섹션 콘텐츠 (rate limit 자동 재시도 포함) */
export async function generateSections(
  params: GenerateCurriculumContentInput,
  reasoning: PedagogicalReasoningOutput
): Promise<AIResult<SectionedContentOutput>> {
  return remoteGenerateSections(params, reasoning);
}
