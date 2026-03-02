'use client';

import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  PlayCircle,
  BookOpen,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { Course, Topic, LearningProgress } from '@/types';

interface LearnContentProps {
  courses: (Course & { topics: Topic[] })[];
  progress: LearningProgress[];
}

export function LearnContent({ courses, progress }: LearnContentProps) {
  const progressMap = new Map(
    progress.map((p) => [p.topic_id, p])
  );

  function getTopicStatus(topicId: string): 'completed' | 'in_progress' | 'not_started' {
    return progressMap.get(topicId)?.status || 'not_started';
  }

  function getCourseProgress(topics: Topic[]): number {
    const completed = topics.filter((t) => getTopicStatus(t.id) === 'completed').length;
    return topics.length > 0 ? Math.round((completed / topics.length) * 100) : 0;
  }

  if (courses.length === 0) {
    return (
      <div className="px-4 md:px-8 py-12 text-center">
        <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold">아직 코스가 없습니다</h2>
        <p className="text-muted-foreground mt-2">곧 새로운 코스가 추가될 예정이에요.</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold">학습 경로</h2>
        <p className="text-muted-foreground text-sm mt-1">
          순서대로 토픽을 학습하며 실력을 키워보세요.
        </p>
      </div>

      <div className="space-y-8">
        {courses.map((course) => {
          const courseProgress = getCourseProgress(course.topics);

          return (
            <Card key={course.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{course.name}</CardTitle>
                    <CardDescription className="mt-1">{course.description}</CardDescription>
                  </div>
                  <Badge variant={courseProgress === 100 ? 'success' : 'primary'}>
                    {courseProgress}%
                  </Badge>
                </div>
                <ProgressBar value={courseProgress} size="sm" className="mt-3" />
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {course.topics.map((topic, idx) => {
                    const status = getTopicStatus(topic.id);

                    return (
                      <Link
                        key={topic.id}
                        href={`/learn/${topic.id}`}
                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors group"
                      >
                        {/* Status icon */}
                        <div className="flex-shrink-0">
                          {status === 'completed' ? (
                            <CheckCircle2 className="w-6 h-6 text-success" />
                          ) : status === 'in_progress' ? (
                            <PlayCircle className="w-6 h-6 text-primary" />
                          ) : (
                            <Circle className="w-6 h-6 text-muted-foreground" />
                          )}
                        </div>

                        {/* Order number */}
                        <span className="text-sm text-muted-foreground font-mono w-6 text-right">
                          {idx + 1}
                        </span>

                        {/* Topic info */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${status === 'completed' ? 'text-muted-foreground' : ''}`}>
                            {topic.title}
                          </p>
                          {topic.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {topic.description}
                            </p>
                          )}
                        </div>

                        {/* Status badge */}
                        {status === 'completed' && (
                          <Badge variant="success">완료</Badge>
                        )}
                        {status === 'in_progress' && (
                          <Badge variant="primary">진행중</Badge>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
