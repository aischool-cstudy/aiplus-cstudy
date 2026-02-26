'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { submitContentAssessmentAttempt } from '@/actions/content';
import {
  BookOpen,
  Code2,
  HelpCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { HistoryContentItem, QuizQuestion } from '@/types';
import { DEFAULT_TEACHING_METHOD, getTeachingMethodLabel, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';
import { sanitizeQuizOptions } from '@/lib/quiz/options';

interface ContentDetailProps {
  content: HistoryContentItem;
}

const difficultyLabels: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
};

export function ContentDetail({ content }: ContentDetailProps) {
  const quiz = content.quiz as QuizQuestion[] | undefined;
  const isPracticeSet = content.content_kind === 'practice_set';
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [latestWrongIndexes, setLatestWrongIndexes] = useState<number[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const quizIndexes = useMemo(
    () => (quiz ? quiz.map((_, idx) => idx) : []),
    [quiz]
  );

  const isQuizAnswerComplete = quizIndexes.length > 0
    && quizIndexes.every((idx) => quizAnswers[idx] !== undefined);

  async function handleSubmitQuiz() {
    if (!quiz || quizIndexes.length === 0 || savingAttempt) return;
    setSaveError(null);
    let correct = 0;
    const wrongIndexes: number[] = [];
    quizIndexes.forEach((idx) => {
      const question = quiz[idx];
      if (!question || quizAnswers[idx] !== question.correct_answer) {
        wrongIndexes.push(idx);
        return;
      }
      correct += 1;
    });

    const score = Math.round((correct / quizIndexes.length) * 100);
    setQuizScore(score);
    setQuizSubmitted(true);
    setLatestWrongIndexes(wrongIndexes);

    setSavingAttempt(true);
    const result = await submitContentAssessmentAttempt({
      contentId: content.id,
      attemptType: 'full',
      totalQuestions: quizIndexes.length,
      correctCount: correct,
      wrongQuestionIndexes: wrongIndexes,
      explanations: quizIndexes
        .map((idx, order) => {
          const question = quiz[idx];
          if (!question?.explanation) return null;
          return `${order + 1}. ${question.explanation}`;
        })
        .filter((value): value is string => Boolean(value)),
    });
    setSavingAttempt(false);

    if (result.error) {
      setSaveError(`복습 기록 저장 실패: ${result.error}`);
    }
  }

  function handleRetryFullQuiz() {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
  }

  const regenerateQuery = new URLSearchParams({
    language: content.language,
    topic: content.topic,
    difficulty: content.difficulty,
    targetAudience: content.target_audience || '프로그래밍 학습자',
    teachingMethod: normalizeTeachingMethod(content.teaching_method || DEFAULT_TEACHING_METHOD),
    contentMode: 'quiz_only',
    questionCount: String(Math.max(5, Math.min(12, quiz?.length || 8))),
  }).toString();

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl">
      {/* Back link */}
      <Link
        href="/history"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        기록으로 돌아가기
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="primary">{content.language}</Badge>
          <Badge>{difficultyLabels[content.difficulty] || content.difficulty}</Badge>
          {content.teaching_method && (
            <Badge>{getTeachingMethodLabel(content.teaching_method)}</Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold">{content.title}</h1>
        {content.target_audience && (
          <p className="text-sm text-muted-foreground mt-1">
            {isPracticeSet ? '이 문제 세트는 ' : '이 콘텐츠는 '}
            <span className="text-primary font-medium">{content.target_audience}</span>
            {' '}맞춤 {isPracticeSet ? '문제' : '설명'}입니다.
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {new Date(content.created_at).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
        {content.review_reason && (
          <p className="text-xs text-warning mt-2">{content.review_reason}</p>
        )}
        {content.review_factors.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            근거: {content.review_factors.slice(0, 3).join(', ')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Link href={`/generate?${regenerateQuery}`}>
          <Button variant="secondary">
            이 주제로 문제 세트 생성
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
        <Link href="/curriculum">
          <Button variant="ghost">커리큘럼에서 이어서 학습</Button>
        </Link>
      </div>

      {/* Content */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">학습 내용</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Markdown content={content.content} />
        </CardContent>
      </Card>

      {/* Code examples */}
      {content.code_examples && content.code_examples.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">코드 예제</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {content.code_examples.map((example, idx) => (
              <div key={idx}>
                <h4 className="font-medium mb-2">{example.title}</h4>
                <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono">
                  <code>{example.code}</code>
                </pre>
                <p className="text-sm text-muted-foreground mt-2">{example.explanation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quiz */}
      {quiz && quiz.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">퀴즈</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {saveError && (
              <div className="mb-4 rounded-lg bg-error/10 text-error text-sm p-3">
                {saveError}
              </div>
            )}
            <div className="space-y-6">
              {quizIndexes.map((questionIdx, visibleIdx) => {
                const q = quiz[questionIdx];
                if (!q) return null;
                const displayOptions = sanitizeQuizOptions(q.options, q.question, q.explanation);

                return (
                <div key={questionIdx} className="space-y-3">
                  <p className="font-medium">{visibleIdx + 1}. {q.question}</p>
                  <div className="space-y-2">
                    {displayOptions.map((opt, oIdx) => {
                      const selected = quizAnswers[questionIdx] === oIdx;
                      const isCorrect = q.correct_answer === oIdx;
                      let optClass = 'border-border hover:border-primary/30';

                      if (quizSubmitted) {
                        if (isCorrect) optClass = 'border-success bg-success/5';
                        else if (selected && !isCorrect) optClass = 'border-error bg-error/5';
                      } else if (selected) {
                        optClass = 'border-primary bg-primary/5';
                      }

                      return (
                        <button
                          key={oIdx}
                          type="button"
                          disabled={quizSubmitted}
                          onClick={() => setQuizAnswers({ ...quizAnswers, [questionIdx]: oIdx })}
                          className={`w-full p-3 rounded-lg border text-left text-sm transition-all ${optClass}`}
                        >
                          <div className="flex items-center gap-2">
                            {quizSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />}
                            {quizSubmitted && selected && !isCorrect && <XCircle className="w-4 h-4 text-error flex-shrink-0" />}
                            <span>{opt}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {quizSubmitted && (
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                      {q.explanation}
                    </p>
                  )}
                </div>
              );
              })}
            </div>

            {!quizSubmitted ? (
              <Button
                onClick={handleSubmitQuiz}
                className="mt-6"
                disabled={!isQuizAnswerComplete || savingAttempt}
              >
                {savingAttempt ? '기록 저장 중...' : '제출하기'}
              </Button>
            ) : (
              <div className="mt-6 p-4 rounded-lg bg-muted">
                <p className="font-medium text-lg">점수: {quizScore}점</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {latestWrongIndexes.length > 0
                    ? `오답 ${latestWrongIndexes.length}문항이 남았습니다.`
                    : '이번 세트의 오답을 모두 해결했습니다.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={handleRetryFullQuiz} variant="secondary" size="sm">
                    전체 다시 풀기
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
