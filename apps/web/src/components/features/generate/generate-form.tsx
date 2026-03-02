'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import { generateAndSaveContent } from '@/actions/generate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Sparkles, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { TEACHING_METHOD_OPTIONS, DEFAULT_TEACHING_METHOD, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';
import { CLIENT_ACTION_TIMEOUT_MS, withTimeoutOrError } from '@/lib/runtime/timeout';
import {
  DIFFICULTY_OPTIONS,
  LANGUAGE_OPTIONS,
  QUIZ_QUESTION_COUNT,
} from '@/lib/constants/options';

interface GenerateFormProps {
  initialValues?: {
    language?: string;
    topic?: string;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    targetAudience?: string;
    teachingMethod?: string;
    questionCount?: number;
  };
  preferredTeachingMethod?: string;
}

export function GenerateForm({ initialValues, preferredTeachingMethod }: GenerateFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState(initialValues?.language || 'Python');
  const [targetAudience, setTargetAudience] = useState(initialValues?.targetAudience || '프로그래밍 학습자');
  const [teachingMethod, setTeachingMethod] = useState(
    normalizeTeachingMethod(initialValues?.teachingMethod || preferredTeachingMethod || DEFAULT_TEACHING_METHOD)
  );
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>(initialValues?.difficulty || 'beginner');
  const [questionCount, setQuestionCount] = useState<number>(
    Math.max(
      QUIZ_QUESTION_COUNT.min,
      Math.min(QUIZ_QUESTION_COUNT.max, initialValues?.questionCount || QUIZ_QUESTION_COUNT.defaultValue)
    )
  );
  const submitLockRef = useRef(false);
  const settingSummary = useMemo(
    () => `${difficulty === 'beginner' ? '초급' : difficulty === 'intermediate' ? '중급' : '고급'} · ${questionCount}문항 · ${language}`,
    [difficulty, language, questionCount]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current) return;

    submitLockRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await withTimeoutOrError(
        generateAndSaveContent(formData),
        CLIENT_ACTION_TIMEOUT_MS,
        new Error('client_action_timeout')
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.contentId) {
        window.location.href = `/history/${result.contentId}`;
        return;
      }

      setError('생성은 완료됐지만 결과 페이지로 이동하지 못했습니다. 다시 시도해주세요.');
    } catch (error) {
      if (error instanceof Error && error.message === 'client_action_timeout') {
        setError('요청 응답이 지연되고 있습니다. 생성이 완료됐을 수 있으니 기록에서 먼저 확인해주세요.');
      } else {
        setError('문제 세트 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold">AI 문제 훈련 세트 생성</h2>
        <p className="text-muted-foreground text-sm mt-1">
          주제와 난이도만 정하면 바로 풀 수 있는 문제 세트를 만듭니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">빠른 설정</CardTitle>
          </div>
          <CardDescription>
            기본 3가지만 입력하면 생성됩니다. 세부 옵션은 아래 고급 설정에서 조정할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <input type="hidden" name="contentMode" value="quiz_only" />
            {error && (
              <div className="bg-error/10 text-error text-sm p-3 rounded-lg">
                {error}
              </div>
            )}

            <Input
              id="topic"
              name="topic"
              label="문제 주제"
              placeholder="예: 재귀 함수, 트랜잭션 격리 수준, REST API 설계"
              defaultValue={initialValues?.topic || ''}
              required
            />

            <Select
              id="difficulty"
              name="difficulty"
              label="난이도"
              options={DIFFICULTY_OPTIONS}
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as 'beginner' | 'intermediate' | 'advanced')}
              required
            />

            <Input
              id="questionCount"
              name="questionCount"
              type="number"
              min={QUIZ_QUESTION_COUNT.min}
              max={QUIZ_QUESTION_COUNT.max}
              label="문항 수"
              value={String(questionCount)}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) {
                  setQuestionCount(QUIZ_QUESTION_COUNT.defaultValue);
                  return;
                }
                setQuestionCount(
                  Math.max(QUIZ_QUESTION_COUNT.min, Math.min(QUIZ_QUESTION_COUNT.max, Math.round(next)))
                );
              }}
              required
            />

            <details className="rounded-lg border border-border bg-muted/30">
              <summary className="list-none cursor-pointer px-4 py-3 text-sm font-medium flex items-center justify-between">
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                  고급 설정 (선택)
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </summary>
              <div className="px-4 pb-4 space-y-4 border-t border-border">
                <Select
                  id="language"
                  name="language"
                  label="프로그래밍 언어"
                  options={LANGUAGE_OPTIONS}
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  required
                />

                <Input
                  id="targetAudience"
                  name="targetAudience"
                  label="대상"
                  placeholder="예: 프로그래밍 초보자, CS 전공 학생, 백엔드 개발자"
                  value={targetAudience}
                  onChange={(event) => setTargetAudience(event.target.value)}
                  required
                />

                <Select
                  id="teachingMethod"
                  name="teachingMethod"
                  label="해설 스타일"
                  options={TEACHING_METHOD_OPTIONS}
                  value={teachingMethod}
                  onChange={(event) => setTeachingMethod(normalizeTeachingMethod(event.target.value))}
                  required
                />
              </div>
            </details>

            <div className="rounded-lg border border-border p-4 bg-background">
              <p className="text-xs font-medium text-muted-foreground">현재 설정 요약</p>
              <p className="text-sm mt-1 font-medium">{settingSummary}</p>
              <p className="text-xs text-muted-foreground mt-2">
                생성 후 바로 기록에 저장되고, 오답은 복습 세션으로 이어집니다.
              </p>
              <div className="mt-2 text-xs text-muted-foreground">
                해설 스타일: {TEACHING_METHOD_OPTIONS.find((option) => option.value === teachingMethod)?.label || teachingMethod}
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              <Sparkles className="w-4 h-4 mr-2" />
              문제 세트 생성하기
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
