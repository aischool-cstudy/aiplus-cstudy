'use server';

import { createClient } from '@/lib/supabase/server';
import {
  generateCurriculum,
  refineCurriculum,
} from '@/lib/ai/client';
import { calculateSchedule } from '@/lib/schedule';
import { DEFAULT_TEACHING_METHOD, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';
import {
  classifyAIGenerationError,
  getUserFacingGenerationErrorMessage,
} from '@/lib/ai/errors';
import { createAIGenerationTraceId } from '@/lib/ai/trace-id';
import { acquireLock, createRequestLockKey, releaseLock } from '@/lib/runtime/request-lock';
import { clampScore, extractConceptTags, normalizeConceptTag } from '@/lib/curriculum/concept-signal';
import { generateCurriculumLearningContentPipeline } from '@/actions/curriculum-internal/learning-pipeline';
import {
  generateAssessmentQuestionsPipeline,
  submitAssessmentAndAnalyzePipeline,
} from '@/actions/curriculum-internal/assessment-pipeline';
import { insertAIGenerationLog } from './ai-logs';
import type {
  UserCurriculum,
  CurriculumItem,
  LevelAssessment,
} from '@/types';

function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function applyConceptStateSignal(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    conceptTags: string[];
    quizScore?: number | null;
    understandingRating?: number | null;
    difficultConcepts?: string[];
  }
) {
  if (params.conceptTags.length === 0) return;

  for (const conceptTag of params.conceptTags) {
    const { data: existing, error: readError } = await supabase
      .from('learner_concept_state')
      .select('*')
      .eq('user_id', params.userId)
      .eq('concept_tag', conceptTag)
      .single();

    if (readError && readError.message.includes('learner_concept_state')) {
      // 마이그레이션 전 하위 호환
      return;
    }

    const isNotFound = !existing;
    const row = isNotFound
      ? {
          mastery_score: 50,
          forgetting_risk: 10,
          confidence_score: 50,
          encounters: 0,
          correct_attempts: 0,
          wrong_attempts: 0,
        }
      : {
          mastery_score: Number(existing.mastery_score ?? 50),
          forgetting_risk: Number(existing.forgetting_risk ?? 10),
          confidence_score: Number(existing.confidence_score ?? 50),
          encounters: Number(existing.encounters ?? 0),
          correct_attempts: Number(existing.correct_attempts ?? 0),
          wrong_attempts: Number(existing.wrong_attempts ?? 0),
        };

    let masteryDelta = 0;
    let forgettingDelta = 0;
    let confidenceDelta = 0;
    let correctDelta = 0;
    let wrongDelta = 0;

    if (typeof params.quizScore === 'number') {
      if (params.quizScore < 50) {
        masteryDelta -= 20;
        forgettingDelta += 20;
        confidenceDelta -= 12;
        wrongDelta += 1;
      } else if (params.quizScore < 70) {
        masteryDelta -= 10;
        forgettingDelta += 12;
        confidenceDelta -= 6;
        wrongDelta += 1;
      } else if (params.quizScore < 85) {
        masteryDelta += 6;
        forgettingDelta -= 6;
        confidenceDelta += 5;
        correctDelta += 1;
      } else {
        masteryDelta += 12;
        forgettingDelta -= 12;
        confidenceDelta += 10;
        correctDelta += 1;
      }
    }

    if (typeof params.understandingRating === 'number') {
      if (params.understandingRating <= 2) {
        masteryDelta -= 12;
        forgettingDelta += 15;
        confidenceDelta -= 15;
      } else if (params.understandingRating === 3) {
        masteryDelta -= 4;
        forgettingDelta += 6;
        confidenceDelta -= 4;
      } else if (params.understandingRating >= 4) {
        masteryDelta += 8;
        forgettingDelta -= 6;
        confidenceDelta += 8;
      }
    }

    const difficultSet = new Set((params.difficultConcepts || []).map((item) => normalizeConceptTag(item)));
    if (difficultSet.has(conceptTag)) {
      masteryDelta -= 8;
      forgettingDelta += 10;
      confidenceDelta -= 8;
      wrongDelta += 1;
    }

    const payload = {
      user_id: params.userId,
      concept_tag: conceptTag,
      mastery_score: clampScore(row.mastery_score + masteryDelta),
      forgetting_risk: clampScore(row.forgetting_risk + forgettingDelta),
      confidence_score: clampScore(row.confidence_score + confidenceDelta),
      encounters: Math.max(0, row.encounters + 1),
      correct_attempts: Math.max(0, row.correct_attempts + correctDelta),
      wrong_attempts: Math.max(0, row.wrong_attempts + wrongDelta),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: writeError } = await supabase
      .from('learner_concept_state')
      .upsert(payload, { onConflict: 'user_id,concept_tag' });

    if (writeError && writeError.message.includes('learner_concept_state')) {
      return;
    }
  }
}

// ==========================================
// CRUD
// ==========================================

export async function getUserCurriculums(): Promise<UserCurriculum[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('user_curriculums')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  return (data || []) as UserCurriculum[];
}

export async function getCurriculum(id: string): Promise<UserCurriculum | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('user_curriculums')
    .select('*')
    .eq('id', id)
    .single();

  return data as UserCurriculum | null;
}

export async function getCurriculumItems(curriculumId: string): Promise<CurriculumItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('curriculum_items')
    .select('*')
    .eq('curriculum_id', curriculumId)
    .order('day_number')
    .order('order_in_day');

  return (data || []) as CurriculumItem[];
}

// ==========================================
// Step 1: 수준 진단 질문 생성
// ==========================================

export async function generateAssessmentQuestions(goal: string) {
  return generateAssessmentQuestionsPipeline(goal);
}

// ==========================================
// Step 2: 답변 분석 + 레벨 판정
// ==========================================

export async function submitAssessmentAndAnalyze(params: {
  goal: string;
  questions: Parameters<typeof submitAssessmentAndAnalyzePipeline>[0]['questions'];
  answers: Parameters<typeof submitAssessmentAndAnalyzePipeline>[0]['answers'];
}) {
  return submitAssessmentAndAnalyzePipeline(params);
}

// ==========================================
// Step 3: 커리큘럼 생성
// ==========================================

export async function generateNewCurriculum(params: {
  goal: string;
  level: string;
  strengths: string[];
  weaknesses: string[];
  teachingMethod?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };
  const startedAt = Date.now();
  const traceId = createAIGenerationTraceId('curriculum_generate');
  const lockKey = createRequestLockKey(user.id, 'curriculum_generate', {
    goal: params.goal,
    level: params.level,
    strengths: params.strengths,
    weaknesses: params.weaknesses,
  });

  if (!await acquireLock(lockKey, 30_000)) {
    return { error: `같은 요청이 처리 중입니다. 잠시 후 다시 시도해주세요. (traceId: ${traceId})` };
  }

  try {
    const { data: profile } = await supabase
      .from('learner_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const teachingMethod = normalizeTeachingMethod(
      params.teachingMethod || profile?.preferred_teaching_method || DEFAULT_TEACHING_METHOD
    );
    const goalType = profile?.goal_type || 'hobby';
    const weeklyStudyHours = typeof profile?.weekly_study_hours === 'number' ? profile.weekly_study_hours : 5;
    const learningStyle = profile?.learning_style || 'concept_first';

    await insertAIGenerationLog(supabase, {
      userId: user.id,
      pipeline: 'curriculum_generate',
      stage: 'start',
      status: 'started',
      traceId,
      metadata: {
        goal: params.goal,
        level: params.level,
        teachingMethod,
        goalType,
        weeklyStudyHours,
        learningStyle,
      },
    });

    const result = await generateCurriculum({
      ...params,
      teachingMethod,
      background: profile?.background || undefined,
      interests: profile?.interests || undefined,
      goalType,
      weeklyStudyHours,
      learningStyle,
    });

    if (!result.success || !result.data) {
      const errorCode = classifyAIGenerationError({
        errorCode: result.meta?.errorCode,
        legacyDetail: result.error,
      });
      await insertAIGenerationLog(supabase, {
        userId: user.id,
        pipeline: 'curriculum_generate',
        stage: 'generate',
        status: 'failed',
        traceId,
        aiCallMeta: result.meta,
        errorCode,
        errorMessage: result.error || null,
        latencyMs: Date.now() - startedAt,
        metadata: {
          goal: params.goal,
          level: params.level,
        },
      });
      const userMessage = getUserFacingGenerationErrorMessage(errorCode, result.error);
      return { error: `${userMessage} (traceId: ${traceId})` };
    }

    await insertAIGenerationLog(supabase, {
      userId: user.id,
      pipeline: 'curriculum_generate',
      stage: 'generate',
      status: 'success',
      traceId,
      aiCallMeta: result.meta,
      latencyMs: Date.now() - startedAt,
      metadata: {
        title: result.data.title,
        topicCount: result.data.topics.length,
        totalHours: result.data.total_estimated_hours,
      },
    });

    return { success: true, curriculum: result.data };
  } finally {
    await releaseLock(lockKey);
  }
}

// ==========================================
// Step 4: 대화로 조정
// ==========================================

export async function refineCurriculumChat(params: {
  currentCurriculum: {
    title: string;
    topics: { title: string; description: string; estimated_minutes: number }[];
    total_estimated_hours: number;
    summary: string;
  };
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  userMessage: string;
}) {
  const result = await refineCurriculum(params);

  if (!result.success || !result.data) {
    return { error: result.error || '커리큘럼 수정에 실패했습니다.' };
  }

  return { success: true, curriculum: result.data };
}

// ==========================================
// Step 5: 일정 배분 + DB 저장 + 활성화
// ==========================================

export async function finalizeCurriculum(params: {
  goal: string;
  level: string;
  teachingMethod: string;
  dailyStudyMinutes: number;
  curriculum: {
    title: string;
    topics: { title: string; description: string; estimated_minutes: number }[];
    total_estimated_hours: number;
    summary: string;
  };
  assessmentData?: {
    questions: LevelAssessment['questions'];
    answers: LevelAssessment['answers'];
  };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };
  const normalizedTeachingMethod = normalizeTeachingMethod(params.teachingMethod);

  // 알고리즘 기반 일정 배분 (AI 호출 없음)
  const scheduleResult = calculateSchedule(
    params.curriculum.topics.map(t => ({
      title: t.title,
      estimated_minutes: t.estimated_minutes,
    })),
    params.dailyStudyMinutes
  );

  // 커리큘럼 저장
  let { data: saved, error: saveError } = await supabase
    .from('user_curriculums')
    .insert({
      user_id: user.id,
      title: params.curriculum.title,
      goal: params.goal,
      assessed_level: params.level,
      teaching_method: normalizedTeachingMethod,
      status: 'active',
      total_days: scheduleResult.totalDays,
      start_date: getTodayLocalDateString(),
    })
    .select()
    .single();

  if (saveError && saveError.message.includes('teaching_method')) {
    const retry = await supabase
      .from('user_curriculums')
      .insert({
        user_id: user.id,
        title: params.curriculum.title,
        goal: params.goal,
        assessed_level: params.level,
        status: 'active',
        total_days: scheduleResult.totalDays,
        start_date: getTodayLocalDateString(),
      })
      .select()
      .single();
    saved = retry.data;
    saveError = retry.error;
  }

  if (saveError || !saved) {
    return { error: '커리큘럼 저장에 실패했습니다.' };
  }

  // 커리큘럼 아이템 저장
  const items = params.curriculum.topics.map((topic, idx) => {
    const scheduleItem = scheduleResult.schedule.find(s => s.topic_index === idx);
    return {
      curriculum_id: saved.id,
      title: topic.title,
      description: topic.description,
      day_number: scheduleItem?.day_number || idx + 1,
      order_in_day: scheduleItem?.order_in_day || 1,
      status: 'not_started',
    };
  });

  await supabase.from('curriculum_items').insert(items);

  // 진단 데이터 저장
  if (params.assessmentData) {
    await supabase.from('level_assessments').insert({
      user_id: user.id,
      curriculum_id: saved.id,
      goal: params.goal,
      questions: params.assessmentData.questions,
      answers: params.assessmentData.answers,
      assessed_level: params.level,
    });
  }

  return { success: true, curriculumId: saved.id };
}

// ==========================================
// v2: 교육적 추론 + 섹션 기반 콘텐츠 생성
// ==========================================

export async function generateCurriculumLearningContent(params: {
  itemId: string;
  curriculumId: string;
}) {
  return generateCurriculumLearningContentPipeline(params);
}

// ==========================================
// 학습 진행
// ==========================================

export async function updateCurriculumItemStatus(params: {
  itemId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  contentId?: string;
  quizScore?: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: existingItem } = await supabase
    .from('curriculum_items')
    .select('id, curriculum_id, content_id, title')
    .eq('id', params.itemId)
    .single();

  if (!existingItem) return { error: '학습 항목을 찾을 수 없습니다.' };

  const { data: ownCurriculum } = await supabase
    .from('user_curriculums')
    .select('id')
    .eq('id', existingItem.curriculum_id)
    .eq('user_id', user.id)
    .single();

  if (!ownCurriculum) return { error: '권한이 없습니다.' };

  const update: Record<string, unknown> = { status: params.status };
  if (params.status === 'completed') update.completed_at = new Date().toISOString();
  if (params.contentId) update.content_id = params.contentId;

  const { error } = await supabase
    .from('curriculum_items')
    .update(update)
    .eq('id', params.itemId);

  if (error) return { error: error.message };

  const progressContentId = params.contentId || existingItem.content_id || null;
  if (progressContentId) {
    await supabase
      .from('learning_progress')
      .insert({
        user_id: user.id,
        content_id: progressContentId,
        status: params.status,
        quiz_score: typeof params.quizScore === 'number' ? params.quizScore : null,
        completed_at: params.status === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });
  }

  if (params.status === 'completed') {
    await applyConceptStateSignal(supabase, {
      userId: user.id,
      conceptTags: extractConceptTags({ itemTitle: existingItem.title }),
      quizScore: typeof params.quizScore === 'number' ? params.quizScore : null,
    });
  }

  // 완료 시 → 커리큘럼 전체 완료 여부 체크
  if (params.status === 'completed') {
    const { data: item } = await supabase
      .from('curriculum_items')
      .select('curriculum_id')
      .eq('id', params.itemId)
      .single();

    if (item) {
      const { data: allItems } = await supabase
        .from('curriculum_items')
        .select('status')
        .eq('curriculum_id', item.curriculum_id);

      const allCompleted = allItems?.every(i => i.status === 'completed');
      if (allCompleted) {
        await supabase
          .from('user_curriculums')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', item.curriculum_id);
      }
    }
  }

  return { success: true };
}

export async function submitCurriculumLearningFeedback(params: {
  curriculumId: string;
  itemId: string;
  contentId: string;
  understandingRating: number;
  difficultConcepts: string[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const rating = Math.min(5, Math.max(1, Number(params.understandingRating) || 3));
  const difficultConcepts = Array.from(
    new Set(params.difficultConcepts.map((item) => item.trim()).filter(Boolean))
  ).slice(0, 10);

  const { data: ownCurriculum } = await supabase
    .from('user_curriculums')
    .select('id')
    .eq('id', params.curriculumId)
    .eq('user_id', user.id)
    .single();
  if (!ownCurriculum) return { error: '권한이 없습니다.' };

  const { data: itemRow } = await supabase
    .from('curriculum_items')
    .select('title')
    .eq('id', params.itemId)
    .single();

  const { error } = await supabase
    .from('learning_feedback')
    .insert({
      user_id: user.id,
      curriculum_id: params.curriculumId,
      item_id: params.itemId,
      content_id: params.contentId,
      understanding_rating: rating,
      difficult_concepts: difficultConcepts,
    });

  if (error && error.message.includes('learning_feedback')) {
    // 마이그레이션 전 하위 호환: 피드백 테이블이 없으면 UX를 막지 않음
    return { success: true };
  }

  if (error) return { error: error.message };

  const { error: progressError } = await supabase
    .from('learning_progress')
    .update({
      understanding_rating: rating,
      difficult_concepts: difficultConcepts,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('content_id', params.contentId);

  if (progressError && !/understanding_rating|difficult_concepts/.test(progressError.message)) {
    return { error: progressError.message };
  }

  await applyConceptStateSignal(supabase, {
    userId: user.id,
    conceptTags: extractConceptTags({
      itemTitle: itemRow?.title || null,
      difficultConcepts,
    }),
    understandingRating: rating,
    difficultConcepts,
  });

  return { success: true };
}

export async function submitCurriculumAssessmentAttempt(params: {
  curriculumId: string;
  itemId: string;
  contentId: string;
  attemptType: 'full' | 'wrong_only' | 'variant';
  totalQuestions: number;
  correctCount: number;
  wrongQuestionIndexes: number[];
  explanations: string[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: ownCurriculum } = await supabase
    .from('user_curriculums')
    .select('id')
    .eq('id', params.curriculumId)
    .eq('user_id', user.id)
    .single();
  if (!ownCurriculum) return { error: '권한이 없습니다.' };

  const { data: itemRow } = await supabase
    .from('curriculum_items')
    .select('title')
    .eq('id', params.itemId)
    .single();

  const totalQuestions = Math.max(0, Math.min(50, Math.round(Number(params.totalQuestions) || 0)));
  const correctCount = Math.max(0, Math.min(totalQuestions, Math.round(Number(params.correctCount) || 0)));
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const wrongQuestionIndexes = Array.from(
    new Set(
      (params.wrongQuestionIndexes || [])
        .map((n) => Math.max(0, Math.round(Number(n) || 0)))
    )
  ).slice(0, 20);
  const explanations = (params.explanations || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 20);

  const { error } = await supabase
    .from('assessment_attempts')
    .insert({
      user_id: user.id,
      curriculum_id: params.curriculumId,
      item_id: params.itemId,
      content_id: params.contentId,
      attempt_type: params.attemptType,
      total_questions: totalQuestions,
      correct_count: correctCount,
      score,
      wrong_question_indexes: wrongQuestionIndexes,
      explanations,
    });

  if (error && error.message.includes('assessment_attempts')) {
    // 마이그레이션 전 하위 호환
    return { success: true };
  }
  if (error) return { error: error.message };

  await applyConceptStateSignal(supabase, {
    userId: user.id,
    conceptTags: extractConceptTags({ itemTitle: itemRow?.title || null }),
    quizScore: score,
  });

  return { success: true };
}

export async function getCurriculumItem(itemId: string): Promise<CurriculumItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('curriculum_items')
    .select('*')
    .eq('id', itemId)
    .single();

  return data as CurriculumItem | null;
}

// ==========================================
// 커리큘럼 상태 관리
// ==========================================

export async function updateCurriculumStatus(
  curriculumId: string,
  status: 'active' | 'paused' | 'completed'
) {
  const supabase = await createClient();
  await supabase
    .from('user_curriculums')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', curriculumId);
}

export async function deleteCurriculum(curriculumId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  const { error } = await supabase
    .from('user_curriculums')
    .delete()
    .eq('id', curriculumId)
    .eq('user_id', user.id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
