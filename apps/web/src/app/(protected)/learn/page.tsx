import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getCourses, getCourseTopics } from '@/actions/content';
import { getProgress } from '@/actions/progress';
import { TopBar } from '@/components/layout/top-bar';
import { LearnContent } from '@/components/features/learn/learn-content';

export default async function LearnPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const courses = await getCourses();

  // 각 코스의 토픽 가져오기
  const coursesWithTopics = await Promise.all(
    courses.map(async (course) => {
      const topics = await getCourseTopics(course.id);
      return { ...course, topics };
    })
  );

  // 사용자 진도
  const progress = await getProgress(user.id);

  return (
    <>
      <TopBar title="학습" />
      <LearnContent
        courses={coursesWithTopics}
        progress={progress}
      />
    </>
  );
}
