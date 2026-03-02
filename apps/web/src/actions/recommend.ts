'use server';

import { createClient } from '@/lib/supabase/server';

export interface Recommendation {
  topicId: string;
  topicTitle: string;
  courseSlug: string;
  courseName: string;
  reason: string;
}

/**
 * 규칙 기반 추천: 코스의 다음 미완료 토픽을 추천
 */
export async function getNextRecommendation(
  userId: string
): Promise<Recommendation | null> {
  const supabase = await createClient();

  // 1. 모든 코스의 토픽을 순서대로 가져오기
  const { data: courses } = await supabase
    .from('courses')
    .select('id, slug, name')
    .order('order');

  if (!courses || courses.length === 0) return null;

  // 2. 사용자 진도 가져오기
  const { data: progress } = await supabase
    .from('learning_progress')
    .select('topic_id, status')
    .eq('user_id', userId);

  const completedTopics = new Set(
    (progress || [])
      .filter((p) => p.status === 'completed')
      .map((p) => p.topic_id)
  );

  // 3. 각 코스에서 다음 미완료 토픽 찾기
  for (const course of courses) {
    const { data: topics } = await supabase
      .from('topics')
      .select('id, title')
      .eq('course_id', course.id)
      .order('order');

    if (!topics) continue;

    const nextTopic = topics.find((t) => !completedTopics.has(t.id));
    if (nextTopic) {
      return {
        topicId: nextTopic.id,
        topicTitle: nextTopic.title,
        courseSlug: course.slug,
        courseName: course.name,
        reason: `${course.name} 코스의 다음 단계입니다.`,
      };
    }
  }

  return null;
}
