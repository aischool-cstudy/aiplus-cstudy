'use client';

import Link from 'next/link';
import {
  Plus,
  BookOpen,
  ArrowRight,
  Clock,
  Target,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { UserCurriculum } from '@/types';
import { getTeachingMethodLabel } from '@/lib/ai/teaching-methods';

interface CurriculumListProps {
  curriculums: UserCurriculum[];
}

const statusConfig: Record<string, { label: string; variant: 'primary' | 'success' | 'warning' | 'default' }> = {
  draft: { label: '작성중', variant: 'default' },
  active: { label: '진행중', variant: 'primary' },
  paused: { label: '일시정지', variant: 'warning' },
  completed: { label: '완료', variant: 'success' },
};

const levelLabels: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
};

export function CurriculumList({ curriculums }: CurriculumListProps) {
  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">내 커리큘럼</h2>
          <p className="text-muted-foreground text-sm mt-1">
            목표에 맞는 맞춤 커리큘럼을 만들고 학습하세요.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            삭제는 커리큘럼 상세 화면에서 할 수 있습니다.
          </p>
        </div>
        <Link href="/curriculum/new">
          <Button>
            <Plus className="w-4 h-4 mr-1" />
            새 커리큘럼
          </Button>
        </Link>
      </div>

      {curriculums.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">아직 커리큘럼이 없습니다</h3>
            <p className="text-muted-foreground mb-6">
              학습 목표를 입력하면 AI가 맞춤 커리큘럼을 만들어줍니다.
            </p>
            <Link href="/curriculum/new">
              <Button size="lg">
                <Plus className="w-4 h-4 mr-2" />
                첫 커리큘럼 만들기
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {curriculums.map((c) => {
            const status = statusConfig[c.status] || statusConfig.draft;
            return (
              <Card key={c.id} className="mb-4">
                <CardContent>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <Badge>{levelLabels[c.assessed_level] || c.assessed_level}</Badge>
                        {c.teaching_method && <Badge>{getTeachingMethodLabel(c.teaching_method)}</Badge>}
                      </div>
                      <h3 className="font-semibold text-lg">{c.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{c.goal}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {c.total_days}일 과정
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          <time dateTime={c.created_at} suppressHydrationWarning>
                            {new Date(c.created_at).toLocaleDateString('ko-KR')}
                          </time>
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Link href={`/curriculum/${c.id}`}>
                        <Button size="md" variant="secondary" className="min-w-[116px]">
                          학습하기
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
