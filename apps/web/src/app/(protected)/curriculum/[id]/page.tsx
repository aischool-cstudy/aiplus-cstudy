import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getCurriculum, getCurriculumItems } from '@/actions/curriculum';
import { TopBar } from '@/components/layout/top-bar';
import { CurriculumDetail } from '@/components/features/curriculum/curriculum-detail';

interface CurriculumDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CurriculumDetailPage({ params }: CurriculumDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const curriculum = await getCurriculum(id);
  if (!curriculum) redirect('/curriculum');

  const items = await getCurriculumItems(id);

  return (
    <>
      <TopBar title={curriculum.title} />
      <CurriculumDetail curriculum={curriculum} items={items} />
    </>
  );
}
