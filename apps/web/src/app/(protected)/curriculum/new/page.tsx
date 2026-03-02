import { TopBar } from '@/components/layout/top-bar';
import { CurriculumWizard } from '@/components/features/curriculum/curriculum-wizard';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_TEACHING_METHOD, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';

export default async function NewCurriculumPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let defaultTeachingMethod = DEFAULT_TEACHING_METHOD;
  let initialGoal = '';
  if (user) {
    const { data: learner } = await supabase
      .from('learner_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
    defaultTeachingMethod = normalizeTeachingMethod(learner?.preferred_teaching_method || DEFAULT_TEACHING_METHOD);
    initialGoal = learner?.goal || '';
  }

  return (
    <>
      <TopBar title="새 커리큘럼 만들기" />
      <CurriculumWizard
        defaultTeachingMethod={defaultTeachingMethod}
        initialGoal={initialGoal}
      />
    </>
  );
}
