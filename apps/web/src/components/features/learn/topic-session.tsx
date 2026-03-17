'use client';

import { useState } from 'react';
import Link from 'next/link';
import { updateProgress } from '@/actions/progress';
import { generateAndSaveContent } from '@/actions/generate';
import { submitContentAssessmentAttempt } from '@/actions/content';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/markdown';
import { DEFAULT_TEACHING_METHOD, getTeachingMethodLabel, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';
import { sanitizeQuizOptions } from '@/lib/quiz/options';
import { CLIENT_ACTION_TIMEOUT_MS, withTimeoutOrError } from '@/lib/runtime/timeout';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Sparkles,
  BookOpen,
  Code2,
  HelpCircle,
} from 'lucide-react';
import type { Topic, GeneratedContent, LearningProgress, QuizQuestion } from '@/types';

interface TopicSessionProps {
  topic: Topic;
  content: GeneratedContent | null;
  progress: LearningProgress | null;
  userId: string;
  nextTopic: { id: string; title: string } | null;
  learnerLevel: string;
  learnerInterests: string[];
  learnerPreferredTeachingMethod?: string | null;
}

export function TopicSession({
  topic,
  content,
  progress,
  userId,
  nextTopic,
  learnerLevel,
  learnerInterests,
  learnerPreferredTeachingMethod,
}: TopicSessionProps) {
  const [generating, setGenerating] = useState(false);
  const [generatedContent] = useState<GeneratedContent | null>(content);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [currentStatus, setCurrentStatus] = useState(progress?.status || 'not_started');
  const [actionError, setActionError] = useState<string | null>(null);

  const quiz = generatedContent?.quiz as QuizQuestion[] | undefined;
  const codeExamples = generatedContent?.code_examples as {
    title: string;
    code: string;
    explanation: string;
    language: string;
  }[] | undefined;

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setActionError(null);

    try {
      const language = learnerInterests[0] || 'Python';
      const difficulty = learnerLevel || 'beginner';
      const audienceMap: Record<string, string> = {
        beginner: '프로그래밍 초보자',
        intermediate: '프로그래밍 기본기를 갖춘 중급 학습자',
        advanced: '실무 경험이 있는 개발자',
      };

      const formData = new FormData();
      formData.set('language', language);
      formData.set('topic', topic.title);
      formData.set('difficulty', difficulty);
      formData.set('targetAudience', audienceMap[difficulty] || '프로그래밍 학습자');
      formData.set('teachingMethod', normalizeTeachingMethod(learnerPreferredTeachingMethod || DEFAULT_TEACHING_METHOD));
      formData.set('topicId', topic.id);

      const result = await withTimeoutOrError(
        generateAndSaveContent(formData),
        CLIENT_ACTION_TIMEOUT_MS,
        new Error('client_action_timeout')
      );
      if (result.contentId) {
        if ('topicLinked' in result && result.topicLinked === false) {
          window.location.href = `/history/${result.contentId}`;
          return;
        }
        // 페이지를 리로드하여 새 콘텐츠 반영
        window.location.reload();
        return;
      }
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setActionError('콘텐츠 생성 결과를 확인하지 못했습니다. 다시 시도해주세요.');
    } catch (error) {
      if (error instanceof Error && error.message === 'client_action_timeout') {
        setActionError('요청 응답이 지연되고 있습니다. 생성이 완료됐을 수 있으니 기록에서 먼저 확인해주세요.');
      } else {
        setActionError('콘텐츠 생성 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleStartLearning() {
    await updateProgress({
      userId,
      topicId: topic.id,
      contentId: generatedContent?.id,
      status: 'in_progress',
    });
    setCurrentStatus('in_progress');
  }

  async function handleSubmitQuiz() {
    if (!quiz || !generatedContent) return;

    let correct = 0;
    const wrongIndexes: number[] = [];
    quiz.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correct_answer) {
        correct++;
      } else {
        wrongIndexes.push(idx);
      }
    });

    const score = Math.round((correct / quiz.length) * 100);
    setQuizScore(score);
    setQuizSubmitted(true);

    await updateProgress({
      userId,
      topicId: topic.id,
      contentId: generatedContent?.id,
      status: 'completed',
      quizScore: score,
    });
    await submitContentAssessmentAttempt({
      contentId: generatedContent.id,
      attemptType: 'full',
      totalQuestions: quiz.length,
      correctCount: correct,
      wrongQuestionIndexes: wrongIndexes,
      explanations: quiz
        .map((question, order) => {
          if (!question.explanation) return null;
          return `${order + 1}. ${question.explanation}`;
        })
        .filter((value): value is string => Boolean(value)),
    });
    setCurrentStatus('completed');
  }

  // 콘텐츠가 없을 때
  if (!generatedContent) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl">
        <Card>
          <CardContent className="text-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{topic.title}</h2>
            <p className="text-muted-foreground mb-6">
              이 토픽의 학습 콘텐츠가 아직 없습니다. AI로 생성해보세요!
            </p>
            <Button onClick={handleGenerate} loading={generating} size="lg">
              <Sparkles className="w-4 h-4 mr-2" />
              AI로 콘텐츠 생성하기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl">
      {/* Topic header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="primary">{generatedContent.language}</Badge>
          <Badge>{generatedContent.difficulty}</Badge>
          {currentStatus === 'completed' && (
            <Badge variant="success">완료</Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold">{generatedContent.title}</h1>
        {generatedContent.target_audience && (
          <p className="text-sm text-muted-foreground mt-1">
            이 콘텐츠는 <span className="text-primary font-medium">{generatedContent.target_audience}</span> 맞춤 설명입니다.
          </p>
        )}
        {generatedContent.teaching_method && (
          <p className="text-sm text-muted-foreground mt-1">
            설명 방식: <span className="text-primary font-medium">{getTeachingMethodLabel(generatedContent.teaching_method)}</span>
          </p>
        )}
      </div>

      {/* Start learning button */}
      {actionError && (
        <div className="mb-4 rounded-lg bg-error/10 text-error text-sm p-3">
          {actionError}
        </div>
      )}
      {currentStatus === 'not_started' && (
        <div className="mb-6">
          <Button onClick={handleStartLearning}>
            학습 시작하기
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Content */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">학습 내용</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Markdown content={generatedContent.content} />
        </CardContent>
      </Card>

      {/* Code examples */}
      {codeExamples && codeExamples.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">코드 예제</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {codeExamples.map((example, idx) => (
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
            <div className="space-y-6">
              {quiz.map((q, qIdx) => (
                <div key={qIdx} className="space-y-3">
                  {(() => {
                    const displayOptions = sanitizeQuizOptions(q.options, q.question, q.explanation);
                    return (
                      <>
                  <p className="font-medium">
                    {qIdx + 1}. {q.question}
                  </p>
                  <div className="space-y-2">
                    {displayOptions.map((opt, oIdx) => {
                      const selected = quizAnswers[qIdx] === oIdx;
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
                          onClick={() =>
                            setQuizAnswers({ ...quizAnswers, [qIdx]: oIdx })
                          }
                          className={`w-full p-3 rounded-lg border text-left text-sm transition-all ${optClass}`}
                        >
                          <div className="flex items-center gap-2">
                            {quizSubmitted && isCorrect && (
                              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                            )}
                            {quizSubmitted && selected && !isCorrect && (
                              <XCircle className="w-4 h-4 text-error flex-shrink-0" />
                            )}
                            <span>{opt}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {quizSubmitted && (
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                      💡 {q.explanation}
                    </p>
                  )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>

            {!quizSubmitted ? (
              <Button
                onClick={handleSubmitQuiz}
                className="mt-6"
                disabled={Object.keys(quizAnswers).length < quiz.length}
              >
                제출하기
              </Button>
            ) : (
              <div className="mt-6 p-4 rounded-lg bg-muted">
                <p className="font-medium text-lg">
                  점수: {quizScore}점
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {quizScore !== null && quizScore >= 80
                    ? '훌륭해요! 다음 단계로 넘어가세요.'
                    : '다시 학습하고 퀴즈를 도전해보세요.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Next topic */}
      {currentStatus === 'completed' && nextTopic && (
        <Card className="border-primary/20">
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">다음 토픽</p>
                <p className="font-semibold">{nextTopic.title}</p>
              </div>
              <Link href={`/learn/${nextTopic.id}`}>
                <Button>
                  다음으로
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
