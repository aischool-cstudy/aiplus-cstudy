export type ReviewProgressStatus = 'not_started' | 'in_progress' | 'completed' | null;

export interface ReviewAssessmentInput {
  progressStatus: ReviewProgressStatus;
  quizScore: number | null;
  daysSinceCreated: number;
  daysSinceLastStudy: number | null;
  lowScoreAttempts: number;
  understandingRating: number | null;
  unresolvedWrongCount: number;
}

export interface ReviewAssessmentOptions {
  detailedFactors?: boolean;
  understandingLabel?: string;
}

export interface ReviewAssessment {
  reviewScore: number;
  reviewLevel: 'urgent' | 'soon' | 'normal';
  needsReview: boolean;
  reviewReason: string | null;
  reviewFactors: string[];
}

function formatFactor(base: string, points: number, detailedFactors: boolean): string {
  return detailedFactors ? `${base}(+${points})` : base;
}

export function parseWrongQuestionIndexes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .map((value) => Math.round(value))
    )
  ).slice(0, 20);
}

export function diffDays(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

export function computeReviewAssessment(
  input: ReviewAssessmentInput,
  options?: ReviewAssessmentOptions
): ReviewAssessment {
  const detailedFactors = Boolean(options?.detailedFactors);
  const understandingLabel = String(options?.understandingLabel || '이해도');
  const factors: string[] = [];
  let score = 0;

  if (input.quizScore !== null) {
    if (input.quizScore < 50) {
      score += 35;
      factors.push(formatFactor(`퀴즈 점수 ${input.quizScore}점`, 35, detailedFactors));
    } else if (input.quizScore < 70) {
      score += 25;
      factors.push(formatFactor(`퀴즈 점수 ${input.quizScore}점`, 25, detailedFactors));
    } else if (input.quizScore < 85) {
      score += 10;
      factors.push(formatFactor(`퀴즈 점수 ${input.quizScore}점`, 10, detailedFactors));
    }
  }

  if (input.lowScoreAttempts > 1) {
    const attemptPenalty = Math.min(20, (input.lowScoreAttempts - 1) * 8);
    score += attemptPenalty;
    factors.push(formatFactor(`반복 오답 ${input.lowScoreAttempts}회`, attemptPenalty, detailedFactors));
  }

  if (input.progressStatus === 'in_progress' && input.daysSinceLastStudy !== null) {
    const stallPenalty = Math.min(30, input.daysSinceLastStudy * 6);
    score += stallPenalty;
    factors.push(formatFactor(`학습 중단 ${input.daysSinceLastStudy}일`, stallPenalty, detailedFactors));
  } else if (input.progressStatus === 'completed' && input.daysSinceLastStudy !== null) {
    const reviewPenalty = Math.min(28, Math.max(0, input.daysSinceLastStudy - 2) * 4);
    if (reviewPenalty > 0) {
      score += reviewPenalty;
      factors.push(formatFactor(`완료 후 경과 ${input.daysSinceLastStudy}일`, reviewPenalty, detailedFactors));
    }
  } else if (!input.progressStatus || input.progressStatus === 'not_started') {
    const untouchedPenalty = Math.min(25, Math.max(0, input.daysSinceCreated - 2) * 3);
    if (untouchedPenalty > 0) {
      score += untouchedPenalty;
      factors.push(formatFactor(`미학습 경과 ${input.daysSinceCreated}일`, untouchedPenalty, detailedFactors));
    }
  }

  if (typeof input.understandingRating === 'number') {
    if (input.understandingRating <= 2) {
      score += 20;
      factors.push(formatFactor(`${understandingLabel} ${input.understandingRating}/5`, 20, detailedFactors));
    } else if (input.understandingRating === 3) {
      score += 8;
      factors.push(formatFactor(`${understandingLabel} 3/5`, 8, detailedFactors));
    }
  }

  if (input.unresolvedWrongCount > 0) {
    const wrongQueuePenalty = Math.min(40, 15 + input.unresolvedWrongCount * 5);
    score += wrongQueuePenalty;
    factors.push(formatFactor(`미해결 오답 ${input.unresolvedWrongCount}문항`, wrongQueuePenalty, detailedFactors));
  }

  score = Math.min(100, Math.max(0, Math.round(score)));
  const reviewLevel: 'urgent' | 'soon' | 'normal' = score >= 70 ? 'urgent' : score >= 40 ? 'soon' : 'normal';
  const needsReview = score >= 40;
  const reviewReason = needsReview
    ? `복습 점수 ${score}점 · ${factors.slice(0, 2).join(', ')}`
    : null;

  return {
    reviewScore: score,
    reviewLevel,
    needsReview,
    reviewReason,
    reviewFactors: factors,
  };
}
