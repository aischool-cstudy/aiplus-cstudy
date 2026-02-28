import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getUserHistoryContents } from '@/actions/content';
import { TopBar } from '@/components/layout/top-bar';
import { HistoryList } from '@/components/features/history/history-list';

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const contents = await getUserHistoryContents(user.id);

  return (
    <>
      <TopBar title="학습 기록 허브" />
      <HistoryList contents={contents} />
    </>
  );
}
