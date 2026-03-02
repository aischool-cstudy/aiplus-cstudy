'use client';

import { useState } from 'react';
import { saveOnboarding } from '@/actions/onboarding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { User, GraduationCap, Target, Code2, Clock3, SlidersHorizontal, ArrowRight, ArrowLeft } from 'lucide-react';
import { DEFAULT_TEACHING_METHOD, TEACHING_METHOD_OPTIONS } from '@/lib/ai/teaching-methods';
import {
  ASSISTANT_PERSONA_OPTIONS,
  DEFAULT_ASSISTANT_PERSONA,
  type AssistantPersona,
} from '@/lib/ai/personas';
import {
  LANGUAGE_VALUES,
  LEARNING_STYLE_OPTIONS,
  ONBOARDING_MIN_GOAL_LENGTH,
  WEEKLY_STUDY_HOURS,
} from '@/lib/constants/options';

const GOAL_EXAMPLES = [
  '8주 안에 FastAPI + Next.js로 MVP를 배포하기',
  '6주 안에 코딩테스트 핵심 유형 30문제를 해결하기',
  '4주 안에 Python 자동화 스크립트 3개를 만들기',
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [background, setBackground] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [level, setLevel] = useState('beginner');
  const [weeklyStudyHours, setWeeklyStudyHours] = useState('5');
  const [preferredTeachingMethod, setPreferredTeachingMethod] = useState(DEFAULT_TEACHING_METHOD);
  const [learningStyle, setLearningStyle] = useState('concept_first');
  const [assistantPersona, setAssistantPersona] = useState<AssistantPersona>(DEFAULT_ASSISTANT_PERSONA);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleInterest = (lang: string) => {
    setInterests((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    if (!name.trim()) {
      setError('이름 또는 닉네임을 입력해주세요.');
      setLoading(false);
      return;
    }
    if (!goal.trim()) {
      setError('학습 목표를 입력해주세요.');
      setLoading(false);
      return;
    }
    if (goal.trim().length < ONBOARDING_MIN_GOAL_LENGTH) {
      setError(`학습 목표를 ${ONBOARDING_MIN_GOAL_LENGTH}자 이상으로 구체적으로 입력해주세요.`);
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.set('name', name.trim());
    formData.set('goal', goal);
    formData.set('background', background);
    formData.set('level', level);
    formData.set('preferredTeachingMethod', preferredTeachingMethod);
    formData.set('weeklyStudyHours', weeklyStudyHours);
    formData.set('learningStyle', learningStyle);
    formData.set('assistantPersona', assistantPersona);
    interests.forEach((i) => formData.append('interests', i));

    const result = await saveOnboarding(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  const canGoNext = (() => {
    if (step === 0) return Boolean(name.trim());
    if (step === 1) return goal.trim().length >= ONBOARDING_MIN_GOAL_LENGTH;
    if (step === 3) {
      const parsed = Number.parseInt(weeklyStudyHours, 10);
      return Number.isFinite(parsed)
        && parsed >= WEEKLY_STUDY_HOURS.min
        && parsed <= WEEKLY_STUDY_HOURS.max;
    }
    return true;
  })();

  const steps = [
    // Step 0: 이름
    <div key="name" className="space-y-4">
      <div className="flex items-center gap-2 text-primary mb-2">
        <User className="w-5 h-5" />
        <span className="text-sm font-medium">Step 1 / 6</span>
      </div>
      <h2 className="text-xl font-bold">어떻게 불러드리면 될까요?</h2>
      <Input
        id="name"
        label="이름 또는 닉네임"
        placeholder="예: 홍길동"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        대시보드 브리핑과 학습 안내에서 사용할 호칭입니다.
      </p>
    </div>,

    // Step 1: 목표
    <div key="goal" className="space-y-4">
      <div className="flex items-center gap-2 text-primary mb-2">
        <Target className="w-5 h-5" />
        <span className="text-sm font-medium">Step 2 / 6</span>
      </div>
      <h2 className="text-xl font-bold">이번 학습에서 얻고 싶은 결과는?</h2>
      <Input
        id="goal"
        label="구체 목표(필수)"
        placeholder=""
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        기간 + 결과물 + 기술 키워드를 함께 적으면 커리큘럼 품질이 올라갑니다.
      </p>
      <p className="text-xs text-muted-foreground">
        현재 입력 길이: {goal.trim().length}자 / 최소 {ONBOARDING_MIN_GOAL_LENGTH}자
      </p>
      <div className="space-y-2">
        <p className="text-sm font-medium">빠른 예시 선택</p>
        <div className="flex flex-wrap gap-2">
          {GOAL_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setGoal(example)}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        목표 유형(취업/실무/취미/프로젝트)은 입력한 목표 문장을 바탕으로 자동 추론됩니다.
      </p>
    </div>,

    // Step 2: 현재 상태
    <div key="level-background" className="space-y-4">
      <div className="flex items-center gap-2 text-primary mb-2">
        <GraduationCap className="w-5 h-5" />
        <span className="text-sm font-medium">Step 3 / 6</span>
      </div>
      <h2 className="text-xl font-bold">현재 학습 상태를 알려주세요</h2>
      <div className="space-y-3">
        {[
          { value: 'beginner', label: '초급', desc: '프로그래밍을 처음 배우거나, 기초 문법을 학습 중' },
          { value: 'intermediate', label: '중급', desc: '기본 문법은 알지만, 프로젝트 경험이 부족' },
          { value: 'advanced', label: '고급', desc: '실무 경험이 있고, 심화 주제에 관심' },
        ].map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => setLevel(l.value)}
            className={`w-full p-4 rounded-xl border text-left transition-all ${
              level === l.value
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'border-border hover:border-primary/30'
            }`}
          >
            <p className="font-medium">{l.label}</p>
            <p className="text-sm text-muted-foreground mt-1">{l.desc}</p>
          </button>
        ))}
      </div>
      <Input
        id="background"
        label="배경(선택)"
        placeholder="예: 비전공자, 6개월 독학 / CS 전공, 인턴 경험 있음"
        value={background}
        onChange={(e) => setBackground(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        맞춤형 콘텐츠 생성에 활용됩니다. 자유롭게 작성하세요.
      </p>
    </div>,

    // Step 3: 학습 시간
    <div key="study-hours" className="space-y-4">
      <div className="flex items-center gap-2 text-primary mb-2">
        <Clock3 className="w-5 h-5" />
        <span className="text-sm font-medium">Step 4 / 6</span>
      </div>
      <h2 className="text-xl font-bold">학습 가능 시간을 알려주세요</h2>
      <Input
        id="weeklyStudyHours"
        type="number"
        min={WEEKLY_STUDY_HOURS.min}
        max={WEEKLY_STUDY_HOURS.max}
        label="주당 학습 가능 시간(시간)"
        value={weeklyStudyHours}
        onChange={(e) => setWeeklyStudyHours(e.target.value)}
        placeholder="예: 5"
      />
      <div className="flex flex-wrap gap-2">
        {[3, 5, 8, 12, 15].map((hours) => (
          <button
            key={hours}
            type="button"
            onClick={() => setWeeklyStudyHours(String(hours))}
            className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
              Number.parseInt(weeklyStudyHours, 10) === hours
                ? 'border-primary bg-primary text-white'
                : 'border-border hover:border-primary/30'
            }`}
          >
            주 {hours}시간
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        일정 산정과 하루 분량 배치에 반영됩니다.
      </p>
    </div>,

    // Step 4: 관심 분야
    <div key="interests" className="space-y-4">
      <div className="flex items-center gap-2 text-primary mb-2">
        <Code2 className="w-5 h-5" />
        <span className="text-sm font-medium">Step 5 / 6</span>
      </div>
      <h2 className="text-xl font-bold">관심있는 프로그래밍 언어는?</h2>
      <p className="text-sm text-muted-foreground">여러 개 선택 가능 (선택 안 해도 진행 가능)</p>
      <div className="flex flex-wrap gap-2">
        {LANGUAGE_VALUES.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => toggleInterest(lang)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
              interests.includes(lang)
                ? 'border-primary bg-primary text-white'
                : 'border-border hover:border-primary/30'
            }`}
          >
            {lang}
          </button>
        ))}
      </div>
    </div>,

    // Step 5: 학습 선호
    <div key="preferences" className="space-y-4">
      <div className="flex items-center gap-2 text-primary mb-2">
        <SlidersHorizontal className="w-5 h-5" />
        <span className="text-sm font-medium">Step 6 / 6</span>
      </div>
      <h2 className="text-xl font-bold">학습 선호를 설정해주세요</h2>
      <p className="text-sm text-muted-foreground">
        아래 세 항목은 각각 역할이 다릅니다. 캐릭터(대화 톤), 설명 방식, 학습 스타일(진행 리듬)을 분리 설정합니다.
      </p>

      <div>
        <p className="text-sm font-medium mb-2">기본 캐릭터(페르소나)</p>
        <div className="space-y-3">
          {ASSISTANT_PERSONA_OPTIONS.map((persona) => (
            <button
              key={persona.value}
              type="button"
              onClick={() => setAssistantPersona(persona.value)}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                assistantPersona === persona.value
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <p className="font-medium">{persona.label}</p>
              <p className="text-sm text-muted-foreground mt-1">{persona.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">AI 설명 방식</p>
        <div className="space-y-3">
          {TEACHING_METHOD_OPTIONS.map((method) => (
            <button
              key={method.value}
              type="button"
              onClick={() => setPreferredTeachingMethod(method.value)}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                preferredTeachingMethod === method.value
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <p className="font-medium">{method.label}</p>
            </button>
          ))}
        </div>
      </div>

      <Select
        id="learningStyle"
        label="내 학습 활동 선호"
        value={learningStyle}
        onChange={(e) => setLearningStyle(e.target.value)}
        options={LEARNING_STYLE_OPTIONS}
      />
      <p className="text-xs text-muted-foreground -mt-2">
        학습 활동 선호는 공부 진행 리듬(순차/반복/누적)을 의미합니다.
      </p>
    </div>,
  ];

  const isLastStep = step === steps.length - 1;

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">맞춤 학습 설정</CardTitle>
          <CardDescription className="text-center">
            몇 가지 질문으로 최적의 학습 경로를 만들어드려요
          </CardDescription>
        </CardHeader>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-6">
          {Array.from({ length: steps.length }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="bg-error/10 text-error text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {steps[step]}

        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              이전
            </Button>
          ) : (
            <div />
          )}

          {!isLastStep ? (
            <Button
              onClick={() => {
                setError(null);
                setStep(step + 1);
              }}
              disabled={!canGoNext}
            >
              다음
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} loading={loading}>
              시작하기
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
