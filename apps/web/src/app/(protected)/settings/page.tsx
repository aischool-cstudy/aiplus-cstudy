import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TopBar } from '@/components/layout/top-bar';
import { SettingsContent } from '@/components/features/settings/settings-content';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: learnerProfile } = await supabase
    .from('learner_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return (
    <>
      <TopBar title="설정" />
      <SettingsContent
        email={user.email || ''}
        profile={profile}
        learnerProfile={learnerProfile}
      />
    </>
  );
}
