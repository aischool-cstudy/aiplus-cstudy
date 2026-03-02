'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  SettingsLearnerInputSchema,
  parseLearnerFormData,
} from '@/lib/forms/learner-form';

export async function updateUserSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  const parsedForm = parseLearnerFormData(formData);
  const rawInput = {
    ...parsedForm,
    goalType: parsedForm.goalType || 'hobby',
  };
  const parsed = SettingsLearnerInputSchema.safeParse(rawInput);

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

  let { error: learnerError } = await supabase
    .from('learner_profiles')
    .upsert({
      ...baseLearnerPayload,
      preferred_teaching_method: input.preferredTeachingMethod,
      goal_type: input.goalType,
      weekly_study_hours: input.weeklyStudyHours,
      learning_style: input.learningStyle,
      assistant_persona: input.assistantPersona,
    }, { onConflict: 'user_id' });

  if (learnerError && /goal_type|weekly_study_hours|learning_style|assistant_persona/.test(learnerError.message)) {
    const retry = await supabase
      .from('learner_profiles')
      .upsert({
        ...baseLearnerPayload,
        preferred_teaching_method: input.preferredTeachingMethod,
      }, { onConflict: 'user_id' });
    learnerError = retry.error;
  }

  if (learnerError && learnerError.message.includes('preferred_teaching_method')) {
    const retry = await supabase
      .from('learner_profiles')
      .upsert(baseLearnerPayload, { onConflict: 'user_id' });
    learnerError = retry.error;
  }

  if (learnerError) {
    return { error: `학습 프로필 저장 실패: ${learnerError.message}` };
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  revalidatePath('/curriculum/new');
  revalidatePath('/generate');

  return { success: true };
}
