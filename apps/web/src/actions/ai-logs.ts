'use server';

import { createClient } from '@/lib/supabase/server';
import { classifyAIGenerationError, type AIGenerationErrorCode } from '@/lib/ai/errors';
import type { AICallMeta } from '@/lib/ai/schemas';
import { logger } from '@/lib/observability/logger';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface AIGenerationLogInput {
  userId: string;
  pipeline: string;
  stage: string;
  status: 'started' | 'success' | 'failed';
  traceId?: string | null;
  aiCallMeta?: AICallMeta | null;
  latencyMs?: number | null;
  errorCode?: AIGenerationErrorCode | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

function resolveAIProvider(): string {
  const provider = String(process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  return provider || 'gemini';
}

function resolveAIModel(provider: string): string {
  if (provider === 'openai') {
    return String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  }
  return String(process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim() || 'gemini-2.0-flash';
}

export async function insertAIGenerationLog(
  supabase: SupabaseServerClient,
  input: AIGenerationLogInput
) {
  const resolvedCode = input.errorCode
    || (
      input.status === 'failed'
        ? classifyAIGenerationError({
          errorCode: input.aiCallMeta?.errorCode,
          legacyDetail: input.errorMessage,
        })
        : null
    );
  const provider = resolveAIProvider();
  const model = resolveAIModel(provider);
  const baseMetadata: Record<string, unknown> = {
    aiProvider: provider,
    aiModel: model,
    aiGateway: 'fastapi',
  };
  if (input.traceId) {
    baseMetadata.traceId = input.traceId;
  }
  if (input.aiCallMeta) {
    baseMetadata.aiCall = input.aiCallMeta;
    baseMetadata.endpoint = input.aiCallMeta.endpoint;
    baseMetadata.status = input.aiCallMeta.status;
    baseMetadata.attemptCount = input.aiCallMeta.attemptCount;
    baseMetadata.fallbackUsed = input.aiCallMeta.fallbackUsed ?? false;
    baseMetadata.fallbackKind = input.aiCallMeta.fallbackKind ?? null;
    baseMetadata.provider = input.aiCallMeta.provider || provider;
    baseMetadata.model = input.aiCallMeta.model || model;
  }
  const metadata = {
    ...baseMetadata,
    ...(input.metadata || {}),
  };

  const { error } = await supabase
    .from('ai_generation_logs')
    .insert({
      user_id: input.userId,
      pipeline: input.pipeline,
      stage: input.stage,
      status: input.status,
      error_code: resolvedCode,
      error_message: input.errorMessage || null,
      latency_ms: typeof input.latencyMs === 'number' ? Math.max(0, Math.round(input.latencyMs)) : null,
      metadata,
    });

  if (error && error.message.includes('ai_generation_logs')) {
    // 마이그레이션 적용 전 하위 호환
    return;
  }

  if (error) {
    logger.error('[ai_generation_logs] insert failed', error.message);
  }
}
