'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, ArrowRight, FileText, Search, Flame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { HistoryContentItem } from '@/types';
import { TEACHING_METHOD_OPTIONS, normalizeTeachingMethod } from '@/lib/ai/teaching-methods';

interface HistoryListProps {
  contents: HistoryContentItem[];
}

type FocusFilter = 'all' | 'review_needed' | 'completed';

const difficultyLabels: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
};

const progressLabels: Record<string, string> = {
  not_started: '미시작',
  in_progress: '학습 중',
  completed: '완료',
};

export function HistoryList({ contents }: HistoryListProps) {
  const [query, setQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all');

  const languageOptions = useMemo(() => {
    const values = Array.from(new Set(contents.map((item) => item.language)));
    return [{ value: 'all', label: '모든 언어' }, ...values.map((v) => ({ value: v, label: v }))];
  }, [contents]);

  const difficultyOptions = [
    { value: 'all', label: '모든 난이도' },
    { value: 'beginner', label: '초급' },
    { value: 'intermediate', label: '중급' },
    { value: 'advanced', label: '고급' },
  ];

  const methodOptions = [
    { value: 'all', label: '모든 설명 방식' },
    ...TEACHING_METHOD_OPTIONS,
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contents.filter((item) => {
      const matchesQuery = q.length === 0 || `${item.title} ${item.topic} ${item.target_audience}`.toLowerCase().includes(q);
      const matchesLanguage = languageFilter === 'all' || item.language === languageFilter;
      const matchesDifficulty = difficultyFilter === 'all' || item.difficulty === difficultyFilter;
      const matchesMethod = methodFilter === 'all' || normalizeTeachingMethod(item.teaching_method) === methodFilter;
      const matchesFocus = (
        focusFilter === 'all'
        || (focusFilter === 'review_needed' && item.needs_review)
        || (focusFilter === 'completed' && item.progress_status === 'completed')
      );
      return matchesQuery && matchesLanguage && matchesDifficulty && matchesMethod && matchesFocus;
    });
  }, [contents, difficultyFilter, focusFilter, languageFilter, methodFilter, query]);

  const groupedRecords = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    const dayOfWeek = (today.getDay() + 6) % 7;
    startOfWeek.setDate(today.getDate() - dayOfWeek);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfWeek.getDate() - 7);

    const groups: Array<{ key: string; label: string; items: HistoryContentItem[] }> = [
      { key: 'today', label: '오늘 학습', items: [] },
      { key: 'this_week', label: '이번 주 학습', items: [] },
      { key: 'last_week', label: '지난 주 학습', items: [] },
      { key: 'older', label: '이전 학습', items: [] },
    ];

    const sorted = [...filtered].sort((a, b) => (
      Number(new Date(b.last_studied_at || b.created_at))
      - Number(new Date(a.last_studied_at || a.created_at))
    ));

    sorted.forEach((item) => {
      const baseDate = new Date(item.last_studied_at || item.created_at);
      baseDate.setHours(0, 0, 0, 0);

      if (baseDate >= today) {
        groups[0].items.push(item);
        return;
      }
      if (baseDate >= startOfWeek) {
        groups[1].items.push(item);
        return;
      }
      if (baseDate >= startOfLastWeek) {
        groups[2].items.push(item);
        return;
      }
      groups[3].items.push(item);
    });

    return groups.filter((group) => group.items.length > 0);
  }, [filtered]);

  const topicSummaries = useMemo(() => {
    const map = new Map<string, {
      topic: string;
      sessionCount: number;
      completedCount: number;
      bestScore: number | null;
      latestAt: string;
      latestContentId: string;
    }>();

    filtered.forEach((item) => {
      const topic = item.topic?.trim() || item.title;
      const key = topic.toLowerCase();
      const latestAt = item.last_studied_at || item.created_at;

      const current = map.get(key);
      if (!current) {
        map.set(key, {
          topic,
          sessionCount: 1,
          completedCount: item.progress_status === 'completed' ? 1 : 0,
          bestScore: typeof item.quiz_score === 'number' ? item.quiz_score : null,
          latestAt,
          latestContentId: item.id,
        });
        return;
      }

      current.sessionCount += 1;
      if (item.progress_status === 'completed') {
        current.completedCount += 1;
      }
      if (typeof item.quiz_score === 'number') {
        current.bestScore = current.bestScore === null
          ? item.quiz_score
          : Math.max(current.bestScore, item.quiz_score);
      }
      if (new Date(latestAt).getTime() > new Date(current.latestAt).getTime()) {
        current.latestAt = latestAt;
        current.latestContentId = item.id;
      }
    });

    return Array.from(map.values())
      .sort((a, b) => (
        new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
        || b.sessionCount - a.sessionCount
      ))
      .slice(0, 8);
  }, [filtered]);

  const wrongQueueCount = contents.filter((item) => item.unresolved_wrong_count > 0).length;
  const urgentReviewCount = contents.filter((item) => item.review_level === 'urgent').length;
  const reviewNeededCount = contents.filter((item) => item.needs_review).length;
  const wrongQueueQuestions = contents.reduce((sum, item) => sum + item.unresolved_wrong_count, 0);

  const weeklyCompletedCount = useMemo(() => {
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - 6);
    return contents.filter((item) => (
      item.progress_status === 'completed'
      && item.last_studied_at
      && new Date(item.last_studied_at) >= threshold
    )).length;
  }, [contents]);

  if (contents.length === 0) {
    return (
      <div className="px-4 md:px-8 py-12 text-center">
        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold">아직 기록이 없습니다</h2>
        <p className="text-muted-foreground mt-2">
          첫 학습을 시작하고 성장 기록을 쌓아보세요.
        </p>
        <Link
          href="/generate"
          className="inline-flex items-center gap-1 text-primary font-medium mt-4 hover:underline"
        >
          문제 훈련 시작하기 <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold">학습 기록</h2>
        <p className="text-muted-foreground text-sm mt-1">
          회고와 복습을 한 번에 관리하는 학습 허브입니다.
        </p>
      </div>

      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-primary" />
                오늘 할 복습
              </CardTitle>
              <CardDescription>
                복습 필요 콘텐츠 {reviewNeededCount}개 · 오답 큐 {wrongQueueQuestions}문항
                {urgentReviewCount > 0 ? ` · 긴급 ${urgentReviewCount}개` : ''}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={focusFilter === 'review_needed' ? 'primary' : 'secondary'}
                onClick={() => setFocusFilter((prev) => (prev === 'review_needed' ? 'all' : 'review_needed'))}
              >
                복습 필요만
              </Button>
              <Link href="/review">
                <Button size="sm">복습 세션 이동</Button>
              </Link>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{reviewNeededCount}</p>
            <p className="text-xs text-muted-foreground">복습 필요한 콘텐츠</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{wrongQueueQuestions}</p>
            <p className="text-xs text-muted-foreground">오답 큐 문항</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{urgentReviewCount}</p>
            <p className="text-xs text-muted-foreground">긴급 복습</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{weeklyCompletedCount}</p>
            <p className="text-xs text-muted-foreground">최근 7일 완료</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              id="history-search"
              placeholder="주제, 제목, 대상 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select id="history-language" options={languageOptions} value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)} />
            <Select id="history-difficulty" options={difficultyOptions} value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} />
            <Select id="history-method" options={methodOptions} value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} />
            <div className="grid grid-cols-3 gap-1">
              <Button size="sm" variant={focusFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setFocusFilter('all')}>전체</Button>
              <Button size="sm" variant={focusFilter === 'review_needed' ? 'primary' : 'secondary'} onClick={() => setFocusFilter('review_needed')}>복습</Button>
              <Button size="sm" variant={focusFilter === 'completed' ? 'primary' : 'secondary'} onClick={() => setFocusFilter('completed')}>완료</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              조건에 맞는 기록이 없습니다. 검색어나 필터를 조정해보세요.
            </CardContent>
          </Card>
        ) : (
          groupedRecords.map((group) => (
            <section key={group.key} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
              {group.items.map((item) => {
                const studiedAt = item.last_studied_at || item.created_at;
                const sourceLabel = item.session_source === 'curriculum'
                  ? [
                    item.curriculum_title || '커리큘럼',
                    item.curriculum_day_number ? `${item.curriculum_day_number}일차` : '학습 세션',
                    item.curriculum_order_in_day ? `${item.curriculum_order_in_day}순서` : null,
                  ].filter(Boolean).join(' · ')
                  : '문제 훈련 단독';

                return (
                  <Card key={item.id} className="mb-3">
                    <CardContent>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{item.topic}</p>
                          <p className="text-sm text-muted-foreground truncate mt-1">{item.title}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge>{item.content_kind === 'practice_set' ? '문제 세트' : '학습 콘텐츠'}</Badge>
                            <Badge variant="primary">{item.language}</Badge>
                            <Badge>{difficultyLabels[item.difficulty] || item.difficulty}</Badge>
                            {item.progress_status && <Badge>{progressLabels[item.progress_status] || item.progress_status}</Badge>}
                            {item.quiz_score !== null && <Badge variant={item.quiz_score >= 70 ? 'success' : 'warning'}>{item.quiz_score}점</Badge>}
                            {item.review_level === 'urgent' && <Badge variant="warning">긴급 복습</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              학습일: <time dateTime={studiedAt} suppressHydrationWarning>{new Date(studiedAt).toLocaleDateString('ko-KR')}</time>
                            </span>
                            <span>{sourceLabel}</span>
                          </div>
                          {item.review_reason && (
                            <p className="text-xs text-warning mt-2">{item.review_reason}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Link href={`/history/${item.id}`}>
                            <Button size="sm">상세 보기</Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          ))
        )}
      </div>

      {topicSummaries.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">주제별 학습 요약</CardTitle>
            <CardDescription>
              최근 학습 흐름과 누적 성과를 주제 단위로 확인하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topicSummaries.map((summary) => (
              <div
                key={summary.topic}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{summary.topic}</p>
                  <p className="text-xs text-muted-foreground truncate mt-1">
                    {summary.sessionCount}회 학습
                    {' · '}
                    완료 {summary.completedCount}회
                    {summary.bestScore !== null ? ` · 최고 ${summary.bestScore}점` : ''}
                    {' · '}
                    최근 <time dateTime={summary.latestAt} suppressHydrationWarning>{new Date(summary.latestAt).toLocaleDateString('ko-KR')}</time>
                  </p>
                </div>
                <Link href={`/history/${summary.latestContentId}`}>
                  <Button size="sm" variant="secondary">최근 기록</Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {wrongQueueCount > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          오답 큐가 있는 콘텐츠 {wrongQueueCount}개가 복습 대기 중입니다.
        </p>
      )}
    </div>
  );
}
