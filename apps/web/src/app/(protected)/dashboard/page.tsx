import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getUserHistoryContents } from '@/actions/content';
import { getUserCurriculums, getCurriculumItems } from '@/actions/curriculum';
import { TopBar } from '@/components/layout/top-bar';
import { DashboardContent } from '@/components/features/dashboard/dashboard-content';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // 온보딩 확인
  const { data: learnerProfile } = await supabase
    .from('learner_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!learnerProfile?.onboarding_completed) {
    redirect('/onboarding');
  }

  // 프로필
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // 최근 콘텐츠 + 복습 우선순위 데이터
  const historyContents = await getUserHistoryContents(user.id);
  const recentContents = historyContents.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    language: item.language,
    difficulty: item.difficulty,
    created_at: item.created_at,
  }));
  const reviewCandidates = historyContents
    .filter((item) => item.needs_review)
    .sort((a, b) => b.review_score - a.review_score)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      review_score: item.review_score,
      review_reason: item.review_reason,
      review_factors: item.review_factors,
    }));

  // 활성 커리큘럼들
  const allCurriculums = await getUserCurriculums();
  const activeCurriculums = allCurriculums.filter(c => c.status === 'active');

  // 활성 커리큘럼의 아이템 통계
  const curriculumStats = await Promise.all(
    activeCurriculums.slice(0, 3).map(async (c) => {
      const items = await getCurriculumItems(c.id);
      const completed = items.filter(i => i.status === 'completed').length;
      const total = items.length;
      const nextPendingDay = items.find(i => i.status !== 'completed')?.day_number ?? null;
      const nextItems = nextPendingDay === null
        ? []
        : items.filter(i => i.day_number === nextPendingDay && i.status !== 'completed');

      return {
        curriculum: c,
        completed,
        total,
        nextDay: nextPendingDay,
        nextItems,
      };
    })
  );

  return (
    <>
      <TopBar
        title="대시보드"
        userName={profile?.name || user.email || '사용자'}
      />
      <DashboardContent
        profile={profile}
        learnerProfile={learnerProfile}
        recentContents={recentContents}
        curriculumStats={curriculumStats}
        reviewCandidates={reviewCandidates}
      />
    </>
  );
}
