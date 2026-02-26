import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getCurriculum, getCurriculumItem, getCurriculumItems } from '@/actions/curriculum';
import { getContent } from '@/actions/content';
import { TopBar } from '@/components/layout/top-bar';
import { CurriculumLearnSession } from '@/components/features/curriculum/curriculum-learn-session';

interface CurriculumLearnPageProps {
  params: Promise<{ id: string; itemId: string }>;
}

export default async function CurriculumLearnPage({ params }: CurriculumLearnPageProps) {
  const { id: curriculumId, itemId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const curriculum = await getCurriculum(curriculumId);
  if (!curriculum) redirect('/curriculum');

  const item = await getCurriculumItem(itemId);
  if (!item) redirect(`/curriculum/${curriculumId}`);

  // 기존 콘텐츠가 있으면 가져오기
  const content = item.content_id ? await getContent(item.content_id) : null;

  // 모든 아이템 가져와서 다음 아이템 찾기
  const allItems = await getCurriculumItems(curriculumId);
  const currentIndex = allItems.findIndex(i => i.id === itemId);
  const nextItem = currentIndex >= 0 && currentIndex < allItems.length - 1
    ? allItems[currentIndex + 1]
    : null;
  const prevItem = currentIndex > 0
    ? allItems[currentIndex - 1]
    : null;

  // learner profile
  const { data: learnerProfile } = await supabase
    .from('learner_profiles')
    .select('interests, level')
    .eq('user_id', user.id)
    .single();

  return (
    <>
      <TopBar title={item.title} />
      <CurriculumLearnSession
        curriculumId={curriculumId}
        item={item}
        content={content}
        learnerLevel={learnerProfile?.level || curriculum.assessed_level}
        learnerInterests={learnerProfile?.interests || ['Python']}
        curriculumGoal={curriculum.goal}
        nextItem={nextItem}
        prevItem={prevItem}
        totalItems={allItems.length}
        currentIndex={currentIndex}
      />
    </>
  );
}
