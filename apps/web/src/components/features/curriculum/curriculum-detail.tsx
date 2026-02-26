'use client';

import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  PlayCircle,
  Calendar,
  Clock,
  ArrowLeft,
  BookOpen,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { UserCurriculum, CurriculumItem, DaySchedule } from '@/types';
import { getTeachingMethodLabel } from '@/lib/ai/teaching-methods';
import { CurriculumDeleteButton } from './curriculum-delete-button';

interface CurriculumDetailProps {
  curriculum: UserCurriculum;
  items: CurriculumItem[];
}

const statusConfig = {
  active: { label: '진행중', variant: 'primary' as const },
  paused: { label: '일시정지', variant: 'warning' as const },
  completed: { label: '완료', variant: 'success' as const },
  draft: { label: '작성중', variant: 'default' as const },
};

export function CurriculumDetail({ curriculum, items }: CurriculumDetailProps) {
  // 일별로 그룹핑
  const dayMap = new Map<number, CurriculumItem[]>();
  items.forEach(item => {
    const existing = dayMap.get(item.day_number) || [];
    existing.push(item);
    dayMap.set(item.day_number, existing);
  });

  const days: DaySchedule[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([day, dayItems]) => ({ day, items: dayItems }));

  const completedCount = items.filter(i => i.status === 'completed').length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // 오늘이 몇째 날인지 계산 (같은 날짜는 항상 Day 1)
  const startDate = curriculum.start_date ? new Date(`${curriculum.start_date}T00:00:00`) : null;
  const today = new Date();
  const elapsedDays = startDate
    ? Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const currentDay = elapsedDays + 1;

  const status = statusConfig[curriculum.status] || statusConfig.draft;

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <Link href="/curriculum" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> 커리큘럼 목록
        </Link>
        <CurriculumDeleteButton curriculumId={curriculum.id} />
      </div>

      {/* Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={status.variant}>{status.label}</Badge>
            {curriculum.teaching_method && <Badge>{getTeachingMethodLabel(curriculum.teaching_method)}</Badge>}
          </div>
          <CardTitle className="text-xl">{curriculum.title}</CardTitle>
          <CardDescription>{curriculum.goal}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {curriculum.total_days}일 과정
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="w-4 h-4" />
                {completedCount}/{totalCount} 완료
              </span>
              {startDate && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Day {Math.min(currentDay, curriculum.total_days)}
                </span>
              )}
            </div>
            <span className="text-sm font-medium">{progressPercent}%</span>
          </div>
          <ProgressBar value={progressPercent} />
        </CardContent>
      </Card>

      {/* Daily schedule */}
      <div className="space-y-4">
        {days.map(({ day, items: dayItems }) => {
          const isToday = day === Math.min(currentDay, curriculum.total_days);
          const dayCompleted = dayItems.every(i => i.status === 'completed');

          return (
            <Card
              key={day}
              className={isToday ? 'border-primary/30 bg-primary/[0.02]' : ''}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">
                      Day {day}
                    </CardTitle>
                    {isToday && <Badge variant="primary">오늘</Badge>}
                    {dayCompleted && <Badge variant="success">완료</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {dayItems.length}개 항목
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dayItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/curriculum/${curriculum.id}/learn/${item.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="flex-shrink-0">
                        {item.status === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5 text-success" />
                        ) : item.status === 'in_progress' ? (
                          <PlayCircle className="w-5 h-5 text-primary" />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${item.status === 'completed' ? 'text-muted-foreground line-through' : ''}`}>
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        )}
                      </div>
                      {item.status === 'completed' && (
                        <Badge variant="success">완료</Badge>
                      )}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
