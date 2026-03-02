'use server';

import { createClient } from '@/lib/supabase/server';
import type { GeneratedContent, Course, Topic, HistoryContentItem, QuizQuestion } from '@/types';
import {
  computeReviewAssessment,
  diffDays,
  parseWrongQuestionIndexes,
} from '@/lib/review/assessment';

export async function getContent(contentId: string): Promise<GeneratedContent | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('generated_contents')
    .select('*')
    .eq('id', contentId)
    .single();

  return data as GeneratedContent | null;
}

export async function getUserContents(userId: string): Promise<GeneratedContent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('generated_contents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return (data || []) as GeneratedContent[];
}

type AssessmentAttemptType = 'full' | 'wrong_only' | 'variant';

export interface WrongReviewQueueQuestion {
  contentId: string;
  contentTitle: string;
  topic: string;
  language: string;
  difficulty: string;
  teachingMethod: string | null;
  questionIndex: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export async function submitContentAssessmentAttempt(params: {
  contentId: string;
  attemptType: AssessmentAttemptType;
  totalQuestions: number;
  correctCount: number;
  wrongQuestionIndexes: number[];
  explanations: string[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: ownContent } = await supabase
    .from('generated_contents')
    .select('id')
    .eq('id', params.contentId)
    .eq('user_id', user.id)
    .single();
  if (!ownContent) return { error: '권한이 없습니다.' };

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
      content_id: params.contentId,
      attempt_type: params.attemptType,
      total_questions: totalQuestions,
      correct_count: correctCount,
      score,
      wrong_question_indexes: wrongQuestionIndexes,
      explanations,
    });

  if (error && error.message.includes('assessment_attempts')) {
    // 마이그레이션 적용 전 하위 호환
    return { success: true };
  }
  if (error) return { error: error.message };

  return { success: true };
}

export async function getWrongReviewQueue(userId: string): Promise<WrongReviewQueueQuestion[]> {
  const historyRows = await getUserHistoryContents(userId);
  const prioritizedContents = historyRows
    .filter((item) => item.unresolved_wrong_count > 0 && item.unresolved_wrong_indexes.length > 0)
    .sort((a, b) => (
      b.review_score - a.review_score
      || b.unresolved_wrong_count - a.unresolved_wrong_count
      || Number(new Date(b.last_assessment_at || b.created_at)) - Number(new Date(a.last_assessment_at || a.created_at))
    ));

  const questions: WrongReviewQueueQuestion[] = [];
  for (const content of prioritizedContents) {
    const quiz = Array.isArray(content.quiz) ? (content.quiz as QuizQuestion[]) : [];
    if (quiz.length === 0) continue;

    const wrongIndexes = parseWrongQuestionIndexes(content.unresolved_wrong_indexes);
    for (const questionIndex of wrongIndexes) {
      const question = quiz[questionIndex];
      if (!question || !Array.isArray(question.options) || question.options.length < 2) continue;
      const correctAnswer = Number(question.correct_answer);
      if (!Number.isFinite(correctAnswer) || correctAnswer < 0 || correctAnswer >= question.options.length) continue;

      questions.push({
        contentId: content.id,
        contentTitle: content.title,
        topic: content.topic,
        language: content.language,
        difficulty: content.difficulty,
        teachingMethod: content.teaching_method || null,
        questionIndex,
        question: String(question.question || '').trim(),
        options: question.options.map((item) => String(item ?? '').trim()),
        correctAnswer: Math.round(correctAnswer),
        explanation: String(question.explanation || '').trim(),
      });
    }
  }

  return questions;
}

export async function getUserHistoryContents(userId: string): Promise<HistoryContentItem[]> {
  const supabase = await createClient();
  const now = new Date();

  const { data: contents } = await supabase
    .from('generated_contents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const contentRows = (contents || []) as GeneratedContent[];
  if (contentRows.length === 0) return [];

  const ids = contentRows.map((c) => c.id);
  const { data: curriculumItemRows } = await supabase
    .from('curriculum_items')
    .select('content_id, curriculum_id, day_number, order_in_day')
    .in('content_id', ids);

  const curriculumRowsNormalized = (curriculumItemRows || [])
    .map((row) => ({
      contentId: row.content_id ? String(row.content_id) : null,
      curriculumId: row.curriculum_id ? String(row.curriculum_id) : null,
      dayNumber: Number(row.day_number),
      orderInDay: Number(row.order_in_day),
    }))
    .filter((row) => row.contentId && row.curriculumId)
    .sort((a, b) => (
      (Number.isFinite(a.dayNumber) ? a.dayNumber : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(b.dayNumber) ? b.dayNumber : Number.MAX_SAFE_INTEGER)
      || (Number.isFinite(a.orderInDay) ? a.orderInDay : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(b.orderInDay) ? b.orderInDay : Number.MAX_SAFE_INTEGER)
    ));

  const curriculumIds = Array.from(new Set(curriculumRowsNormalized.map((row) => row.curriculumId as string)));
  let curriculumTitleById = new Map<string, string>();
  if (curriculumIds.length > 0) {
    const { data: ownCurriculums } = await supabase
      .from('user_curriculums')
      .select('id, title')
      .eq('user_id', userId)
      .in('id', curriculumIds);
    curriculumTitleById = new Map(
      (ownCurriculums || [])
        .map((row) => [String(row.id), String(row.title || '')])
        .filter((row): row is [string, string] => Boolean(row[0]))
    );
  }

  const contentSessionById = new Map<string, {
    curriculumId: string;
    curriculumTitle: string | null;
    dayNumber: number | null;
    orderInDay: number | null;
  }>();
  for (const row of curriculumRowsNormalized) {
    const contentId = row.contentId as string;
    const curriculumId = row.curriculumId as string;
    const curriculumTitle = curriculumTitleById.get(curriculumId);
    if (!curriculumTitle) continue;
    if (contentSessionById.has(contentId)) continue;

    contentSessionById.set(contentId, {
      curriculumId,
      curriculumTitle,
      dayNumber: Number.isFinite(row.dayNumber) ? Math.max(1, Math.round(row.dayNumber)) : null,
      orderInDay: Number.isFinite(row.orderInDay) ? Math.max(1, Math.round(row.orderInDay)) : null,
    });
  }

  const { data: progressRows } = await supabase
    .from('learning_progress')
    .select('content_id, status, quiz_score, updated_at')
    .eq('user_id', userId)
    .in('content_id', ids)
    .order('updated_at', { ascending: false });

  const byContent = new Map<string, {
    status: 'not_started' | 'in_progress' | 'completed';
    quiz_score: number | null;
    updated_at: string;
    low_score_attempts: number;
  }>();

  for (const row of progressRows || []) {
    const contentId = row.content_id as string | null;
    if (!contentId) continue;

    const existing = byContent.get(contentId);
    const quizScore = typeof row.quiz_score === 'number' ? row.quiz_score : null;
    if (!existing) {
      byContent.set(contentId, {
        status: row.status as 'not_started' | 'in_progress' | 'completed',
        quiz_score: quizScore,
        updated_at: String(row.updated_at),
        low_score_attempts: quizScore !== null && quizScore < 70 ? 1 : 0,
      });
      continue;
    }

    if (quizScore !== null && quizScore < 70) {
      existing.low_score_attempts += 1;
    }
  }

  let latestFeedbackByContent = new Map<string, { understanding_rating: number | null }>();
  const { data: feedbackRows, error: feedbackError } = await supabase
    .from('learning_feedback')
    .select('content_id, understanding_rating, created_at')
    .eq('user_id', userId)
    .in('content_id', ids)
    .order('created_at', { ascending: false });

  if (!feedbackError && feedbackRows) {
    latestFeedbackByContent = new Map<string, { understanding_rating: number | null }>();
    for (const row of feedbackRows) {
      const contentId = row.content_id as string | null;
      if (!contentId || latestFeedbackByContent.has(contentId)) continue;
      latestFeedbackByContent.set(contentId, {
        understanding_rating: typeof row.understanding_rating === 'number' ? row.understanding_rating : null,
      });
    }
  }

  const latestAttemptByContent = new Map<string, {
    created_at: string;
    attempt_type: AssessmentAttemptType;
    wrong_question_indexes: number[];
  }>();
  const { data: attemptRows, error: attemptsError } = await supabase
    .from('assessment_attempts')
    .select('content_id, attempt_type, wrong_question_indexes, created_at')
    .eq('user_id', userId)
    .in('content_id', ids)
    .order('created_at', { ascending: false });

  if (!attemptsError && attemptRows) {
    for (const row of attemptRows) {
      const contentId = row.content_id as string | null;
      if (!contentId || latestAttemptByContent.has(contentId)) continue;
      const attemptType = String(row.attempt_type || 'full');
      const normalizedAttemptType: AssessmentAttemptType = (
        attemptType === 'wrong_only' || attemptType === 'variant' ? attemptType : 'full'
      );
      latestAttemptByContent.set(contentId, {
        created_at: String(row.created_at),
        attempt_type: normalizedAttemptType,
        wrong_question_indexes: parseWrongQuestionIndexes(row.wrong_question_indexes),
      });
    }
  }

  return contentRows.map((content) => {
    const progress = byContent.get(content.id);
    const feedback = latestFeedbackByContent.get(content.id);
    const latestAttempt = latestAttemptByContent.get(content.id);
    const sessionContext = contentSessionById.get(content.id);
    const unresolvedWrongIndexes = latestAttempt?.wrong_question_indexes || [];
    const unresolvedWrongCount = unresolvedWrongIndexes.length;
    const createdAt = new Date(content.created_at);
    const daysSinceCreated = diffDays(createdAt, now);
    const lastStudyAt = progress?.updated_at || null;
    const daysSinceLastStudy = lastStudyAt ? diffDays(new Date(lastStudyAt), now) : null;
    const review = computeReviewAssessment(
      {
        progressStatus: progress?.status || null,
        quizScore: progress?.quiz_score ?? null,
        daysSinceCreated,
        daysSinceLastStudy,
        lowScoreAttempts: progress?.low_score_attempts || 0,
        understandingRating: feedback?.understanding_rating ?? null,
        unresolvedWrongCount,
      },
      {
        detailedFactors: true,
        understandingLabel: '자기 이해도',
      }
    );

    return {
      ...content,
      progress_status: progress?.status || null,
      quiz_score: progress?.quiz_score ?? null,
      last_studied_at: lastStudyAt,
      last_assessment_at: latestAttempt?.created_at || null,
      last_assessment_type: latestAttempt?.attempt_type || null,
      session_source: sessionContext ? 'curriculum' : 'standalone',
      curriculum_id: sessionContext?.curriculumId || null,
      curriculum_title: sessionContext?.curriculumTitle || null,
      curriculum_day_number: sessionContext?.dayNumber ?? null,
      curriculum_order_in_day: sessionContext?.orderInDay ?? null,
      unresolved_wrong_count: unresolvedWrongCount,
      unresolved_wrong_indexes: unresolvedWrongIndexes,
      needs_review: review.needsReview,
      review_reason: review.reviewReason,
      review_score: review.reviewScore,
      review_level: review.reviewLevel,
      review_factors: review.reviewFactors,
      days_since_created: daysSinceCreated,
    };
  });
}

export async function getHistoryContent(contentId: string, userId: string): Promise<HistoryContentItem | null> {
  const rows = await getUserHistoryContents(userId);
  return rows.find((row) => row.id === contentId) || null;
}

export async function getCourses(): Promise<Course[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('courses')
    .select('*')
    .order('order');

  return (data || []) as Course[];
}

export async function getCourseTopics(courseId: string): Promise<Topic[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('topics')
    .select('*')
    .eq('course_id', courseId)
    .order('order');

  return (data || []) as Topic[];
}

export async function getTopicById(topicId: string): Promise<Topic | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('topics')
    .select('*')
    .eq('id', topicId)
    .single();

  return data as Topic | null;
}

export async function getTopicContent(topicId: string, userId?: string): Promise<GeneratedContent | null> {
  const supabase = await createClient();
  
  // 1. topic에 연결된 content_id 확인
  const { data: topic } = await supabase
    .from('topics')
    .select('content_id, title')
    .eq('id', topicId)
    .single();

  if (topic?.content_id) {
    const { data: content } = await supabase
      .from('generated_contents')
      .select('*')
      .eq('id', topic.content_id)
      .single();
    if (content) return content as GeneratedContent;
  }

  // 2. fallback: 같은 사용자가 같은 주제로 생성한 콘텐츠 검색
  if (userId && topic?.title) {
    const { data: fallback } = await supabase
      .from('generated_contents')
      .select('*')
      .eq('user_id', userId)
      .eq('topic', topic.title)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (fallback) return fallback as GeneratedContent;
  }

  return null;
}
