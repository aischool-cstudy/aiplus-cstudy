import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWrongReviewQueue } from '@/actions/content';
import { TopBar } from '@/components/layout/top-bar';
import { WrongReviewSession } from '@/components/features/history/wrong-review-session';

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const questions = await getWrongReviewQueue(user.id);

  return (
    <>
      <TopBar title="오답 복습 세션" />
      <WrongReviewSession questions={questions} />
    </>
  );
}
