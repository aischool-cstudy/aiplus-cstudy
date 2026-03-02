import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAIOpsMetrics } from '@/actions/analytics';
import { TopBar } from '@/components/layout/top-bar';
import { OpsDashboard } from '@/components/features/ops/ops-dashboard';

export default async function OpsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single();

  const metrics = await getAIOpsMetrics(7);

  return (
    <>
      <TopBar title="운영 지표" userName={profile?.name || user.email || '사용자'} />
      <OpsDashboard metrics={metrics} />
    </>
  );
}
