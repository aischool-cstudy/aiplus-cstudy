import { createClient } from '@/lib/supabase/server';
import type { AICallMeta } from '@/lib/ai/schemas';
import type { AIGenerationErrorCode } from '@/lib/ai/errors';
import { insertAIGenerationLog } from '@/actions/ai-logs';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const LEARNING_PIPELINE = 'curriculum_learning_generate';

export async function logLearningPipelineStage(
  supabase: SupabaseServerClient,
  input: {
    userId: string;
    traceId: string;
    stage: string;
    status: 'started' | 'success' | 'failed';
    aiCallMeta?: AICallMeta | null;
    latencyMs?: number;
    errorCode?: AIGenerationErrorCode | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await insertAIGenerationLog(supabase, {
    userId: input.userId,
    pipeline: LEARNING_PIPELINE,
    stage: input.stage,
    status: input.status,
    traceId: input.traceId,
    aiCallMeta: input.aiCallMeta,
    latencyMs: input.latencyMs,
    errorCode: input.errorCode || null,
    errorMessage: input.errorMessage || null,
    metadata: input.metadata,
  });
}
