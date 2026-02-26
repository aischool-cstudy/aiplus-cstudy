'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import {
  Sparkles,
  BookOpen,
  ArrowRight,
  Target,
  Plus,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { trackRecommendationEvent } from '@/lib/analytics/client-events';
import type { UserCurriculum, CurriculumItem } from '@/types';

interface CurriculumStat {
  curriculum: UserCurriculum;
  completed: number;
  total: number;
  nextDay: number | null;
  nextItems: CurriculumItem[];
}

interface ReviewCandidate {
  id: string;
  title: string;
  review_score: number;
  review_reason: string | null;
  review_factors: string[];
}

interface DashboardContentProps {
  profile: {
    name: string | null;
  } | null;
  learnerProfile: {
    goal: string | null;
  } | null;
  recentContents: {
    id: string;
    title: string;
    language: string;
    difficulty: string;
    created_at: string;
  }[];
  curriculumStats?: CurriculumStat[];
  reviewCandidates?: ReviewCandidate[];
}

interface CurriculumFocus {
  curriculumId: string;
  curriculumTitle: string;
  nextDay: number | null;
  nextItem: CurriculumItem | null;
  completed: number;
  total: number;
  percent: number;
  hasInProgress: boolean;
}

function pickCurriculumFocus(curriculumStats: CurriculumStat[]): CurriculumFocus | null {
  const rows = curriculumStats
    .map((stat) => {
      const inProgressItem = stat.nextItems.find((item) => item.status === 'in_progress') || null;
      const nextItem = inProgressItem || stat.nextItems[0] || null;
      const percent = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0;
      return {
        curriculumId: stat.curriculum.id,
        curriculumTitle: stat.curriculum.title,
        nextDay: stat.nextDay,
        nextItem,
        completed: stat.completed,
        total: stat.total,
        percent,
        hasInProgress: Boolean(inProgressItem),
      };
    })
    .sort((a, b) =>
      Number(b.hasInProgress) - Number(a.hasInProgress)
      || Number(Boolean(b.nextItem)) - Number(Boolean(a.nextItem))
      || a.percent - b.percent
      || b.total - a.total
    );

  return rows[0] || null;
}

function buildManagerBrief(topReview: ReviewCandidate | null, focus: CurriculumFocus | null, hasCurriculum: boolean) {
  if (topReview && topReview.review_score >= 70) {
    return {
      badgeLabel: '복습 긴급',
      badgeVariant: 'warning' as const,
      title: '지금 복습하면 실력이 훨씬 오래 남습니다.',
      summary: `"${topReview.title}"의 복습 점수가 ${topReview.review_score}점입니다. 오늘 10~15분만 먼저 복습해도 다음 학습 속도가 확실히 빨라집니다.`,
      reasons: topReview.review_factors.slice(0, 2),
      primaryHref: `/history/${topReview.id}`,
      primaryLabel: '복습 시작',
      secondaryHref: '/history',
      secondaryLabel: '복습 허브 보기',
    };
  }

  if (focus && focus.nextItem) {
    return {
      badgeLabel: '진행 추천',
      badgeVariant: 'primary' as const,
      title: '좋아요, 오늘은 이 한 단계만 끝내봅시다.',
      summary: `"${focus.curriculumTitle}"의 "${focus.nextItem.title}"를 이어서 진행하세요. 작은 완료 1개가 누적되면 목표가 훨씬 빨리 현실이 됩니다.`,
      reasons: [
        `진행률 ${focus.completed}/${focus.total} (${focus.percent}%)`,
        `권장 순서 Day ${focus.nextDay ?? focus.nextItem.day_number}`,
      ],
      primaryHref: `/curriculum/${focus.curriculumId}/learn/${focus.nextItem.id}`,
      primaryLabel: '이어서 학습',
      secondaryHref: `/curriculum/${focus.curriculumId}`,
      secondaryLabel: '커리큘럼 보기',
    };
  }

  if (hasCurriculum) {
    return {
      badgeLabel: '정리 단계',
      badgeVariant: 'success' as const,
      title: '지금까지 잘 해왔고, 이제 다음 페이스를 정하면 됩니다.',
      summary: '진행 중 커리큘럼을 한 번 점검하고 다음 학습 한 개만 고르세요. 흐름만 유지해도 성과는 꾸준히 쌓입니다.',
      reasons: [],
      primaryHref: '/curriculum',
      primaryLabel: '커리큘럼 열기',
      secondaryHref: '/curriculum/new',
      secondaryLabel: '새 커리큘럼 만들기',
    };
  }

  return {
    badgeLabel: '시작 단계',
    badgeVariant: 'primary' as const,
    title: '첫 커리큘럼만 만들면, 그 다음은 훨씬 쉬워집니다.',
    summary: '지금 1분 투자해서 맞춤 커리큘럼을 만들고 바로 첫 학습을 시작해보세요. 시작 장벽을 넘는 순간 학습 루틴이 만들어집니다.',
    reasons: [],
    primaryHref: '/curriculum/new',
    primaryLabel: '커리큘럼 만들기',
    secondaryHref: '/generate',
    secondaryLabel: '문제 훈련 시작',
  };
}

export function DashboardContent({
  profile,
  learnerProfile,
  recentContents,
  curriculumStats = [],
  reviewCandidates = [],
}: DashboardContentProps) {
  const topReview = reviewCandidates[0] || null;
  const focus = pickCurriculumFocus(curriculumStats);
  const managerBrief = buildManagerBrief(topReview, focus, curriculumStats.length > 0);
  const impressionLoggedRef = useRef(false);

  useEffect(() => {
    if (impressionLoggedRef.current) return;
    impressionLoggedRef.current = true;
    trackRecommendationEvent({
      surface: 'dashboard_brief',
      actionType: 'impression',
      targetType: 'brief_primary',
      targetId: managerBrief.primaryHref,
      payload: {
        primaryLabel: managerBrief.primaryLabel,
        secondaryLabel: managerBrief.secondaryLabel,
      },
    });
  }, [managerBrief.primaryHref, managerBrief.primaryLabel, managerBrief.secondaryLabel]);

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">
          안녕하세요{profile?.name ? `, ${profile.name}` : ''}님
        </h2>
        <p className="text-muted-foreground mt-1">
          {learnerProfile?.goal
            ? `현재 목표: ${learnerProfile.goal}`
            : '오늘 할 일을 먼저 정하고 바로 학습을 시작해보세요.'}
        </p>
      </div>

      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/80 border border-primary/20 flex items-center justify-center">
                {managerBrief.badgeVariant === 'warning' ? (
                  <AlertTriangle className="w-5 h-5 text-warning" />
                ) : (
                  <Sparkles className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <Badge variant={managerBrief.badgeVariant}>{managerBrief.badgeLabel}</Badge>
                <CardTitle className="text-base mt-2">학습매니저 브리핑</CardTitle>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{managerBrief.title}</p>
          <p className="text-sm text-muted-foreground mt-1">{managerBrief.summary}</p>
          {managerBrief.reasons.length > 0 && (
            <ul className="mt-3 text-xs text-muted-foreground space-y-1">
              {managerBrief.reasons.map((reason, idx) => (
                <li key={`${reason}-${idx}`}>- {reason}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={managerBrief.primaryHref}
              onClick={() => {
                trackRecommendationEvent({
                  surface: 'dashboard_brief',
                  actionType: 'click',
                  targetType: 'brief_primary',
                  targetId: managerBrief.primaryHref,
                  payload: { label: managerBrief.primaryLabel },
                });
              }}
            >
              <Button size="sm">
                {managerBrief.primaryLabel}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
            <Link
              href={managerBrief.secondaryHref}
              onClick={() => {
                trackRecommendationEvent({
                  surface: 'dashboard_brief',
                  actionType: 'click',
                  targetType: 'brief_secondary',
                  targetId: managerBrief.secondaryHref,
                  payload: { label: managerBrief.secondaryLabel },
                });
              }}
            >
              <Button size="sm" variant="secondary">
                {managerBrief.secondaryLabel}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {curriculumStats.length > 0 ? (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">진행 중 커리큘럼 요약</CardTitle>
              <Link href="/curriculum" className="text-sm text-primary hover:underline">
                전체 보기
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {curriculumStats.slice(0, 3).map(({ curriculum, completed, total, nextItems }) => {
              const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
              const nextItem = nextItems.find((item) => item.status === 'in_progress') || nextItems[0] || null;

              return (
                <div key={curriculum.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{curriculum.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {completed}/{total} 완료 · {percent}%
                      </p>
                    </div>
                    {nextItem ? (
                      <Link href={`/curriculum/${curriculum.id}/learn/${nextItem.id}`}>
                        <Button size="sm">이어하기</Button>
                      </Link>
                    ) : (
                      <Link href={`/curriculum/${curriculum.id}`}>
                        <Button size="sm" variant="secondary">보기</Button>
                      </Link>
                    )}
                  </div>
                  <ProgressBar value={percent} size="sm" className="mt-2" />
                  {nextItem ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      다음 학습: Day {nextItem.day_number} · {nextItem.title}
                    </p>
                  ) : (
                    <p className="text-xs text-success mt-2">모든 학습 항목을 완료했습니다.</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6 border-dashed">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium">맞춤 커리큘럼 만들기</p>
              <p className="text-sm text-muted-foreground">학습 목표를 입력하면 AI가 학습 순서를 설계합니다.</p>
            </div>
            <Link href="/curriculum/new">
              <Button>
                <Plus className="w-4 h-4 mr-1" />
                시작하기
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Link href="/curriculum">
          <Card hover>
            <CardContent>
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-primary" />
                <div>
                  <p className="font-medium">커리큘럼 관리</p>
                  <p className="text-sm text-muted-foreground">계획/진행 상태 확인</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/generate">
          <Card hover>
            <CardContent>
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-primary" />
                <div>
                  <p className="font-medium">문제 훈련 세트</p>
                  <p className="text-sm text-muted-foreground">주제별 점검 문제 생성</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/history">
          <Card hover>
            <CardContent>
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-primary" />
                <div>
                  <p className="font-medium">복습 허브</p>
                  <p className="text-sm text-muted-foreground">복습 우선순위 확인</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {recentContents.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">최근 생성 자료</CardTitle>
              <Link href="/history" className="text-sm text-primary hover:underline">
                전체 보기
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentContents.map((c) => (
                <Link
                  key={c.id}
                  href={`/history/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{c.title}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="primary">{c.language}</Badge>
                      <Badge>{c.difficulty}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <BookOpen className="w-4 h-4" />
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
