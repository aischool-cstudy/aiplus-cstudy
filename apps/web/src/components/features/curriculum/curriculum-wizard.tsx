'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateAssessmentQuestions,
  submitAssessmentAndAnalyze,
  generateNewCurriculum,
  refineCurriculumChat,
  finalizeCurriculum,
} from '@/actions/curriculum';
import { calculateSchedule } from '@/lib/schedule';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Target,
  HelpCircle,
  BookOpen,
  MessageSquare,
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Send,
  SkipForward,
} from 'lucide-react';
import type { AssessmentQuestion } from '@/types';
import { DEFAULT_TEACHING_METHOD, getTeachingMethodLabel, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';

type WizardStep = 'goal' | 'assessment' | 'assessment-result' | 'curriculum' | 'refine' | 'schedule' | 'done';

const STORAGE_KEY = 'curriculum-wizard-state';

interface AssessmentResult {
  level: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

interface CurriculumData {
  title: string;
  topics: { title: string; description: string; estimated_minutes: number }[];
  total_estimated_hours: number;
  summary: string;
}

function saveToSession(data: Record<string, unknown>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function loadFromSession(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearSession() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

function getInitialWizardState(defaultTeachingMethod: string, initialGoal: string) {
  const saved = typeof window !== 'undefined' ? loadFromSession() : null;
  const teachingMethod = normalizeTeachingMethod((saved?.teachingMethod as string) || defaultTeachingMethod);
  return {
    step: (saved?.step as WizardStep) || 'goal',
    goal: (saved?.goal as string) || initialGoal || '',
    questions: (saved?.questions as AssessmentQuestion[]) || [],
    answers: (saved?.answers as Record<number, number>) || {},
    assessmentResult: (saved?.assessmentResult as AssessmentResult | null) || null,
    curriculum: (saved?.curriculum as CurriculumData | null) || null,
    dailyMinutes: (saved?.dailyMinutes as number) || 60,
    teachingMethod,
  };
}

interface CurriculumWizardProps {
  defaultTeachingMethod?: string;
  initialGoal?: string;
}

export function CurriculumWizard({
  defaultTeachingMethod = DEFAULT_TEACHING_METHOD,
  initialGoal = '',
}: CurriculumWizardProps) {
  const [initial] = useState(() => getInitialWizardState(defaultTeachingMethod, initialGoal));
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(initial.step);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step data
  const [goal, setGoal] = useState(initial.goal);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>(initial.questions);
  const [answers, setAnswers] = useState<Record<number, number>>(initial.answers);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(initial.assessmentResult);
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(initial.curriculum);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(initial.dailyMinutes);
  const teachingMethod = initial.teachingMethod;

  // 상태 변경 시 세션 저장
  useEffect(() => {
    if (step !== 'goal' || goal) {
      saveToSession({ step, goal, questions, answers, assessmentResult, curriculum, dailyMinutes, teachingMethod });
    }
  }, [step, goal, questions, answers, assessmentResult, curriculum, dailyMinutes, teachingMethod]);

  // Step 1: 목표 입력 → 진단 질문 생성
  async function handleGoalSubmit() {
    if (!goal.trim()) return;
    setLoading(true);
    setError(null);

    const result = await generateAssessmentQuestions(goal);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setQuestions(result.questions!);
    setStep('assessment');
    setLoading(false);
  }

  // 진단 건너뛰기 → 초보로 바로 커리큘럼 생성
  async function handleSkipAssessment() {
    setLoading(true);
    setError(null);

    const skipResult: AssessmentResult = {
      level: 'beginner',
      summary: '진단을 건너뛰어 초급 수준으로 설정되었습니다.',
      strengths: [],
      weaknesses: ['전반적인 기초 학습이 필요합니다'],
    };
    setAssessmentResult(skipResult);

    const result = await generateNewCurriculum({
      goal,
      level: 'beginner',
      strengths: [],
      weaknesses: ['전반적인 기초'],
      teachingMethod,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setCurriculum(result.curriculum!);
    setStep('curriculum');
    setLoading(false);
  }

  // Step 2: 답변 제출 → 레벨 분석
  async function handleAssessmentSubmit() {
    setLoading(true);
    setError(null);

    const answerList = questions.map(q => ({
      question_id: q.id,
      selected: answers[q.id] ?? -1,
    }));

    const result = await submitAssessmentAndAnalyze({
      goal,
      questions,
      answers: answerList,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setAssessmentResult(result.assessment!);
    setStep('assessment-result');
    setLoading(false);
  }

  // Step 3: 커리큘럼 생성
  async function handleGenerateCurriculum() {
    if (!assessmentResult) return;
    setLoading(true);
    setError(null);

    const result = await generateNewCurriculum({
      goal,
      level: assessmentResult.level,
      strengths: assessmentResult.strengths,
      weaknesses: assessmentResult.weaknesses,
      teachingMethod,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setCurriculum(result.curriculum!);
    setStep('curriculum');
    setLoading(false);
  }

  // Step 4: 대화로 조정
  async function handleRefineMessage() {
    if (!chatInput.trim() || !curriculum) return;
    setLoading(true);

    const userMsg = chatInput;
    setChatInput('');
    const updatedChat = [...chatMessages, { role: 'user' as const, content: userMsg }];
    setChatMessages(updatedChat);

    const result = await refineCurriculumChat({
      currentCurriculum: curriculum,
      chatHistory: updatedChat,
      userMessage: userMsg,
    });

    if (result.error) {
      setChatMessages([...updatedChat, {
        role: 'assistant',
        content: `수정에 실패했습니다: ${result.error}`,
      }]);
      setLoading(false);
      return;
    }

    setCurriculum(result.curriculum!);
    setChatMessages([...updatedChat, {
      role: 'assistant',
      content: `커리큘럼을 수정했습니다. "${result.curriculum!.title}" — ${result.curriculum!.topics.length}개 토픽, 예상 ${result.curriculum!.total_estimated_hours}시간`,
    }]);
    setLoading(false);
  }

  // Step 5: 확정
  async function handleFinalize() {
    if (!curriculum || !assessmentResult) return;
    setLoading(true);
    setError(null);

    const result = await finalizeCurriculum({
      goal,
      level: assessmentResult.level,
      teachingMethod,
      dailyStudyMinutes: dailyMinutes,
      curriculum,
      assessmentData: questions.length > 0 ? {
        questions,
        answers: questions.map(q => ({
          question_id: q.id,
          selected: answers[q.id] ?? -1,
          correct: (answers[q.id] ?? -1) === q.correct_answer,
        })),
      } : undefined,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    clearSession();
    router.push(`/curriculum/${result.curriculumId}`);
  }

  const levelLabels: Record<string, string> = {
    beginner: '초급',
    intermediate: '중급',
    advanced: '고급',
  };

  // 일정 미리보기 계산
  const schedulePreview = curriculum
    ? calculateSchedule(
        curriculum.topics.map(t => ({ title: t.title, estimated_minutes: t.estimated_minutes })),
        dailyMinutes
      )
    : null;

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl">
      {/* Progress bar */}
      <div className="flex gap-2 mb-8">
        {['goal', 'assessment', 'curriculum', 'schedule'].map((s, i) => {
          // Map to 4-segment progress
          const segMap: Record<string, number> = { goal: 0, assessment: 1, 'assessment-result': 1, curriculum: 2, refine: 2, schedule: 3, done: 3 };
          const seg = segMap[step] ?? 0;
          return (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                seg >= i ? 'bg-primary' : 'bg-muted'
              }`}
            />
          );
        })}
      </div>

      {error && (
        <div className="bg-error/10 text-error text-sm p-3 rounded-lg mb-4">{error}</div>
      )}

      {/* ========== Step 1: 목표 입력 ========== */}
      {step === 'goal' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <CardTitle>학습 목표</CardTitle>
            </div>
            <CardDescription>
              달성하고 싶은 목표를 구체적으로 입력하세요. AI가 맞춤 커리큘럼을 만들어줍니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              id="goal"
              placeholder="예: AI 챗봇 만들기, 자료구조 마스터하기, 웹 개발 입문"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="mb-4"
            />
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                기본 설명 방식: <strong>{getTeachingMethodLabel(teachingMethod)}</strong> (온보딩/설정 기준)
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {['AI 챗봇 만들기', '자료구조 & 알고리즘', '웹 풀스택 개발', 'Python 데이터 분석', 'React Native 앱 개발'].map(
                (example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setGoal(example)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    {example}
                  </button>
                )
              )}
            </div>
            <div className="space-y-3">
              <Button onClick={handleGoalSubmit} loading={loading} disabled={!goal.trim()} size="lg" className="w-full">
                수준 진단 시작
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <Button
                variant="ghost"
                onClick={handleSkipAssessment}
                loading={loading}
                disabled={!goal.trim()}
                className="w-full text-muted-foreground"
              >
                <SkipForward className="w-4 h-4 mr-1" />
                진단 건너뛰기 (초급으로 시작)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========== Step 2: 수준 진단 ========== */}
      {step === 'assessment' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              <CardTitle>수준 진단</CardTitle>
            </div>
            <CardDescription>
              &ldquo;{goal}&rdquo; 목표에 필요한 지식을 테스트합니다. 모르는 문제는 그냥 넘겨도 됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {questions.map((q, qIdx) => (
                <div key={q.id} className="space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-muted-foreground mt-0.5">{qIdx + 1}.</span>
                    <div className="flex-1">
                      <p className="font-medium">{q.question}</p>
                      <Badge className="mt-1">{q.topic_area}</Badge>
                    </div>
                  </div>
                  <div className="space-y-2 ml-5">
                    {q.options.map((opt, oIdx) => (
                      <button
                        key={oIdx}
                        type="button"
                        onClick={() => setAnswers({ ...answers, [q.id]: oIdx })}
                        className={`w-full p-3 rounded-lg border text-left text-sm transition-all ${
                          answers[q.id] === oIdx
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/30'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-8">
              <Button variant="ghost" onClick={() => setStep('goal')}>
                <ArrowLeft className="w-4 h-4 mr-1" /> 이전
              </Button>
              <Button onClick={handleAssessmentSubmit} loading={loading} size="lg">
                분석하기
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========== Step 3: 진단 결과 ========== */}
      {step === 'assessment-result' && assessmentResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <CardTitle>진단 결과</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-6">
              <Badge variant="primary" className="text-lg px-4 py-1">
                {levelLabels[assessmentResult.level] || assessmentResult.level}
              </Badge>
              <p className="text-muted-foreground mt-3">{assessmentResult.summary}</p>
            </div>

            {(assessmentResult.strengths.length > 0 || assessmentResult.weaknesses.length > 0) && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-success/5 border border-success/20">
                  <p className="text-sm font-medium text-success mb-2">강점</p>
                  {assessmentResult.strengths.length > 0
                    ? assessmentResult.strengths.map((s, i) => (
                        <p key={i} className="text-sm text-muted-foreground">- {s}</p>
                      ))
                    : <p className="text-sm text-muted-foreground">아직 파악되지 않음</p>
                  }
                </div>
                <div className="p-4 rounded-lg bg-warning/5 border border-warning/20">
                  <p className="text-sm font-medium text-warning mb-2">보완할 부분</p>
                  {assessmentResult.weaknesses.map((w, i) => (
                    <p key={i} className="text-sm text-muted-foreground">- {w}</p>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleGenerateCurriculum} loading={loading} size="lg" className="w-full">
              <Sparkles className="w-4 h-4 mr-2" />
              커리큘럼 만들기
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ========== Step 4: 커리큘럼 확인 + 조정 ========== */}
      {(step === 'curriculum' || step === 'refine') && curriculum && (
        <>
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <CardTitle>{curriculum.title}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{getTeachingMethodLabel(teachingMethod)}</Badge>
                  <Badge variant="primary">{curriculum.topics.length}개 토픽</Badge>
                </div>
              </div>
              <CardDescription>
                {curriculum.summary} (예상 {curriculum.total_estimated_hours}시간)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {curriculum.topics.map((topic, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <span className="text-xs font-mono text-muted-foreground w-6 text-right">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{topic.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{topic.description}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{topic.estimated_minutes}분</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 조정 대화 */}
          {step === 'refine' && (
            <Card className="mb-4">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base">커리큘럼 조정</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
                  {chatMessages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      수정 요청을 입력하세요. 예: &ldquo;실습 비중을 높여줘&rdquo;, &ldquo;기초 부분을 더 자세히&rdquo;
                    </p>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary/10 ml-8'
                          : 'bg-muted mr-8'
                      }`}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="수정 요청을 입력하세요..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && handleRefineMessage()}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <Button onClick={handleRefineMessage} loading={loading} disabled={!chatInput.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            {step === 'curriculum' && (
              <>
                <Button variant="secondary" onClick={() => setStep('refine')} className="flex-1">
                  <MessageSquare className="w-4 h-4 mr-1" />
                  수정하기
                </Button>
                <Button onClick={() => setStep('schedule')} className="flex-1">
                  이대로 진행
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </>
            )}
            {step === 'refine' && (
              <Button onClick={() => setStep('schedule')} className="w-full">
                조정 완료, 일정 설정으로
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </>
      )}

      {/* ========== Step 5: 하루 학습 시간 설정 ========== */}
      {step === 'schedule' && curriculum && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <CardTitle>하루 학습 시간</CardTitle>
            </div>
            <CardDescription>
              하루에 얼마나 공부할 수 있는지 선택하세요. 기간은 자동으로 계산됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">하루 학습 시간</label>
                <div className="grid grid-cols-4 gap-3">
                  {[30, 60, 90, 120].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDailyMinutes(m)}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        dailyMinutes === m
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <p className="font-semibold">{m >= 60 ? `${m / 60}시간` : `${m}분`}</p>
                      <p className="text-xs text-muted-foreground">
                        {m === 30 && '가볍게'}
                        {m === 60 && '적당히'}
                        {m === 90 && '열심히'}
                        {m === 120 && '집중적으로'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 실시간 미리보기 */}
              {schedulePreview && (
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">예상 일정</span>
                    <Badge variant="primary">{schedulePreview.totalDays}일 과정</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {curriculum.topics.length}개 토픽 · 총 {curriculum.total_estimated_hours}시간 ·
                    하루 약 {dailyMinutes}분
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto mt-2">
                    {schedulePreview.dailyBreakdown.map((day) => (
                      <div key={day.day} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground w-12 flex-shrink-0">Day {day.day}</span>
                        <span className="flex-1 truncate">{day.topics.join(', ')}</span>
                        <span className="text-muted-foreground">{day.estimated_minutes}분</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep('curriculum')}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> 이전
                </Button>
                <Button onClick={handleFinalize} loading={loading} size="lg" className="flex-1">
                  <Sparkles className="w-4 h-4 mr-2" />
                  커리큘럼 확정하기
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
