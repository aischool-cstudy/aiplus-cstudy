import { TopBar } from '@/components/layout/top-bar';
import { GenerateForm } from '@/components/features/generate/generate-form';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_TEACHING_METHOD, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';
import { DEFAULT_TARGET_AUDIENCE_BY_LEVEL, QUIZ_QUESTION_COUNT } from '@/lib/constants/options';

interface GeneratePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GeneratePage({ searchParams }: GeneratePageProps) {
  const params = (await searchParams) || {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let preferredTeachingMethod = DEFAULT_TEACHING_METHOD;
  let learnerLevel = 'beginner';
  if (user) {
    const { data: learner } = await supabase
      .from('learner_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
    preferredTeachingMethod = normalizeTeachingMethod(learner?.preferred_teaching_method || DEFAULT_TEACHING_METHOD);
    learnerLevel = learner?.level || 'beginner';
  }

  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const initialValues = {
    language: pick('language') || undefined,
    topic: pick('topic') || undefined,
    difficulty: (pick('difficulty') as 'beginner' | 'intermediate' | 'advanced' | undefined) || undefined,
    targetAudience: pick('targetAudience')
      || DEFAULT_TARGET_AUDIENCE_BY_LEVEL[learnerLevel as keyof typeof DEFAULT_TARGET_AUDIENCE_BY_LEVEL]
      || undefined,
    teachingMethod: normalizeTeachingMethod(pick('teachingMethod')),
    questionCount: (() => {
      const raw = Number(pick('questionCount'));
      if (!Number.isFinite(raw)) return QUIZ_QUESTION_COUNT.defaultValue;
      return Math.max(QUIZ_QUESTION_COUNT.min, Math.min(QUIZ_QUESTION_COUNT.max, Math.round(raw)));
    })(),
  };

  return (
    <>
      <TopBar title="문제 훈련" />
      <GenerateForm
        initialValues={initialValues}
        preferredTeachingMethod={preferredTeachingMethod}
      />
    </>
  );
}
