'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { submitContentAssessmentAttempt, type WrongReviewQueueQuestion } from '@/actions/content';
import { getTeachingMethodLabel } from '@/lib/ai/teaching-methods';
import { sanitizeQuizOptions } from '@/lib/quiz/options';

interface WrongReviewSessionProps {
  questions: WrongReviewQueueQuestion[];
}

function questionKey(question: WrongReviewQueueQuestion): string {
  return `${question.contentId}:${question.questionIndex}`;
}

export function WrongReviewSession({ questions }: WrongReviewSessionProps) {
  const allQuestionKeys = useMemo(() => questions.map(questionKey), [questions]);
  const questionByKey = useMemo(
    () => new Map(questions.map((question) => [questionKey(question), question])),
    [questions]
  );

  const [activeQuestionKeys, setActiveQuestionKeys] = useState<string[]>(allQuestionKeys);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeQuestions = useMemo(
    () => activeQuestionKeys
      .map((key) => questionByKey.get(key))
      .filter((question): question is WrongReviewQueueQuestion => Boolean(question)),
    [activeQuestionKeys, questionByKey]
  );
  const isAnswerComplete = activeQuestions.length > 0
    && activeQuestions.every((question) => answers[questionKey(question)] !== undefined);

  if (questions.length === 0) {
    return (
      <div className="px-4 md:px-8 py-12 max-w-4xl">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg font-semibold">오답 복습 큐가 비어 있습니다.</p>
            <p className="text-sm text-muted-foreground mt-2">
              퀴즈를 먼저 풀면 나중에 여기서 오답만 모아 복습할 수 있습니다.
            </p>
            <div className="mt-4">
              <Link href="/history">
                <Button variant="secondary">기록으로 돌아가기</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleSubmit() {
    if (!isAnswerComplete || saving || activeQuestions.length === 0) return;
    setSubmitError(null);

    const grouped = new Map<string, {
      totalQuestions: number;
      correctCount: number;
      wrongQuestionIndexes: number[];
      explanations: string[];
    }>();

    let correctTotal = 0;
    for (const question of activeQuestions) {
      const key = questionKey(question);
      const selected = answers[key];
      const correct = selected === question.correctAnswer;

      const bucket = grouped.get(question.contentId) || {
        totalQuestions: 0,
        correctCount: 0,
        wrongQuestionIndexes: [],
        explanations: [],
      };
      bucket.totalQuestions += 1;
      if (correct) {
        bucket.correctCount += 1;
        correctTotal += 1;
      } else {
        bucket.wrongQuestionIndexes.push(question.questionIndex);
      }
      if (question.explanation) {
        bucket.explanations.push(question.explanation);
      }
      grouped.set(question.contentId, bucket);
    }

    setSaving(true);
    const entries = Array.from(grouped.entries());
    const results = await Promise.all(
      entries.map(async ([contentId, payload]) => submitContentAssessmentAttempt({
        contentId,
        attemptType: 'wrong_only',
        totalQuestions: payload.totalQuestions,
        correctCount: payload.correctCount,
        wrongQuestionIndexes: payload.wrongQuestionIndexes,
        explanations: payload.explanations,
      }))
    );
    setSaving(false);

    const firstError = results.find((result) => result?.error)?.error;
    if (firstError) {
      setSubmitError(`복습 기록 저장 실패: ${firstError}`);
      return;
    }

    setSubmitted(true);
    setScore(Math.round((correctTotal / activeQuestions.length) * 100));
  }

  function handleRetryAll() {
    setActiveQuestionKeys(allQuestionKeys);
    setAnswers({});
    setSubmitted(false);
    setScore(null);
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl">
      <Link
        href="/history"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        기록으로 돌아가기
      </Link>

      <Card className="mb-6 border-warning/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <CardTitle className="text-base">복습 세션</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            현재 {activeQuestions.length}문항을 복습합니다. 제출하면 콘텐츠별 오답 큐가 갱신됩니다.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6">
          {submitError && (
            <div className="rounded-lg bg-error/10 text-error text-sm p-3">
              {submitError}
            </div>
          )}
          {activeQuestions.map((question, index) => {
            const key = questionKey(question);
            const displayOptions = sanitizeQuizOptions(question.options, question.question, question.explanation);
            return (
              <div key={key} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="primary">{question.language}</Badge>
                  <Badge>{question.difficulty}</Badge>
                  {question.teachingMethod && (
                    <Badge>{getTeachingMethodLabel(question.teachingMethod)}</Badge>
                  )}
                  <Link href={`/history/${question.contentId}`} className="ml-auto text-xs text-primary hover:underline">
                    {question.contentTitle}
                  </Link>
                </div>
                <p className="font-medium">{index + 1}. {question.question}</p>
                <div className="space-y-2">
                  {displayOptions.map((option, optionIndex) => {
                    const selected = answers[key] === optionIndex;
                    const isCorrect = question.correctAnswer === optionIndex;
                    let optionClass = 'border-border hover:border-primary/30';
                    if (submitted) {
                      if (isCorrect) optionClass = 'border-success bg-success/5';
                      else if (selected && !isCorrect) optionClass = 'border-error bg-error/5';
                    } else if (selected) {
                      optionClass = 'border-primary bg-primary/5';
                    }

                    return (
                      <button
                        key={optionIndex}
                        type="button"
                        disabled={submitted}
                        onClick={() => setAnswers((prev) => ({ ...prev, [key]: optionIndex }))}
                        className={`w-full rounded-lg border p-3 text-left text-sm transition-all ${optionClass}`}
                      >
                        <div className="flex items-center gap-2">
                          {submitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />}
                          {submitted && selected && !isCorrect && <XCircle className="w-4 h-4 text-error flex-shrink-0" />}
                          <span>{option}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {submitted && question.explanation && (
                  <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{question.explanation}</p>
                )}
              </div>
            );
          })}

          {!submitted ? (
            <Button
              onClick={handleSubmit}
              disabled={!isAnswerComplete || saving}
            >
              {saving ? '복습 결과 저장 중...' : '제출하기'}
            </Button>
          ) : (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-lg font-semibold">점수: {score}점</p>
              <p className="text-sm text-muted-foreground mt-1">
                제출 결과가 반영되었습니다. 다음에도 전용 세션에서 한 번에 다시 복습할 수 있습니다.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleRetryAll}>
                  전체 다시 풀기
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
