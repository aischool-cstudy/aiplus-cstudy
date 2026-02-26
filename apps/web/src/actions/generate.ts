'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateContent } from '@/lib/ai/client';
import { GenerateContentInputSchema } from '@/lib/ai/schemas';
import { DEFAULT_TEACHING_METHOD, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';
import {
  classifyAIGenerationError,
  getUserFacingGenerationErrorMessage,
} from '@/lib/ai/errors';
import { createAIGenerationTraceId } from '@/lib/ai/trace-id';
import { QUIZ_QUESTION_COUNT } from '@/lib/constants/options';
import { insertAIGenerationLog } from './ai-logs';

export async function generateAndSaveContent(formData: FormData) {
  const supabase = await createClient();
  const requestStartedAt = Date.now();

  // 인증 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }
  const traceId = createAIGenerationTraceId('content_generate');

  const contentModeRaw = String(formData.get('contentMode') || '').trim().toLowerCase();
  const normalizedContentMode = contentModeRaw === 'quiz_only' ? 'quiz_only' : 'lesson';
  const questionCountRaw = Number(formData.get('questionCount'));
  const normalizedQuestionCount = Number.isFinite(questionCountRaw)
    ? Math.max(QUIZ_QUESTION_COUNT.min, Math.min(QUIZ_QUESTION_COUNT.max, Math.round(questionCountRaw)))
    : QUIZ_QUESTION_COUNT.defaultValue;

  // 입력 파싱 & 검증
  const rawInput = {
    language: formData.get('language') as string,
    topic: formData.get('topic') as string,
    difficulty: formData.get('difficulty') as string,
    targetAudience: formData.get('targetAudience') as string,
    teachingMethod: normalizeTeachingMethod((formData.get('teachingMethod') as string) || DEFAULT_TEACHING_METHOD),
    contentMode: normalizedContentMode,
    questionCount: normalizedQuestionCount,
  };

  const parsed = GenerateContentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    await insertAIGenerationLog(supabase, {
      userId: user.id,
      pipeline: 'content_generate',
      stage: 'validate_input',
      status: 'failed',
      traceId,
      errorCode: 'provider_error',
      errorMessage: parsed.error.issues.map((e) => e.message).join(', '),
    });
    return { error: parsed.error.issues.map((e) => e.message).join(', ') };
  }

  await insertAIGenerationLog(supabase, {
    userId: user.id,
    pipeline: 'content_generate',
    stage: 'generate_start',
    status: 'started',
    traceId,
    metadata: {
      language: parsed.data.language,
      topic: parsed.data.topic,
      difficulty: parsed.data.difficulty,
      teachingMethod: parsed.data.teachingMethod,
      contentMode: parsed.data.contentMode || 'lesson',
      questionCount: parsed.data.questionCount || QUIZ_QUESTION_COUNT.defaultValue,
    },
  });

  // AI 생성 (client 경유)
  const generateStartedAt = Date.now();
  const result = await generateContent(parsed.data);
  if (!result.success || !result.data) {
    const errorCode = classifyAIGenerationError({
      errorCode: result.meta?.errorCode,
      legacyDetail: result.error,
    });
    await insertAIGenerationLog(supabase, {
      userId: user.id,
      pipeline: 'content_generate',
      stage: 'generate',
      status: 'failed',
      traceId,
      aiCallMeta: result.meta,
      errorCode,
      errorMessage: result.error || null,
      latencyMs: Date.now() - generateStartedAt,
      metadata: {
        language: parsed.data.language,
        topic: parsed.data.topic,
      },
    });
    return { error: getUserFacingGenerationErrorMessage(errorCode, result.error) };
  }

  await insertAIGenerationLog(supabase, {
    userId: user.id,
    pipeline: 'content_generate',
    stage: 'generate',
    status: 'success',
    traceId,
    aiCallMeta: result.meta,
    latencyMs: Date.now() - generateStartedAt,
    metadata: {
      title: result.data.title,
      quizCount: result.data.quiz.length,
      codeExampleCount: result.data.code_examples.length,
      contentMode: parsed.data.contentMode || 'lesson',
    },
  });

  // DB 저장
  const contentMode = parsed.data.contentMode || 'lesson';
  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    content_kind: contentMode === 'quiz_only' ? 'practice_set' : 'lesson',
    language: parsed.data.language,
    topic: parsed.data.topic,
    difficulty: parsed.data.difficulty,
    target_audience: parsed.data.targetAudience,
    teaching_method: parsed.data.teachingMethod,
    title: result.data.title,
    content: result.data.content,
    code_examples: result.data.code_examples,
    quiz: result.data.quiz,
  };

  const payloadToInsert = { ...insertPayload };
  let saved: { id: string } | null = null;
  let saveError: { message: string } | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await supabase
      .from('generated_contents')
      .insert(payloadToInsert)
      .select()
      .single();

    saved = response.data as { id: string } | null;
    saveError = response.error as { message: string } | null;
    if (!saveError) break;

    if (saveError.message.includes('teaching_method') && 'teaching_method' in payloadToInsert) {
      delete payloadToInsert.teaching_method;
      continue;
    }
    if (saveError.message.includes('content_kind') && 'content_kind' in payloadToInsert) {
      delete payloadToInsert.content_kind;
      continue;
    }
    break;
  }

  if (saveError) {
    await insertAIGenerationLog(supabase, {
      userId: user.id,
      pipeline: 'content_generate',
      stage: 'save',
      status: 'failed',
      traceId,
      errorCode: 'db_error',
      errorMessage: saveError.message,
      metadata: {
        topic: parsed.data.topic,
        contentMode,
      },
    });
    return { error: '콘텐츠 저장에 실패했습니다.' };
  }
  if (!saved?.id) {
    return { error: '콘텐츠 저장 결과를 확인하지 못했습니다.' };
  }

  // 토픽에 콘텐츠 연결 (topicId가 있으면) — RLS 우회 필요
  const topicId = formData.get('topicId') as string | null;
  if (topicId && saved.id) {
    const adminClient = createAdminClient();
    await adminClient
      .from('topics')
      .update({ content_id: saved.id })
      .eq('id', topicId);
  }

  await insertAIGenerationLog(supabase, {
    userId: user.id,
    pipeline: 'content_generate',
    stage: 'complete',
    status: 'success',
    traceId,
    latencyMs: Date.now() - requestStartedAt,
    metadata: {
      contentId: saved.id,
      topicId: topicId || null,
      contentMode,
    },
  });

  return { success: true, contentId: saved.id };
}
