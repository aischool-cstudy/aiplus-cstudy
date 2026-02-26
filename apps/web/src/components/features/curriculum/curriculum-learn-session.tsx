'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  generateCurriculumLearningContent,
  updateCurriculumItemStatus,
  submitCurriculumLearningFeedback,
  submitCurriculumAssessmentAttempt,
} from '@/actions/curriculum';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/markdown';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  BookOpen,
  Code2,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Target,
  ListChecks,
  ChevronRight,
} from 'lucide-react';
import { TutorChat } from '@/components/features/chat/tutor-chat';
import type { CurriculumItem, GeneratedContent, ContentSection, QuizQuestion } from '@/types';
import { sanitizeQuizOptions } from '@/lib/quiz/options';
import { inferLanguageFromGoalAndInterests } from '@/lib/curriculum/language';

interface CurriculumLearnSessionProps {
  curriculumId: string;
  item: CurriculumItem;
  content: GeneratedContent | null;
  learnerLevel: string;
  learnerInterests: string[];
  curriculumGoal: string;
  nextItem: CurriculumItem | null;
  prevItem: CurriculumItem | null;
  totalItems: number;
  currentIndex: number;
}

// 섹션 타입별 아이콘
function getSectionIcon(type: string) {
  switch (type) {
    case 'motivation': return <Lightbulb className="w-5 h-5 text-amber-500" />;
    case 'concept': return <BookOpen className="w-5 h-5 text-primary" />;
    case 'example': return <Code2 className="w-5 h-5 text-emerald-500" />;
    case 'check': return <HelpCircle className="w-5 h-5 text-violet-500" />;
    case 'summary': return <ListChecks className="w-5 h-5 text-blue-500" />;
    default: return <BookOpen className="w-5 h-5 text-primary" />;
  }
}

function getSectionLabel(type: string) {
  switch (type) {
    case 'motivation': return '왜 배우나요?';
    case 'concept': return '핵심 개념';
    case 'example': return '코드 예제';
    case 'check': return '이해도 확인';
    case 'summary': return '학습 정리';
    default: return type;
  }
}

export function CurriculumLearnSession({
  curriculumId,
  item,
  content,
  learnerLevel,
  learnerInterests,
  curriculumGoal,
  nextItem,
  prevItem,
  totalItems,
  currentIndex,
}: CurriculumLearnSessionProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const currentContent: GeneratedContent | null = content;
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(item.status === 'completed');

  // v2 섹션 기반 or v1 호환 (DB/API 응답 정규화)
  const rawSections = currentContent?.content_version === 2 && Array.isArray(currentContent?.sections)
    ? currentContent.sections
    : [];
  const sections: ContentSection[] = rawSections.map(normalizeSection);
  const isV2 = currentContent?.content_version === 2 && sections.length > 0;

  const totalSteps = sections.length;
  const currentSection = sections[currentStep] || null;
  // v1 호환용: 구형 콘텐츠에서 퀴즈 추출
  const legacyQuiz = currentContent?.quiz as QuizQuestion[] | undefined;

  // v2: 모든 check 섹션의 답변 상태
  const [checkAnswers, setCheckAnswers] = useState<Record<number, number>>({});
  const [checkSubmitted, setCheckSubmitted] = useState<Record<number, boolean>>({});
  const [checkAttemptType, setCheckAttemptType] = useState<'full' | 'wrong_only' | 'variant'>('full');
  const [checkVariantSeed, setCheckVariantSeed] = useState(0);
  const [checkSummary, setCheckSummary] = useState<{
    total: number;
    correct: number;
    wrongIndexes: number[];
  } | null>(null);

  // v1: 구형 퀴즈 상태
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [legacyAttemptType, setLegacyAttemptType] = useState<'full' | 'wrong_only' | 'variant'>('full');
  const [legacyVariantSeed, setLegacyVariantSeed] = useState(0);
  const [legacyVisibleIndexes, setLegacyVisibleIndexes] = useState<number[] | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(3);
  const [feedbackConceptInput, setFeedbackConceptInput] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const checkOptionOrders = useMemo(
    () => buildCheckOptionOrderMap(sections, checkVariantSeed),
    [sections, checkVariantSeed]
  );
  const legacyOptionOrders = useMemo(
    () => buildLegacyOptionOrderMap(legacyQuiz || [], legacyVariantSeed),
    [legacyQuiz, legacyVariantSeed]
  );
  const legacyQuizIndexes = useMemo(() => {
    if (!legacyQuiz || legacyQuiz.length === 0) return [];
    if (legacyVisibleIndexes && legacyVisibleIndexes.length > 0) {
      return legacyVisibleIndexes.filter((idx) => idx >= 0 && idx < legacyQuiz.length);
    }
    return legacyQuiz.map((_, idx) => idx);
  }, [legacyQuiz, legacyVisibleIndexes]);
  const legacyWrongIndexes = useMemo(() => {
    if (!legacyQuiz || legacyQuiz.length === 0) return [];
    return legacyQuiz
      .map((q, idx) => ({ q, idx }))
      .filter(({ q, idx }) => quizAnswers[idx] !== q.correct_answer)
      .map(({ idx }) => idx);
  }, [legacyQuiz, quizAnswers]);

  // 언어 추론 (서버 사이드에서도 하지만, 튜터 컨텍스트용으로 유지)
  const language = inferLanguageFromGoalAndInterests(curriculumGoal, learnerInterests);

  // v2 콘텐츠 생성
  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setSessionError(null);
    const result = await generateCurriculumLearningContent({
      itemId: item.id,
      curriculumId,
    });

    if (result.success) {
      router.refresh();
      return;
    }

    if (result.error) {
      setSessionError(result.error);
    }

    setGenerating(false);
  }

  // check 섹션 답변 제출
  const handleCheckSubmit = useCallback((stepIndex: number) => {
    setCheckSubmitted(prev => ({ ...prev, [stepIndex]: true }));
  }, []);

  const handleCheckRetry = useCallback((stepIndex: number) => {
    setCheckSubmitted(prev => {
      const next = { ...prev };
      delete next[stepIndex];
      return next;
    });
    setCheckAnswers(prev => {
      const next = { ...prev };
      delete next[stepIndex];
      return next;
    });
  }, []);

  function handleRetryWrongChecks() {
    const checkSections = sections
      .map((section, idx) => ({ section, idx }))
      .filter(({ section }) => section.type === 'check');
    const wrongIndexes = checkSections
      .filter(({ section, idx }) => checkAnswers[idx] !== section.correct_answer)
      .map(({ idx }) => idx);

    if (wrongIndexes.length === 0) return;

    setCheckAttemptType('wrong_only');
    setCompleted(false);
    setCheckSummary(null);

    setCheckSubmitted((prev) => {
      const next = { ...prev };
      for (const idx of wrongIndexes) {
        delete next[idx];
      }
      return next;
    });
    setCheckAnswers((prev) => {
      const next = { ...prev };
      for (const idx of wrongIndexes) {
        delete next[idx];
      }
      return next;
    });
    setCurrentStep(Math.min(...wrongIndexes));
  }

  function handleVariantChecks() {
    const checkIndexes = sections
      .map((section, idx) => ({ section, idx }))
      .filter(({ section }) => section.type === 'check')
      .map(({ idx }) => idx);
    if (checkIndexes.length === 0) return;

    setCheckAttemptType('variant');
    setCompleted(false);
    setCheckSummary(null);
    setCheckVariantSeed((prev) => prev + 1);

    setCheckSubmitted((prev) => {
      const next = { ...prev };
      for (const idx of checkIndexes) {
        delete next[idx];
      }
      return next;
    });
    setCheckAnswers((prev) => {
      const next = { ...prev };
      for (const idx of checkIndexes) {
        delete next[idx];
      }
      return next;
    });
    setCurrentStep(checkIndexes[0]);
  }

  // 마지막 스텝 완료 처리
  async function handleComplete() {
    // 모든 check 섹션이 정답인지 확인
    const checkSections = sections
      .map((s, idx) => ({ section: s, idx }))
      .filter(({ section }) => section.type === 'check');

    const totalChecks = checkSections.length;
    const wrongIndexes = checkSections
      .filter(({ section, idx }) => checkAnswers[idx] !== section.correct_answer)
      .map(({ idx }) => idx);
    const correctChecks = checkSections.filter(
      ({ section, idx }) => checkAnswers[idx] === section.correct_answer
    ).length;

    const score = totalChecks > 0 ? Math.round((correctChecks / totalChecks) * 100) : 100;

    await updateCurriculumItemStatus({
      itemId: item.id,
      status: 'completed',
      quizScore: score,
    });
    setCompleted(true);
    setCheckSummary({
      total: totalChecks,
      correct: correctChecks,
      wrongIndexes,
    });

    if (currentContent) {
      await submitCurriculumAssessmentAttempt({
        curriculumId,
        itemId: item.id,
        contentId: currentContent.id,
        attemptType: checkAttemptType,
        totalQuestions: totalChecks,
        correctCount: correctChecks,
        wrongQuestionIndexes: wrongIndexes,
        explanations: checkSections.map(({ section, idx }) => (
          `${idx + 1}. ${section.explanation || section.body || ''}`
        )),
      });
    }
  }

  // v1 퀴즈 제출
  async function handleSubmitLegacyQuiz() {
    if (!legacyQuiz || !currentContent) return;
    const activeIndexes = legacyQuizIndexes;
    if (activeIndexes.length === 0) return;

    let correct = 0;
    activeIndexes.forEach((idx) => {
      const question = legacyQuiz[idx];
      if (question && quizAnswers[idx] === question.correct_answer) {
        correct += 1;
      }
    });
    const wrongIndexes = activeIndexes.filter((idx) => {
      const question = legacyQuiz[idx];
      return !question || quizAnswers[idx] !== question.correct_answer;
    });
    const score = activeIndexes.length > 0 ? Math.round((correct / activeIndexes.length) * 100) : 0;
    setQuizScore(score);
    setQuizSubmitted(true);

    await updateCurriculumItemStatus({
      itemId: item.id,
      status: 'completed',
      quizScore: score,
    });
    setCompleted(true);

    await submitCurriculumAssessmentAttempt({
      curriculumId,
      itemId: item.id,
      contentId: currentContent.id,
      attemptType: legacyAttemptType,
      totalQuestions: activeIndexes.length,
      correctCount: correct,
      wrongQuestionIndexes: wrongIndexes,
      explanations: activeIndexes
        .map((idx, order) => {
          const question = legacyQuiz[idx];
          if (!question?.explanation) return null;
          return `${order + 1}. ${question.explanation}`;
        })
        .filter((value): value is string => Boolean(value)),
    });
  }

  function handleRetryLegacyQuiz() {
    setLegacyAttemptType('full');
    setLegacyVisibleIndexes(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
    setCompleted(false);
  }

  function handleRetryWrongLegacyQuiz() {
    if (!legacyQuiz) return;
    if (legacyWrongIndexes.length === 0) return;

    setLegacyAttemptType('wrong_only');
    setLegacyVisibleIndexes(legacyWrongIndexes);
    setQuizSubmitted(false);
    setQuizScore(null);
    setCompleted(false);
    setQuizAnswers((prev) => {
      const next = { ...prev };
      for (const idx of legacyWrongIndexes) delete next[idx];
      return next;
    });
  }

  function handleVariantLegacyQuiz() {
    setLegacyAttemptType('variant');
    setLegacyVisibleIndexes(null);
    setLegacyVariantSeed((prev) => prev + 1);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
    setCompleted(false);
  }

  async function handleSubmitFeedback() {
    if (!currentContent || feedbackSaving) return;
    setFeedbackSaving(true);
    setFeedbackError(null);
    const difficultConcepts = feedbackConceptInput
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const result = await submitCurriculumLearningFeedback({
      curriculumId,
      itemId: item.id,
      contentId: currentContent.id,
      understandingRating: feedbackRating,
      difficultConcepts,
    });

    if (result.error) {
      setFeedbackError(`피드백 저장 실패: ${result.error}`);
      setFeedbackSaving(false);
      return;
    }

    setFeedbackSaved(true);
    setFeedbackSaving(false);
  }

  // 콘텐츠 없을 때
  if (!currentContent) {
    return (
      <div className="px-4 md:px-8 py-6 pb-28 md:pb-24 max-w-3xl">
        <Link href={`/curriculum/${curriculumId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> 커리큘럼으로
        </Link>
        <Card>
          <CardContent className="text-center py-12">
            {sessionError && (
              <div className="mb-4 rounded-lg bg-error/10 text-error text-sm p-3 text-left">
                {sessionError}
              </div>
            )}
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{item.title}</h2>
            {item.description && (
              <p className="text-muted-foreground mb-2">{item.description}</p>
            )}
            <p className="text-sm text-muted-foreground mb-6">
              AI가 학습 목표를 분석하고, 맞춤형 학습 콘텐츠를 설계합니다.
            </p>
            <Button onClick={handleGenerate} loading={generating} size="lg">
              <Sparkles className="w-4 h-4 mr-2" />
              {generating ? 'AI가 콘텐츠를 설계하고 있습니다...' : '학습 시작하기'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================
  // v2: 섹션 기반 스텝 학습
  // ==========================================
  if (isV2 && sections.length > 0) {
    return (
      <div className="px-4 md:px-8 py-6 pb-28 md:pb-24 max-w-3xl">
        {sessionError && (
          <div className="mb-4 rounded-lg bg-error/10 text-error text-sm p-3">
            {sessionError}
          </div>
        )}
        {/* Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Link href={`/curriculum/${curriculumId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> 커리큘럼으로
          </Link>
          <span className="text-xs text-muted-foreground">
            토픽 {currentIndex + 1} / {totalItems}
          </span>
        </div>

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="primary">{language}</Badge>
            <Badge>{learnerLevel}</Badge>
            {completed && <Badge variant="success">완료</Badge>}
          </div>
          <h1 className="text-2xl font-bold">{currentContent.title}</h1>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
          {sections.map((section, idx) => {
            const isActive = idx === currentStep;
            const isDone = idx < currentStep;
            const isCheck = section.type === 'check';
            const checkAnswered = isCheck && Boolean(checkSubmitted[idx]);
            const checkCorrect = checkAnswered && checkAnswers[idx] === section.correct_answer;
            const checkWrong = checkAnswered && !checkCorrect;
            const doneClass = isCheck
              ? checkAnswered
                ? checkCorrect
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/10 text-warning'
                : 'bg-muted text-muted-foreground'
              : 'bg-success/10 text-success';

            return (
              <button
                key={idx}
                onClick={() => idx <= currentStep && setCurrentStep(idx)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : isDone
                      ? doneClass
                      : 'bg-muted text-muted-foreground'
                } ${idx <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                disabled={idx > currentStep}
              >
                {isDone ? (
                  isCheck && !checkAnswered
                    ? <span className="w-3 h-3 text-center">{idx + 1}</span>
                    : checkWrong
                      ? <XCircle className="w-3 h-3" />
                      : <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <span className="w-3 h-3 text-center">{idx + 1}</span>
                )}
                {getSectionLabel(section.type)}
              </button>
            );
          })}
        </div>

        {/* 현재 섹션 렌더링 */}
        {currentSection && (
          <SectionRenderer
            section={currentSection}
            stepIndex={currentStep}
            showNextPreview={currentStep === totalSteps - 1}
            optionOrder={checkOptionOrders[currentStep]}
            checkAnswers={checkAnswers}
            checkSubmitted={checkSubmitted}
            onCheckAnswer={(idx, answer) => setCheckAnswers(prev => ({ ...prev, [idx]: answer }))}
            onCheckSubmit={handleCheckSubmit}
            onCheckRetry={handleCheckRetry}
          />
        )}

        {/* 스텝 내비게이션 */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            이전
          </Button>

          {currentStep < totalSteps - 1 ? (
            <Button
              onClick={() => setCurrentStep(prev => Math.min(totalSteps - 1, prev + 1))}
            >
              다음
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : !completed ? (
            <Button
              onClick={handleComplete}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              학습 완료
            </Button>
          ) : null}
        </div>

        {/* 토픽 간 내비게이션 */}
        {completed && (
          <>
            {checkSummary && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">이해도 점검 결과</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {checkSummary.correct}/{checkSummary.total} 정답 · {checkSummary.total > 0 ? Math.round((checkSummary.correct / checkSummary.total) * 100) : 0}점
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {checkSummary.wrongIndexes.length > 0 && (
                      <Button size="sm" variant="secondary" onClick={handleRetryWrongChecks}>
                        오답만 다시 풀기
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={handleVariantChecks}>
                      변형 문제 다시 풀기
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">학습 피드백</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">다음 콘텐츠 맞춤화를 위해 이해도와 어려웠던 개념을 남겨주세요.</p>
                <div className="flex items-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFeedbackRating(value)}
                      className={`w-9 h-9 rounded-full border text-sm font-medium ${
                        feedbackRating === value
                          ? 'border-primary bg-primary text-white'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">이해도 (1=어려움, 5=쉬움)</span>
                </div>
                <input
                  type="text"
                  value={feedbackConceptInput}
                  onChange={(e) => setFeedbackConceptInput(e.target.value)}
                  placeholder="어려웠던 개념을 쉼표로 입력 (예: 클로저, 비동기 흐름)"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <div className="mt-3 flex items-center gap-2">
                  <Button onClick={handleSubmitFeedback} loading={feedbackSaving} size="sm">
                    피드백 저장
                  </Button>
                  {feedbackSaved && <span className="text-xs text-success">저장됨</span>}
                </div>
                {feedbackError && (
                  <p className="mt-2 text-xs text-error">{feedbackError}</p>
                )}
              </CardContent>
            </Card>

            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full sm:w-auto">
                {prevItem ? (
                  <Link href={`/curriculum/${curriculumId}/learn/${prevItem.id}`} className="block">
                    <Button variant="ghost" className="w-full sm:w-auto sm:max-w-[360px]">
                      <ArrowLeft className="w-4 h-4 mr-1 flex-shrink-0" />
                      <span className="min-w-0 truncate">이전: {prevItem.title}</span>
                    </Button>
                  </Link>
                ) : <div />}
              </div>
              <div className="w-full sm:w-auto sm:ml-auto">
                {nextItem ? (
                  <Link href={`/curriculum/${curriculumId}/learn/${nextItem.id}`} className="block">
                    <Button variant="primary" className="w-full sm:w-auto sm:max-w-[360px]">
                      <span className="min-w-0 truncate">다음: {nextItem.title}</span>
                      <ArrowRight className="w-4 h-4 ml-1 flex-shrink-0" />
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/curriculum/${curriculumId}`} className="block">
                    <Button className="w-full sm:w-auto">
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      커리큘럼 완료!
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </>
        )}

        {/* 튜터 챗 */}
        <TutorChat
          curriculumId={curriculumId}
          curriculumGoal={curriculumGoal}
          contentTitle={currentContent.title}
          contentBody={
            currentSection?.body || currentSection?.explanation || ''
          }
          codeExamples={currentSection?.code || ''}
          learnerLevel={learnerLevel}
          language={language}
          teachingMethod={currentContent.teaching_method}
        />
      </div>
    );
  }

  // ==========================================
  // v1 호환: 구형 콘텐츠 (마크다운 렌더링 개선)
  // ==========================================
  return (
    <div className="px-4 md:px-8 py-6 pb-28 md:pb-24 max-w-3xl">
      {sessionError && (
        <div className="mb-4 rounded-lg bg-error/10 text-error text-sm p-3">
          {sessionError}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <Link href={`/curriculum/${curriculumId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> 커리큘럼으로
        </Link>
        <span className="text-xs text-muted-foreground">{currentIndex + 1} / {totalItems}</span>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="primary">{language}</Badge>
          <Badge>{learnerLevel}</Badge>
          {completed && <Badge variant="success">완료</Badge>}
        </div>
        <h1 className="text-2xl font-bold">{currentContent.title}</h1>
      </div>

      {/* 본문 - react-markdown */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">학습 내용</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Markdown content={currentContent.content} />
        </CardContent>
      </Card>

      {/* 코드 예제 */}
      {currentContent.code_examples?.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">코드 예제</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {(currentContent.code_examples as { title: string; code: string; explanation: string }[]).map((ex, idx) => (
              <div key={idx}>
                <h4 className="font-medium mb-2">{ex.title}</h4>
                <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono"><code>{ex.code}</code></pre>
                <p className="text-sm text-muted-foreground mt-2">{ex.explanation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* v1 퀴즈 */}
      {legacyQuiz && legacyQuiz.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">퀴즈</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {legacyQuizIndexes.map((questionIdx, visibleIdx) => {
                const q = legacyQuiz[questionIdx];
                if (!q) return null;
                const rawOptions = Array.isArray(q.options) ? q.options : [];
                const normalizedOptions = sanitizeQuizOptions(rawOptions, q.question, q.explanation);
                const displayOptions = normalizedOptions.length > 0 ? normalizedOptions : rawOptions;
                const optionOrder = normalizeOptionOrder(displayOptions.length, legacyOptionOrders[questionIdx]);

                return (
                  <div key={questionIdx} className="space-y-3">
                    <p className="font-medium">{visibleIdx + 1}. {q.question}</p>
                    <div className="space-y-2">
                      {optionOrder.map((optionIdx) => {
                        const opt = displayOptions[optionIdx];
                        const selected = quizAnswers[questionIdx] === optionIdx;
                        const isCorrect = q.correct_answer === optionIdx;
                        let cls = 'border-border hover:border-primary/30';
                        if (quizSubmitted) {
                          if (isCorrect) cls = 'border-success bg-success/5';
                          else if (selected && !isCorrect) cls = 'border-error bg-error/5';
                        } else if (selected) {
                          cls = 'border-primary bg-primary/5';
                        }
                        return (
                          <button
                            key={`${questionIdx}-${optionIdx}`}
                            type="button"
                            disabled={quizSubmitted}
                            onClick={() => setQuizAnswers((prev) => ({ ...prev, [questionIdx]: optionIdx }))}
                            className={`w-full p-3 rounded-lg border text-left text-sm transition-all ${cls}`}
                          >
                            <div className="flex items-center gap-2">
                              {quizSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-success" />}
                              {quizSubmitted && selected && !isCorrect && <XCircle className="w-4 h-4 text-error" />}
                              <span>{opt}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {quizSubmitted && (
                      <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg space-y-1">
                        <p>{q.explanation}</p>
                        {quizAnswers[questionIdx] !== q.correct_answer && (
                          <p className="text-foreground/80">
                            정답: {displayOptions[q.correct_answer] ?? rawOptions[q.correct_answer]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!quizSubmitted ? (
              <Button
                onClick={handleSubmitLegacyQuiz}
                className="mt-6"
                disabled={legacyQuizIndexes.length === 0 || legacyQuizIndexes.some((idx) => quizAnswers[idx] === undefined)}
              >
                제출하기
              </Button>
            ) : (
              <div className="mt-6 p-4 rounded-lg bg-muted">
                <p className="font-medium text-lg">점수: {quizScore}점</p>
                <p className="text-sm text-muted-foreground mt-1">
                  점수와 관계없이 수료 처리되며, 원하면 다시 풀어볼 수 있습니다.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={handleRetryLegacyQuiz} variant="secondary" size="sm">
                    전체 다시 풀기
                  </Button>
                  {legacyWrongIndexes.length > 0 && (
                    <Button onClick={handleRetryWrongLegacyQuiz} variant="secondary" size="sm">
                      오답만 다시 풀기
                    </Button>
                  )}
                  <Button onClick={handleVariantLegacyQuiz} variant="ghost" size="sm">
                    변형 문제 다시 풀기
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 토픽 간 내비게이션 */}
      <div className="pt-4 border-t border-border flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-auto">
          {prevItem ? (
            <Link href={`/curriculum/${curriculumId}/learn/${prevItem.id}`} className="block">
              <Button variant="ghost" className="w-full sm:w-auto sm:max-w-[360px]">
                <ArrowLeft className="w-4 h-4 mr-1 flex-shrink-0" />
                <span className="min-w-0 truncate">이전: {prevItem.title}</span>
              </Button>
            </Link>
          ) : <div />}
        </div>
        <div className="w-full sm:w-auto sm:ml-auto">
          {nextItem ? (
            <Link href={`/curriculum/${curriculumId}/learn/${nextItem.id}`} className="block">
              <Button variant={completed ? 'primary' : 'ghost'} className="w-full sm:w-auto sm:max-w-[360px]">
                <span className="min-w-0 truncate">다음: {nextItem.title}</span>
                <ArrowRight className="w-4 h-4 ml-1 flex-shrink-0" />
              </Button>
            </Link>
          ) : completed ? (
            <Link href={`/curriculum/${curriculumId}`} className="block">
              <Button className="w-full sm:w-auto">
                <CheckCircle2 className="w-4 h-4 mr-1" /> 커리큘럼 완료!
              </Button>
            </Link>
          ) : <div />}
        </div>
      </div>

      {completed && currentContent && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">학습 피드백</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">다음 콘텐츠 맞춤화를 위해 이해도와 어려웠던 개념을 남겨주세요.</p>
            <div className="flex items-center gap-2 mb-3">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFeedbackRating(value)}
                  className={`w-9 h-9 rounded-full border text-sm font-medium ${
                    feedbackRating === value
                      ? 'border-primary bg-primary text-white'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  {value}
                </button>
              ))}
              <span className="text-xs text-muted-foreground ml-1">이해도 (1=어려움, 5=쉬움)</span>
            </div>
            <input
              type="text"
              value={feedbackConceptInput}
              onChange={(e) => setFeedbackConceptInput(e.target.value)}
              placeholder="어려웠던 개념을 쉼표로 입력 (예: 클로저, 비동기 흐름)"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={handleSubmitFeedback} loading={feedbackSaving} size="sm">
                피드백 저장
              </Button>
              {feedbackSaved && <span className="text-xs text-success">저장됨</span>}
            </div>
            {feedbackError && (
              <p className="mt-2 text-xs text-error">{feedbackError}</p>
            )}
          </CardContent>
        </Card>
      )}

      <TutorChat
        curriculumId={curriculumId}
        curriculumGoal={curriculumGoal}
        contentTitle={currentContent.title}
        contentBody={currentContent.content}
        codeExamples={
          currentContent.code_examples
            ? (currentContent.code_examples as { title: string; code: string }[])
                .map(ex => `${ex.title}:\n${ex.code}`)
                .join('\n\n')
            : ''
        }
        learnerLevel={learnerLevel}
        language={language}
        teachingMethod={currentContent.teaching_method}
      />
    </div>
  );
}

// ==========================================
// 섹션 렌더러
// ==========================================

interface SectionRendererProps {
  section: ContentSection;
  stepIndex: number;
  showNextPreview?: boolean;
  optionOrder?: number[];
  checkAnswers: Record<number, number>;
  checkSubmitted: Record<number, boolean>;
  onCheckAnswer: (stepIndex: number, answer: number) => void;
  onCheckSubmit: (stepIndex: number) => void;
  onCheckRetry: (stepIndex: number) => void;
}

/** DB/API에서 온 섹션 객체를 ContentSection 형태로 정규화 (키 이름·타입 통일) */
function normalizeSection(raw: unknown): ContentSection {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const num = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : -1);
  const sectionTypeRaw = str(o.type);
  const sectionType = ['motivation', 'concept', 'example', 'check', 'summary'].includes(sectionTypeRaw)
    ? sectionTypeRaw as ContentSection['type']
    : 'concept';
  const question = str(o.question);
  const body = str(o.body);
  const explanation = str(o.explanation);

  return {
    type: sectionType,
    title: str(o.title),
    body,
    code: str(o.code),
    language: str(o.language),
    explanation,
    question,
    options: sectionType === 'check' ? sanitizeQuizOptions(o.options, question, body, explanation) : [],
    correct_answer: num(o.correct_answer),
    next_preview: str(o.next_preview ?? o.nextPreview),
  };
}

/** 문자열이 실제 내용을 가지고 있는지 (빈 문자열, 공백만 있는 경우 제외) */
function hasContent(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 리터럴 \n \t → 실제 줄바꿈/탭 (DB·API 이스케이프 대응) */
function normalizeText(text: string): string {
  return String(text)
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/** 퀴즈 옵션이 유효한지 (빈 배열이 아닌 실제 선택지) */
function hasOptions(options: string[] | undefined | null): options is string[] {
  return Array.isArray(options) && options.length >= 2 && options.some(o => o.trim().length > 0);
}

/** 섹션에서 "본문"으로 쓸 텍스트 추출 — body 우선, 없으면 explanation, 없으면 긴 title */
function getSectionBody(section: ContentSection): string | null {
  const raw = section.body ?? section.explanation ?? (hasContent(section.title) && section.title!.length > 30 ? section.title! : null);
  return hasContent(raw) ? normalizeText(raw) : null;
}

function buildDefaultOptionOrder(size: number): number[] {
  return Array.from({ length: size }, (_, idx) => idx);
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let idx = 0; idx < text.length; idx += 1) {
    hash ^= text.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleWithSeed(order: number[], seedText: string): number[] {
  const result = [...order];
  let state = hashSeed(seedText) || 1;

  for (let idx = result.length - 1; idx > 0; idx -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIdx = state % (idx + 1);
    [result[idx], result[swapIdx]] = [result[swapIdx], result[idx]];
  }

  return result;
}

function normalizeOptionOrder(size: number, rawOrder?: number[]): number[] {
  const base = buildDefaultOptionOrder(size);
  if (!rawOrder || rawOrder.length !== size) return base;

  const deduped = Array.from(
    new Set(
      rawOrder.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < size)
    )
  );

  return deduped.length === size ? deduped : base;
}

function buildOptionOrder(size: number, variantSeed: number, salt: string): number[] {
  const base = buildDefaultOptionOrder(size);
  if (size <= 1 || variantSeed <= 0) return base;
  return shuffleWithSeed(base, `${variantSeed}:${salt}`);
}

function buildCheckOptionOrderMap(sections: ContentSection[], variantSeed: number): Record<number, number[]> {
  const map: Record<number, number[]> = {};

  sections.forEach((section, sectionIdx) => {
    if (section.type !== 'check' || !hasOptions(section.options)) return;
    map[sectionIdx] = buildOptionOrder(
      section.options.length,
      variantSeed,
      `check:${sectionIdx}:${section.question || section.title || ''}`
    );
  });

  return map;
}

function buildLegacyOptionOrderMap(quiz: QuizQuestion[], variantSeed: number): Record<number, number[]> {
  const map: Record<number, number[]> = {};

  quiz.forEach((question, questionIdx) => {
    if (!hasOptions(question.options)) return;
    map[questionIdx] = buildOptionOrder(
      question.options.length,
      variantSeed,
      `legacy:${questionIdx}:${question.question || ''}`
    );
  });

  return map;
}

function SectionRenderer({
  section,
  stepIndex,
  showNextPreview = false,
  optionOrder,
  checkAnswers,
  checkSubmitted,
  onCheckAnswer,
  onCheckSubmit,
  onCheckRetry,
}: SectionRendererProps) {
  const isSubmitted = checkSubmitted[stepIndex];
  const selectedAnswer = checkAnswers[stepIndex];

  const body = getSectionBody(section);
  const code = hasContent(section.code) ? normalizeText(section.code) : null;
  const explanation = hasContent(section.explanation) ? normalizeText(section.explanation) : null;
  const question = hasContent(section.question) ? normalizeText(section.question) : null;
  const options = hasOptions(section.options) ? section.options : null;
  const correctAnswer = typeof section.correct_answer === 'number'
    && section.correct_answer >= 0
    && (!options || section.correct_answer < options.length)
    ? section.correct_answer : null;
  const normalizedOptionOrder = options ? normalizeOptionOrder(options.length, optionOrder) : [];
  const nextPreview = hasContent(section.next_preview) ? normalizeText(section.next_preview) : null;

  const bgStyle: Record<string, string> = {
    motivation: 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30',
    concept: 'bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800',
    example: 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30',
    summary: 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30',
  };

  return (
    <Card className="animate-in fade-in slide-in-from-right-2 duration-300">
      <CardHeader>
        <div className="flex items-center gap-2">
          {getSectionIcon(section.type)}
          <CardTitle className="text-base">
            {hasContent(section.title) ? section.title : getSectionLabel(section.type)}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 본문 — body / explanation / 긴 title 중 하나라도 있으면 렌더 */}
        {body && (
          <div className={bgStyle[section.type] ? `rounded-lg p-4 ${bgStyle[section.type]}` : 'rounded-lg p-4 bg-muted/30'}>
            <Markdown content={body} />
          </div>
        )}

        {/* 코드 블록 — 줄바꿈 보존 */}
        {code && (
          <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono whitespace-pre-wrap break-all">
            <code>{code}</code>
          </pre>
        )}

        {/* 코드 예제 설명 (example 타입에서 code 아래 설명만 별도 표시) */}
        {explanation && section.type === 'example' && (
          <div className={`rounded-lg p-4 ${bgStyle.example}`}>
            <Markdown content={explanation} />
          </div>
        )}

        {/* 퀴즈 — question + options가 있으면 렌더 */}
        {question && options && (
          <div className="space-y-4">
            <p className="font-medium text-base">{question}</p>
            <div className="space-y-2">
              {normalizedOptionOrder.map((optionIdx) => {
                const opt = options[optionIdx];
                const selected = selectedAnswer === optionIdx;
                const isCorrect = correctAnswer === optionIdx;
                let cls = 'border-border hover:border-violet-300 dark:hover:border-violet-700';
                if (isSubmitted) {
                  if (isCorrect) cls = 'border-success bg-success/5';
                  else if (selected && !isCorrect) cls = 'border-error bg-error/5';
                } else if (selected) {
                  cls = 'border-violet-500 bg-violet-50 dark:bg-violet-950/20';
                }

                return (
                  <button
                    key={optionIdx}
                    type="button"
                    disabled={isSubmitted}
                    onClick={() => onCheckAnswer(stepIndex, optionIdx)}
                    className={`w-full p-3 rounded-lg border text-left text-sm transition-all ${cls}`}
                  >
                    <div className="flex items-center gap-2">
                      {isSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />}
                      {isSubmitted && selected && !isCorrect && <XCircle className="w-4 h-4 text-error flex-shrink-0" />}
                      {!isSubmitted && (
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                          selected ? 'border-violet-500 bg-violet-500' : 'border-border'
                        }`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      )}
                      <span>{opt}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {!isSubmitted ? (
              <Button
                onClick={() => onCheckSubmit(stepIndex)}
                disabled={selectedAnswer === undefined}
                className="mt-2"
              >
                확인하기
              </Button>
            ) : (
              <div className={`p-4 rounded-lg ${
                selectedAnswer === correctAnswer
                  ? 'bg-success/10 border border-success/20'
                  : 'bg-warning/10 border border-warning/20'
              }`}>
                {selectedAnswer === correctAnswer ? (
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <span className="font-medium text-success">정답입니다!</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-5 h-5 text-warning" />
                    <span className="font-medium text-warning">아쉽지만 틀렸어요</span>
                  </div>
                )}
                {selectedAnswer !== correctAnswer && correctAnswer !== null && options[correctAnswer] && (
                  <p className="text-sm text-foreground/85 mb-2">
                    정답: {options[correctAnswer]}
                  </p>
                )}
                {explanation && <Markdown content={explanation} />}
                <Button onClick={() => onCheckRetry(stepIndex)} variant="secondary" size="sm" className="mt-3">
                  다시 풀기
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 다음 토픽 미리보기 */}
        {showNextPreview && nextPreview && (
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-900/30 flex items-start gap-3">
            <ChevronRight className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">다음에 배울 내용</p>
              <p className="text-sm text-blue-600 dark:text-blue-300">{nextPreview}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
