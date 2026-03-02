'use server';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/observability/logger';
import type { LearningProgress } from '@/types';

export async function getProgress(userId: string): Promise<LearningProgress[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('learning_progress')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error('[getProgress] query failed', error);
    return [];
  }
  return data as LearningProgress[];
}

export async function getTopicProgress(
  userId: string,
  topicId: string
): Promise<LearningProgress | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('learning_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .single();

  return data as LearningProgress | null;
}

export async function updateProgress(params: {
  userId: string;
  topicId?: string;
  contentId?: string;
  status: 'not_started' | 'in_progress' | 'completed';
  quizScore?: number;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const record: Record<string, unknown> = {
    user_id: params.userId,
    status: params.status,
    updated_at: new Date().toISOString(),
  };
  if (params.topicId) record.topic_id = params.topicId;
  if (params.contentId) record.content_id = params.contentId;
  if (params.status === 'completed') record.completed_at = new Date().toISOString();
  if (params.quizScore !== undefined) record.quiz_score = params.quizScore;

  // upsert by user_id + topic_id
  if (params.topicId) {
    const { error } = await supabase
      .from('learning_progress')
      .upsert(record, { onConflict: 'user_id,topic_id' });
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('learning_progress')
      .insert(record);
    if (error) return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getCompletedTopicCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('learning_progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed');

  return count ?? 0;
}
