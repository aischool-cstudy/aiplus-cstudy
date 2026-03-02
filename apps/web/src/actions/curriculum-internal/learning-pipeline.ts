'use server';

import { createClient } from '@/lib/supabase/server';
import { generateReasoning, generateSections } from '@/lib/ai/client';
import { createAIGenerationTraceId } from '@/lib/ai/trace-id';
import { classifyAIGenerationError, getUserFacingGenerationErrorMessage } from '@/lib/ai/errors';
import { DEFAULT_TEACHING_METHOD, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';
import {
  PedagogicalReasoningSchema,
  type PedagogicalReasoningOutput,
} from '@/lib/ai/schemas';
import { inferLanguageFromGoalAndInterests } from '@/lib/curriculum/language';
import { logger } from '@/lib/observability/logger';
import {
  cacheReasoningForItem,
  loadLearningGenerationContext,
  persistGeneratedCurriculumContent,
} from './learning-repository';
import { logLearningPipelineStage } from './learning-telemetry';

export async function generateCurriculumLearningContentPipeline(params: {
  itemId: string;
  curriculumId: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const requestStartedAt = Date.now();
  const traceId = createAIGenerationTraceId('curriculum_learning_generate');

  await logLearningPipelineStage(supabase, {
    userId: user.id,
    traceId,
    stage: 'start',
    status: 'started',
    metadata: {
      itemId: params.itemId,
      curriculumId: params.curriculumId,
    },
  });

  const loaded = await loadLearningGenerationContext(supabase, {
    userId: user.id,
    itemId: params.itemId,
    curriculumId: params.curriculumId,
  });
  if (!loaded.context) {
    return { error: loaded.error || '학습 컨텍스트를 불러오지 못했습니다.' };
  }

  const {
    item,
    curriculum,
    prevTopics,
    nextTopics,
    learner,
    recentFeedback,
    conceptFocus,
  } = loaded.context;

  const language = inferLanguageFromGoalAndInterests(curriculum.goal, learner?.interests || []);
  const startTime = Date.now();

  const selectedTeachingMethod = normalizeTeachingMethod(
    curriculum.teaching_method || learner?.preferred_teaching_method || DEFAULT_TEACHING_METHOD
  );
  const aiInput = {
    topic: item.title,
    topicDescription: item.description || '',
    curriculumGoal: curriculum.goal,
    learnerLevel: learner?.level || curriculum.assessed_level,
    language,
    teachingMethod: selectedTeachingMethod,
    prevTopics,
    nextTopics,
    learningStyle: learner?.learning_style || 'concept_first',
    learnerFeedback: recentFeedback.length > 0 ? recentFeedback : undefined,
    learnerConceptFocus: conceptFocus.length > 0 ? conceptFocus : undefined,
  };

  const cachedReasoning = PedagogicalReasoningSchema.safeParse(item.cached_reasoning);
  let reasoning: PedagogicalReasoningOutput | null = cachedReasoning.success
    ? cachedReasoning.data
    : null;

  if (item.cached_reasoning && !cachedReasoning.success) {
    logger.warn('[generateContent] cached_reasoning schema mismatch; regenerating reasoning');
  }

  if (reasoning) {
    logger.debug('[generateContent] phase1 cache hit');
    await logLearningPipelineStage(supabase, {
      userId: user.id,
      traceId,
      stage: 'reasoning_cache_hit',
      status: 'success',
      metadata: { itemId: params.itemId },
    });
  } else {
    logger.debug(`[generateContent] phase1 start topic="${item.title}"`);
    const reasoningStartedAt = Date.now();
    await logLearningPipelineStage(supabase, {
      userId: user.id,
      traceId,
      stage: 'reasoning',
      status: 'started',
      metadata: { itemId: params.itemId },
    });

    const reasoningResult = await generateReasoning(aiInput);
    if (!reasoningResult.success || !reasoningResult.data) {
      const errorCode = classifyAIGenerationError({
        errorCode: reasoningResult.meta?.errorCode,
        legacyDetail: reasoningResult.error,
      });
      await logLearningPipelineStage(supabase, {
        userId: user.id,
        traceId,
        stage: 'reasoning',
        status: 'failed',
        aiCallMeta: reasoningResult.meta,
        errorCode,
        errorMessage: reasoningResult.error || null,
        latencyMs: Date.now() - reasoningStartedAt,
        metadata: { itemId: params.itemId },
      });
      return { error: getUserFacingGenerationErrorMessage(errorCode, reasoningResult.error) };
    }

    reasoning = reasoningResult.data;
    await cacheReasoningForItem(supabase, params.itemId, reasoning);

    logger.debug('[generateContent] phase1 complete and cached');
    await logLearningPipelineStage(supabase, {
      userId: user.id,
      traceId,
      stage: 'reasoning',
      status: 'success',
      aiCallMeta: reasoningResult.meta,
      latencyMs: Date.now() - reasoningStartedAt,
      metadata: { itemId: params.itemId },
    });
  }

  logger.debug('[generateContent] phase2 sections start');
  const sectionsStartedAt = Date.now();
  await logLearningPipelineStage(supabase, {
    userId: user.id,
    traceId,
    stage: 'sections',
    status: 'started',
    metadata: {
      itemId: params.itemId,
      curriculumId: params.curriculumId,
    },
  });

  if (!reasoning) {
    return { error: '추론 데이터가 비어 있습니다. 잠시 후 다시 시도해주세요.' };
  }

  const sectionsResult = await generateSections(aiInput, reasoning);
  if (!sectionsResult.success || !sectionsResult.data) {
    logger.error('[generateContent] phase2 sections failed', sectionsResult.error);
    const errorCode = classifyAIGenerationError({
      errorCode: sectionsResult.meta?.errorCode,
      legacyDetail: sectionsResult.error,
    });
    await logLearningPipelineStage(supabase, {
      userId: user.id,
      traceId,
      stage: 'sections',
      status: 'failed',
      aiCallMeta: sectionsResult.meta,
      errorCode,
      errorMessage: sectionsResult.error || null,
      latencyMs: Date.now() - sectionsStartedAt,
      metadata: { itemId: params.itemId },
    });
    const userMessage = getUserFacingGenerationErrorMessage(errorCode, sectionsResult.error);
    return { error: `${userMessage} (추론은 캐싱되어 빠르게 재시도됩니다.)` };
  }

  logger.debug(`[generateContent] phase2 sections complete totalAiMs=${Date.now() - startTime}`);
  await logLearningPipelineStage(supabase, {
    userId: user.id,
    traceId,
    stage: 'sections',
    status: 'success',
    aiCallMeta: sectionsResult.meta,
    latencyMs: Date.now() - sectionsStartedAt,
    metadata: {
      itemId: params.itemId,
      sectionCount: sectionsResult.data.sections.length,
    },
  });

  const persisted = await persistGeneratedCurriculumContent(supabase, {
    userId: user.id,
    itemId: params.itemId,
    language,
    topic: item.title,
    learnerLevel: learner?.level || curriculum.assessed_level,
    targetAudience: curriculum.goal,
    teachingMethod: selectedTeachingMethod,
    title: sectionsResult.data.title,
    sections: sectionsResult.data.sections,
    reasoning,
  });

  if (!persisted.contentId) {
    logger.error('[generateContent] db persist failed', persisted.dbErrorMessage);
    await logLearningPipelineStage(supabase, {
      userId: user.id,
      traceId,
      stage: 'save',
      status: 'failed',
      errorCode: 'db_error',
      errorMessage: persisted.dbErrorMessage || 'unknown db error',
      metadata: { itemId: params.itemId },
    });
    return { error: '콘텐츠 저장에 실패했습니다.' };
  }

  logger.info(`[generateContent] complete contentId=${persisted.contentId} totalMs=${Date.now() - startTime}`);
  await logLearningPipelineStage(supabase, {
    userId: user.id,
    traceId,
    stage: 'complete',
    status: 'success',
    latencyMs: Date.now() - requestStartedAt,
    metadata: {
      itemId: params.itemId,
      curriculumId: params.curriculumId,
      contentId: persisted.contentId,
    },
  });

  return { success: true, contentId: persisted.contentId };
}
