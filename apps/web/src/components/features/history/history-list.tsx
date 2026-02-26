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
  const [completedOnly, setCompletedOnly] = useState(false);

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
      const matchesCompleted = !completedOnly || item.progress_status === 'completed';
      return matchesQuery && matchesLanguage && matchesDifficulty && matchesMethod && matchesCompleted;
    });
  }, [completedOnly, contents, difficultyFilter, languageFilter, methodFilter, query]);

  const groupedRecords = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    const dayOfWeek = (today.getDay() + 6) % 7; // Monday-based
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

  const streakDays = useMemo(() => {
    const dayKey = (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    const studiedDays = new Set<string>();
    contents.forEach((item) => {
      const source = item.last_studied_at || null;
      if (!source) return;
      const key = dayKey(source);
      if (key) studiedDays.add(key);
    });

    if (studiedDays.size === 0) return 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    let streak = 0;
    while (true) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (!studiedDays.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [contents]);

  const bestQuizScore = useMemo(() => {
    const scores = contents
      .map((item) => item.quiz_score)
      .filter((score): score is number => typeof score === 'number');
    if (scores.length === 0) return null;
    return Math.max(...scores);
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
          내가 해낸 학습을 확인하고 다음 목표를 이어가세요.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{weeklyCompletedCount}</p>
            <p className="text-xs text-muted-foreground">이번 주 완료한 학습</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{streakDays}일</p>
            <p className="text-xs text-muted-foreground">연속 학습</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{bestQuizScore !== null ? `${bestQuizScore}점` : '-'}</p>
            <p className="text-xs text-muted-foreground">최고 퀴즈 점수</p>
          </CardContent>
        </Card>
      </div>

      {wrongQueueCount > 0 && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="w-4 h-4 text-primary" />
                  지금 흐름 유지하기
                </CardTitle>
                <CardDescription>
                  복습 세션에 {wrongQueueCount}문항이 준비되어 있습니다. 지금 정리하면 다음 학습이 더 쉬워집니다.
                </CardDescription>
              </div>
              <Link href="/review">
                <Button size="sm">복습 세션 이동</Button>
              </Link>
            </div>
          </CardHeader>
        </Card>
      )}

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
            <Button variant={completedOnly ? 'primary' : 'secondary'} onClick={() => setCompletedOnly((prev) => !prev)}>
              완료 항목만 보기
            </Button>
          </div>
        </CardContent>
      </Card>

      {topicSummaries.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">주제별 학습 요약</CardTitle>
            <CardDescription>
              어떤 주제를 얼마나 학습했는지 한눈에 확인하세요.
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
                    최근 {new Date(summary.latestAt).toLocaleDateString('ko-KR')}
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
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              학습일: {new Date(studiedAt).toLocaleDateString('ko-KR')}
                            </span>
                          </div>
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
    </div>
  );
}
