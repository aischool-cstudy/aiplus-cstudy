'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  OnboardingLearnerInputSchema,
  parseLearnerFormData,
} from '@/lib/forms/learner-form';
import { type GoalTypeValue } from '@/lib/constants/options';

const GOAL_TYPE_KEYWORDS: Record<GoalTypeValue, string[]> = {
  job: ['취업', '면접', '이력서', '포트폴리오', '코딩테스트', '채용'],
  work: ['실무', '업무', '회사', '프로덕션', '운영', '성능', '협업'],
  hobby: [],
  project: ['프로젝트', '배포', '서비스', '앱', 'mvp', '출시', '개발'],
};

function inferGoalType(goal: string): GoalTypeValue {
  const lowered = goal.toLowerCase();
  const scores: Record<GoalTypeValue, number> = {
    job: 0,
    work: 0,
    hobby: 0,
    project: 0,
  };

  for (const keyword of GOAL_TYPE_KEYWORDS.job) {
    if (lowered.includes(keyword)) scores.job += 1;
  }
  for (const keyword of GOAL_TYPE_KEYWORDS.work) {
    if (lowered.includes(keyword)) scores.work += 1;
  }
  for (const keyword of GOAL_TYPE_KEYWORDS.project) {
    if (lowered.includes(keyword)) scores.project += 1;
  }

  const top = (Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'hobby') as GoalTypeValue;
  return scores[top] > 0 ? top : 'hobby';
}

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  const { data: existingLearner } = await supabase
    .from('learner_profiles')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .maybeSingle();
  const wasCompletedBefore = Boolean(existingLearner?.onboarding_completed);

  const parsedForm = parseLearnerFormData(formData);
  const rawInput = {
    ...parsedForm,
    goalType: parsedForm.goalType || inferGoalType(parsedForm.goal || ''),
  };
  const parsed = OnboardingLearnerInputSchema.safeParse(rawInput);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { error: firstIssue?.message || '입력값을 확인해주세요.' };
  }

  const input = parsed.data;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      name: input.name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (profileError) {
    return { error: `프로필 저장 실패: ${profileError.message}` };
  }

  const baseLearnerPayload = {
    user_id: user.id,
    goal: input.goal,
    background: input.background,
    level: input.level,
    interests: input.interests,
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from('learner_profiles')
    .upsert({
      ...baseLearnerPayload,
      preferred_teaching_method: input.preferredTeachingMethod,
      goal_type: input.goalType,
      weekly_study_hours: input.weeklyStudyHours,
      learning_style: input.learningStyle,
      assistant_persona: input.assistantPersona,
    }, { onConflict: 'user_id' });

  if (error && /goal_type|weekly_study_hours|learning_style|assistant_persona/.test(error.message)) {
    const retry = await supabase
      .from('learner_profiles')
      .upsert({
        ...baseLearnerPayload,
        preferred_teaching_method: input.preferredTeachingMethod,
      }, { onConflict: 'user_id' });
    error = retry.error;
  }

  if (error && error.message.includes('preferred_teaching_method')) {
    const retry = await supabase
      .from('learner_profiles')
      .upsert(baseLearnerPayload, { onConflict: 'user_id' });
    error = retry.error;
  }

  if (error) {
    return { error: '프로필 저장에 실패했습니다: ' + error.message };
  }

  if (wasCompletedBefore) {
    redirect('/dashboard');
  }
  redirect('/start?from=onboarding');
}
