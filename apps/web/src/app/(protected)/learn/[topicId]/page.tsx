import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTopicById, getTopicContent } from '@/actions/content';
import { getTopicProgress } from '@/actions/progress';
import { TopBar } from '@/components/layout/top-bar';
import { TopicSession } from '@/components/features/learn/topic-session';

interface TopicPageProps {
  params: Promise<{ topicId: string }>;
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { topicId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const topic = await getTopicById(topicId);
  if (!topic) {
    redirect('/learn');
  }

  const content = await getTopicContent(topicId, user.id);
  const progress = await getTopicProgress(user.id, topicId);

  // learner profile 가져오기 (생성 시 파라미터 활용)
  const { data: learnerProfile } = await supabase
    .from('learner_profiles')
    .select('interests, level, preferred_teaching_method')
    .eq('user_id', user.id)
    .single();

  // 코스 내 다음 토픽 찾기
  const { data: nextTopics } = await supabase
    .from('topics')
    .select('id, title')
    .eq('course_id', topic.course_id)
    .gt('order', topic.order)
    .order('order')
    .limit(1);

  const nextTopic = nextTopics?.[0] || null;

  return (
    <>
      <TopBar title={topic.title} />
      <TopicSession
        topic={topic}
        content={content}
        progress={progress}
        userId={user.id}
        nextTopic={nextTopic}
        learnerLevel={learnerProfile?.level || 'beginner'}
        learnerInterests={learnerProfile?.interests || ['Python']}
        learnerPreferredTeachingMethod={learnerProfile?.preferred_teaching_method}
      />
    </>
  );
}
