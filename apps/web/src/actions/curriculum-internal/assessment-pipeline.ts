'use server';

import { createClient } from '@/lib/supabase/server';
import { assessLevel, analyzeAnswers } from '@/lib/ai/client';
import { classifyAIGenerationError, getUserFacingGenerationErrorMessage } from '@/lib/ai/errors';
import { createAIGenerationTraceId } from '@/lib/ai/trace-id';
import { acquireLock, createRequestLockKey, releaseLock } from '@/lib/runtime/request-lock';
import { logger } from '@/lib/observability/logger';
import type { LevelAssessment } from '@/types';
import { insertAIGenerationLog } from '@/actions/ai-logs';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AIGenerationLogPayload = Parameters<typeof insertAIGenerationLog>[1];

function insertAIGenerationLogAsync(
  supabase: SupabaseServerClient,
  input: AIGenerationLogPayload
) {
  void insertAIGenerationLog(supabase, input).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[ai_generation_logs] async insert failed', message);
  });
}

export async function generateAssessmentQuestionsPipeline(goal: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };
  const startedAt = Date.now();
  const traceId = createAIGenerationTraceId('assessment_questions');
  const lockKey = createRequestLockKey(user.id, 'assessment_questions', { goal: goal.trim() });

  if (!await acquireLock(lockKey, 30_000)) {
    return { error: `같은 요청이 처리 중입니다. 잠시 후 다시 시도해주세요. (traceId: ${traceId})` };
  }

  try {
    await insertAIGenerationLog(supabase, {
      userId: user.id,
      pipeline: 'assessment_questions',
      stage: 'start',
      status: 'started',
      traceId,
      metadata: { goal },
    });

    const { data: profile } = await supabase
      .from('learner_profiles')
      .select('background, interests')
      .eq('user_id', user.id)
      .single();

    const result = await assessLevel({
      goal,
      background: profile?.background || undefined,
      interests: profile?.interests || undefined,
    });

    if (!result.success || !result.data) {
      const errorCode = classifyAIGenerationError({
        errorCode: result.meta?.errorCode,
        legacyDetail: result.error,
      });
      await insertAIGenerationLog(supabase, {
        userId: user.id,
        pipeline: 'assessment_questions',
        stage: 'generate',
        status: 'failed',
        traceId,
        aiCallMeta: result.meta,
        errorCode,
        errorMessage: result.error || null,
        latencyMs: Date.now() - startedAt,
        metadata: { goal },
      });
      const userMessage = getUserFacingGenerationErrorMessage(errorCode, result.error);
      return { error: `${userMessage} (traceId: ${traceId})` };
    }

    await insertAIGenerationLog(supabase, {
      userId: user.id,
      pipeline: 'assessment_questions',
      stage: 'generate',
      status: 'success',
      traceId,
      aiCallMeta: result.meta,
      latencyMs: Date.now() - startedAt,
      metadata: {
        goal,
        questionCount: result.data.questions.length,
      },
    });

    return { success: true, questions: result.data.questions };
  } finally {
    await releaseLock(lockKey);
  }
}

export async function submitAssessmentAndAnalyzePipeline(params: {
  goal: string;
  questions: LevelAssessment['questions'];
  answers: { question_id: number; selected: number }[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };
  const startedAt = Date.now();
  const traceId = createAIGenerationTraceId('assessment_analysis');

  insertAIGenerationLogAsync(supabase, {
    userId: user.id,
    pipeline: 'assessment_analysis',
    stage: 'start',
    status: 'started',
    traceId,
    metadata: {
      goal: params.goal,
      questionCount: params.questions.length,
      answerCount: params.answers.length,
    },
  });

  const result = await analyzeAnswers({
    goal: params.goal,
    questions: params.questions,
    answers: params.answers,
  });

  if (!result.success || !result.data) {
    const errorCode = classifyAIGenerationError({
      errorCode: result.meta?.errorCode,
      legacyDetail: result.error,
    });
    insertAIGenerationLogAsync(supabase, {
      userId: user.id,
      pipeline: 'assessment_analysis',
      stage: 'analyze',
      status: 'failed',
      traceId,
      aiCallMeta: result.meta,
      errorCode,
      errorMessage: result.error || null,
      latencyMs: Date.now() - startedAt,
    });
    return { error: getUserFacingGenerationErrorMessage(errorCode, result.error) };
  }

  insertAIGenerationLogAsync(supabase, {
    userId: user.id,
    pipeline: 'assessment_analysis',
    stage: 'analyze',
    status: 'success',
    traceId,
    aiCallMeta: result.meta,
    latencyMs: Date.now() - startedAt,
    metadata: {
      assessedLevel: result.data.level,
      weaknessCount: result.data.weaknesses.length,
      strengthCount: result.data.strengths.length,
    },
  });

  return { success: true, assessment: result.data };
}
