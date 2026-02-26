import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getHistoryContent } from '@/actions/content';
import { TopBar } from '@/components/layout/top-bar';
import { ContentDetail } from '@/components/features/history/content-detail';

interface ContentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ContentDetailPage({ params }: ContentDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const content = await getHistoryContent(id, user.id);
  if (!content) {
    redirect('/history');
  }

  return (
    <>
      <TopBar title={content.title} />
      <ContentDetail content={content} />
    </>
  );
}
