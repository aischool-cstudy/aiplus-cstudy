import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/layout/top-bar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, BookOpen, Clock3 } from 'lucide-react';

interface StartPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pick(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function StartPage({ searchParams }: StartPageProps) {
  const params = (await searchParams) || {};
  const from = pick(params, 'from');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: learner } = await supabase
    .from('learner_profiles')
    .select('onboarding_completed, goal')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!learner?.onboarding_completed) {
    redirect('/onboarding');
  }

  // 일반 탐색 중 들어온 경우엔 대시보드로 보낸다.
  if (from !== 'onboarding') {
    redirect('/dashboard');
  }

  return (
    <>
      <TopBar title="학습 시작" />
      <div className="px-4 md:px-8 py-6 max-w-3xl">
        <Card className="mb-4 border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <CardTitle>초기 설정이 완료되었습니다</CardTitle>
            </div>
            <CardDescription>
              {learner.goal
                ? `목표: ${learner.goal}`
                : '다음 단계에서 학습을 시작할 방식을 선택하세요.'}
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">커리큘럼부터 시작</CardTitle>
              </div>
              <CardDescription>
                진단을 거쳐 학습 순서를 먼저 만들고, 오늘의 학습으로 바로 이어갑니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/curriculum/new">
                <Button className="w-full">
                  커리큘럼 만들기
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock3 className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">나중에 커리큘럼 만들기</CardTitle>
              </div>
              <CardDescription>
                커리큘럼 시작 전후로 문제 훈련 세트를 먼저 풀어볼 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/generate">
                <Button variant="secondary" className="w-full">
                  문제 훈련 시작
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="ghost" className="w-full">
                  대시보드로 이동
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
