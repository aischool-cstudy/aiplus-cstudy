import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getUserCurriculums } from '@/actions/curriculum';
import { TopBar } from '@/components/layout/top-bar';
import { CurriculumList } from '@/components/features/curriculum/curriculum-list';

export default async function CurriculumPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const curriculums = await getUserCurriculums();

  return (
    <>
      <TopBar title="내 커리큘럼" />
      <CurriculumList curriculums={curriculums} />
    </>
  );
}
