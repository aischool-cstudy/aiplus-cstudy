'use client';

import { useState } from 'react';
import { updateUserSettings } from '@/actions/settings';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, BookOpen } from 'lucide-react';
import { DEFAULT_TEACHING_METHOD, TEACHING_METHOD_OPTIONS, getTeachingMethodLabel, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';
import {
  ASSISTANT_PERSONA_OPTIONS,
  DEFAULT_ASSISTANT_PERSONA,
  getAssistantPersonaLabel,
} from '@/lib/ai/personas';
import {
  DIFFICULTY_OPTIONS,
  GOAL_TYPE_OPTIONS,
  LANGUAGE_VALUES,
  LEARNING_STYLE_OPTIONS,
} from '@/lib/constants/options';

interface SettingsContentProps {
  email: string;
  profile: {
    name: string | null;
    plan: string;
    daily_generations_remaining: number;
  } | null;
  learnerProfile: {
    goal: string | null;
    background: string | null;
    interests: string[];
    level: string;
    preferred_teaching_method?: string | null;
    assistant_persona?: string | null;
    goal_type?: string | null;
    weekly_study_hours?: number | null;
    learning_style?: string | null;
  } | null;
}

export function SettingsContent({ email, profile, learnerProfile }: SettingsContentProps) {
  const [name, setName] = useState(profile?.name || '');
  const [goal, setGoal] = useState(learnerProfile?.goal || '');
  const [background, setBackground] = useState(learnerProfile?.background || '');
  const [level, setLevel] = useState(learnerProfile?.level || 'beginner');
  const [preferredTeachingMethod, setPreferredTeachingMethod] = useState(
    normalizeTeachingMethod(learnerProfile?.preferred_teaching_method || DEFAULT_TEACHING_METHOD)
  );
  const [assistantPersona, setAssistantPersona] = useState(
    learnerProfile?.assistant_persona || DEFAULT_ASSISTANT_PERSONA
  );
  const [goalType, setGoalType] = useState(learnerProfile?.goal_type || 'hobby');
  const [weeklyStudyHours, setWeeklyStudyHours] = useState(String(learnerProfile?.weekly_study_hours ?? 5));
  const [learningStyle, setLearningStyle] = useState(learnerProfile?.learning_style || 'concept_first');
  const [interests, setInterests] = useState<string[]>(learnerProfile?.interests || []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleInterest = (lang: string) => {
    setInterests((prev) =>
      prev.includes(lang) ? prev.filter((item) => item !== lang) : [...prev, lang]
    );
  };

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.set('name', name);
    formData.set('goal', goal);
    formData.set('background', background);
    formData.set('level', level);
    formData.set('preferredTeachingMethod', preferredTeachingMethod);
    formData.set('assistantPersona', assistantPersona);
    formData.set('goalType', goalType);
    formData.set('weeklyStudyHours', weeklyStudyHours);
    formData.set('learningStyle', learningStyle);
    interests.forEach((item) => formData.append('interests', item));

    const result = await updateUserSettings(formData);
    if (result.error) setError(result.error);
    if (result.success) setMessage('설정이 저장되었습니다.');
    setSaving(false);
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold">설정</h2>
        <p className="text-muted-foreground text-sm mt-1">
          프로필과 학습 설정을 확인하세요.
        </p>
      </div>

      {/* 계정 정보 */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">계정 정보</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">이메일</span>
              <span className="text-sm font-medium">{email}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">이름</span>
              <span className="text-sm font-medium">{name || '미설정'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">플랜</span>
              <Badge variant="primary">{profile?.plan === 'pro' ? 'Pro' : 'Free'}</Badge>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">기본 설명 방식</span>
              <span className="text-sm font-medium">{getTeachingMethodLabel(preferredTeachingMethod)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">기본 캐릭터</span>
              <span className="text-sm font-medium">{getAssistantPersonaLabel(assistantPersona)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">주당 학습 시간</span>
              <span className="text-sm font-medium">{weeklyStudyHours}시간</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">콘텐츠 생성</span>
              <span className="text-sm font-medium">무제한 (개발 모드)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">학습 프로필 수정</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {message && (
              <div className="bg-success/10 text-success text-sm p-3 rounded-lg">
                {message}
              </div>
            )}
            {error && (
              <div className="bg-error/10 text-error text-sm p-3 rounded-lg">
                {error}
              </div>
            )}

            <Input
              id="name"
              label="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
            />

            <Input
              id="goal"
              label="학습 목표"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="예: 백엔드 개발 취업, 알고리즘 마스터"
            />

            <Input
              id="background"
              label="배경"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="예: 비전공자, 6개월 독학"
            />

            <Select
              id="level"
              label="현재 레벨"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              options={DIFFICULTY_OPTIONS}
            />

            <Select
              id="preferredTeachingMethod"
              label="기본 설명 방식"
              value={preferredTeachingMethod}
              onChange={(e) => setPreferredTeachingMethod(normalizeTeachingMethod(e.target.value))}
              options={TEACHING_METHOD_OPTIONS}
            />
            <p className="text-xs text-muted-foreground -mt-2">
              기본 설명 방식은 학습 콘텐츠 생성(설명 톤/방식)의 기본값으로 사용됩니다.
            </p>

            <Select
              id="assistantPersona"
              label="기본 캐릭터(페르소나)"
              value={assistantPersona}
              onChange={(e) => setAssistantPersona(e.target.value)}
              options={ASSISTANT_PERSONA_OPTIONS.map((option) => ({
                value: option.value,
                label: `${option.label} - ${option.description}`,
              }))}
            />
            <p className="text-xs text-muted-foreground -mt-2">
              캐릭터는 대화 톤과 동기부여 스타일에만 영향을 주며, 커리큘럼 구조는 바꾸지 않습니다.
            </p>

            <Select
              id="goalType"
              label="목표 유형"
              value={goalType}
              onChange={(e) => setGoalType(e.target.value)}
              options={GOAL_TYPE_OPTIONS}
            />

            <Input
              id="weeklyStudyHours"
              type="number"
              min={1}
              max={80}
              label="주당 학습 가능 시간(시간)"
              value={weeklyStudyHours}
              onChange={(e) => setWeeklyStudyHours(e.target.value)}
              placeholder="예: 5"
            />

            <Select
              id="learningStyle"
              label="선호 학습 스타일"
              value={learningStyle}
              onChange={(e) => setLearningStyle(e.target.value)}
              options={LEARNING_STYLE_OPTIONS}
            />
            <p className="text-xs text-muted-foreground -mt-2">
              학습 스타일은 학습 활동 리듬(순차/반복/누적)을 의미합니다.
            </p>

            <div>
              <span className="text-sm font-medium block mb-2">관심 언어</span>
              <div className="flex flex-wrap gap-2">
                {LANGUAGE_VALUES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleInterest(lang)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      interests.includes(lang)
                        ? 'border-primary bg-primary text-white'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <Button onClick={handleSave} loading={saving}>
                저장하기
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
