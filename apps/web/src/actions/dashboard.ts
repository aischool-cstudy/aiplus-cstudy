'use server';

import { createClient } from '@/lib/supabase/server';
import {
  computeReviewAssessment,
  diffDays,
  parseWrongQuestionIndexes,
} from '@/lib/review/assessment';

const DASHBOARD_REVIEW_SAMPLE_SIZE = 30;
const DASHBOARD_RECENT_CONTENT_LIMIT = 3;
const DASHBOARD_REVIEW_CANDIDATE_LIMIT = 5;

interface DashboardContentRow {
  id: string;
  title: string;
  language: string;
  difficulty: string;
  created_at: string;
}

export interface DashboardRecentContent {
  id: string;
  title: string;
  language: string;
  difficulty: string;
  created_at: string;
}

export interface DashboardReviewCandidate {
  id: string;
  title: string;
  review_score: number;
  review_reason: string | null;
  review_factors: string[];
}

export interface DashboardSnapshot {
  recentContents: DashboardRecentContent[];
  reviewCandidates: DashboardReviewCandidate[];
}

export async function getDashboardSnapshot(userId: string): Promise<DashboardSnapshot> {
  const supabase = await createClient();
  const now = new Date();

  const { data: contents } = await supabase
    .from('generated_contents')
    .select('id, title, language, difficulty, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(DASHBOARD_REVIEW_SAMPLE_SIZE);

  const contentRows = (contents || []) as DashboardContentRow[];
  if (contentRows.length === 0) {
    return {
      recentContents: [],
      reviewCandidates: [],
    };
  }

  const ids = contentRows.map((content) => content.id);
  const recentContents = contentRows
    .slice(0, DASHBOARD_RECENT_CONTENT_LIMIT)
    .map((content) => ({
      id: content.id,
      title: content.title,
      language: content.language,
      difficulty: content.difficulty,
      created_at: content.created_at,
    }));

  const [{ data: progressRows }, { data: feedbackRows, error: feedbackError }, { data: attemptRows, error: attemptError }] = await Promise.all([
    supabase
      .from('learning_progress')
      .select('content_id, status, quiz_score, updated_at')
      .eq('user_id', userId)
      .in('content_id', ids)
      .order('updated_at', { ascending: false }),
    supabase
      .from('learning_feedback')
      .select('content_id, understanding_rating, created_at')
      .eq('user_id', userId)
      .in('content_id', ids)
      .order('created_at', { ascending: false }),
    supabase
      .from('assessment_attempts')
      .select('content_id, wrong_question_indexes, created_at')
      .eq('user_id', userId)
      .in('content_id', ids)
      .order('created_at', { ascending: false }),
  ]);

  const progressByContent = new Map<string, {
    status: 'not_started' | 'in_progress' | 'completed';
    quizScore: number | null;
    updatedAt: string;
    lowScoreAttempts: number;
  }>();

  for (const row of progressRows || []) {
    const contentId = row.content_id ? String(row.content_id) : '';
    if (!contentId) continue;

    const quizScore = typeof row.quiz_score === 'number' ? row.quiz_score : null;
    const existing = progressByContent.get(contentId);
    if (!existing) {
      progressByContent.set(contentId, {
        status: row.status as 'not_started' | 'in_progress' | 'completed',
        quizScore,
        updatedAt: String(row.updated_at),
        lowScoreAttempts: quizScore !== null && quizScore < 70 ? 1 : 0,
      });
      continue;
    }

    if (quizScore !== null && quizScore < 70) {
      existing.lowScoreAttempts += 1;
    }
  }

  const latestFeedbackByContent = new Map<string, { understandingRating: number | null }>();
  if (!feedbackError && feedbackRows) {
    for (const row of feedbackRows) {
      const contentId = row.content_id ? String(row.content_id) : '';
      if (!contentId || latestFeedbackByContent.has(contentId)) continue;
      latestFeedbackByContent.set(contentId, {
        understandingRating: typeof row.understanding_rating === 'number'
          ? row.understanding_rating
          : null,
      });
    }
  }

  const latestAttemptByContent = new Map<string, { unresolvedWrongIndexes: number[] }>();
  if (!attemptError && attemptRows) {
    for (const row of attemptRows) {
      const contentId = row.content_id ? String(row.content_id) : '';
      if (!contentId || latestAttemptByContent.has(contentId)) continue;
      latestAttemptByContent.set(contentId, {
        unresolvedWrongIndexes: parseWrongQuestionIndexes(row.wrong_question_indexes),
      });
    }
  }

  const reviewCandidates = contentRows
    .map((content) => {
      const progress = progressByContent.get(content.id);
      const feedback = latestFeedbackByContent.get(content.id);
      const latestAttempt = latestAttemptByContent.get(content.id);
      const unresolvedWrongCount = latestAttempt?.unresolvedWrongIndexes.length || 0;

      const createdAt = new Date(content.created_at);
      const daysSinceCreated = diffDays(createdAt, now);
      const daysSinceLastStudy = progress?.updatedAt
        ? diffDays(new Date(progress.updatedAt), now)
        : null;

      const review = computeReviewAssessment({
        progressStatus: progress?.status || null,
        quizScore: progress?.quizScore ?? null,
        daysSinceCreated,
        daysSinceLastStudy,
        lowScoreAttempts: progress?.lowScoreAttempts || 0,
        understandingRating: feedback?.understandingRating ?? null,
        unresolvedWrongCount,
      });

      return {
        id: content.id,
        title: content.title,
        review_score: review.reviewScore,
        review_reason: review.reviewReason,
        review_factors: review.reviewFactors,
        needs_review: review.needsReview,
      };
    })
    .filter((item) => item.needs_review)
    .sort((a, b) => b.review_score - a.review_score)
    .slice(0, DASHBOARD_REVIEW_CANDIDATE_LIMIT)
    .map((item) => ({
      id: item.id,
      title: item.title,
      review_score: item.review_score,
      review_reason: item.review_reason,
      review_factors: item.review_factors,
    }));

  return {
    recentContents,
    reviewCandidates,
  };
}
