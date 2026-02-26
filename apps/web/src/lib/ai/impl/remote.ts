import type {
  GenerateContentInput,
  GeneratedContentOutput,
  AIResult,
  AICallMeta,
  SearchResult,
  ValidationResult,
  RecommendationsResult,
  AssessLevelInput,
  AssessmentQuestionsOutput,
  AnalyzeAnswersInput,
  LevelAssessmentResult,
  GenerateCurriculumInput,
  CurriculumOutput,
  RefineCurriculumInput,
  GenerateCurriculumContentInput,
  PedagogicalReasoningOutput,
  SectionedContentOutput,
} from '../schemas';
import type { ApiErrorCode, ApiErrorResponse } from '@aiplus/contracts';

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const FASTAPI_MAX_RETRIES = Number(process.env.FASTAPI_MAX_RETRIES || 0);
const FASTAPI_RETRY_BASE_MS = Number(process.env.FASTAPI_RETRY_BASE_MS || 250);
const AI_PROVIDER = String(process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
const AI_MODEL = AI_PROVIDER === 'openai'
  ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
  : (process.env.GEMINI_MODEL || 'gemini-2.0-flash');

/**
 * 원격 AI 구현체 — FastAPI 서버 호출 (프로덕션 기본 경로)
 */

class RemoteHttpError extends Error {
  status: number;
  detail: string;
  path: string;
  errorCode: ApiErrorCode | null;
  retryable: boolean | null;

  constructor(
    path: string,
    status: number,
    detail: string,
    errorCode: ApiErrorCode | null,
    retryable: boolean | null
  ) {
    super(
      detail.length > 0
        ? `Remote API error: ${status} ${detail}`
        : `Remote API error: ${status}`
    );
    this.name = 'RemoteHttpError';
    this.path = path;
    this.status = status;
    this.detail = detail;
    this.errorCode = errorCode;
    this.retryable = retryable;
  }
}

class RemoteRequestError extends Error {
  path: string;
  attemptCount: number;
  status: number | null;
  errorCode: ApiErrorCode | null;
  retryable: boolean | null;

  constructor(
    path: string,
    attemptCount: number,
    status: number | null,
    errorCode: ApiErrorCode | null,
    retryable: boolean | null,
    message: string
  ) {
    super(message);
    this.name = 'RemoteRequestError';
    this.path = path;
    this.attemptCount = attemptCount;
    this.status = status;
    this.errorCode = errorCode;
    this.retryable = retryable;
  }
}

interface PostJsonResult<T> {
  data: T;
  meta: AICallMeta;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof RemoteHttpError) {
    if (typeof error.retryable === 'boolean') {
      return error.retryable;
    }
    return [408, 429, 502, 503, 504].includes(error.status);
  }
  if (error instanceof TypeError) {
    // fetch 네트워크 오류는 TypeError로 떨어짐
    return true;
  }
  return false;
}

function buildCallMeta(
  path: string,
  attemptCount: number,
  status: number | null,
  errorCode?: ApiErrorCode | null,
  retryable?: boolean | null
): AICallMeta {
  return {
    gateway: 'fastapi',
    endpoint: path,
    provider: AI_PROVIDER,
    model: AI_MODEL,
    attemptCount: Math.max(1, attemptCount),
    retried: attemptCount > 1,
    status: typeof status === 'number' ? status : null,
    errorCode: typeof errorCode === 'string' ? errorCode : null,
    retryable: typeof retryable === 'boolean' ? retryable : null,
  };
}

function mergeFallbackServerMeta(
  callMeta: AICallMeta,
  serverMeta?: { fallback_used?: unknown; failure_kind?: unknown; attempt_count?: unknown } | null
): AICallMeta {
  if (!serverMeta || typeof serverMeta !== 'object') {
    return callMeta;
  }

  const fallbackUsed = serverMeta.fallback_used === true;
  const fallbackKind = typeof serverMeta.failure_kind === 'string'
    ? serverMeta.failure_kind
    : null;
  const attemptCandidate = Number(serverMeta.attempt_count);
  const attemptCount = Number.isFinite(attemptCandidate) && attemptCandidate > 0
    ? Math.max(callMeta.attemptCount, Math.round(attemptCandidate))
    : callMeta.attemptCount;

  return {
    ...callMeta,
    attemptCount,
    retried: attemptCount > 1,
    fallbackUsed,
    fallbackKind,
  };
}

function buildErrorResult<T>(path: string, error: unknown): AIResult<T> {
  if (error instanceof RemoteRequestError) {
    return {
      success: false,
      error: error.message,
      meta: buildCallMeta(
        path,
        error.attemptCount,
        error.status,
        error.errorCode,
        error.retryable
      ),
    };
  }

  const message = error instanceof Error ? error.message : 'Remote error';
  const status = error instanceof RemoteHttpError ? error.status : null;
  const errorCode = error instanceof RemoteHttpError ? error.errorCode : null;
  const retryable = error instanceof RemoteHttpError ? error.retryable : null;
  return {
    success: false,
    error: message,
    meta: buildCallMeta(path, 1, status, errorCode, retryable),
  };
}

function parseErrorBody(raw: unknown): { detail: string; errorCode: ApiErrorCode | null; retryable: boolean | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const detail = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    return { detail, errorCode: null, retryable: null };
  }

  const body = raw as Partial<ApiErrorResponse> & Record<string, unknown>;
  const message = String(body.message || body.detail || body.error || '').trim();
  const detail = message.replace(/\s+/g, ' ').slice(0, 200);
  const errorCode = typeof body.error_code === 'string' ? body.error_code as ApiErrorCode : null;
  const retryable = typeof body.retryable === 'boolean' ? body.retryable : null;
  return { detail, errorCode, retryable };
}

async function postJson<T>(path: string, body: unknown): Promise<PostJsonResult<T>> {
  const maxRetries = Number.isFinite(FASTAPI_MAX_RETRIES) ? Math.max(0, FASTAPI_MAX_RETRIES) : 1;
  const retryBaseMs = Number.isFinite(FASTAPI_RETRY_BASE_MS) ? Math.max(50, FASTAPI_RETRY_BASE_MS) : 250;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${FASTAPI_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const rawText = await res.text().catch(() => '');
        let parsedBody: unknown = rawText;
        try {
          parsedBody = rawText ? JSON.parse(rawText) : rawText;
        } catch {
          parsedBody = rawText;
        }
        const parsed = parseErrorBody(parsedBody);
        throw new RemoteHttpError(path, res.status, parsed.detail, parsed.errorCode, parsed.retryable);
      }
      return {
        data: await res.json() as T,
        meta: buildCallMeta(path, attempt + 1, res.status),
      };
    } catch (error) {
      const status = error instanceof RemoteHttpError ? error.status : null;
      const errorCode = error instanceof RemoteHttpError ? error.errorCode : null;
      const retryable = error instanceof RemoteHttpError ? error.retryable : null;
      if (attempt >= maxRetries || !shouldRetry(error)) {
        const baseMessage = error instanceof Error ? error.message : 'Remote API unknown failure';
        const message = attempt > 0 ? `${baseMessage} (after ${attempt + 1} attempts)` : baseMessage;
        throw new RemoteRequestError(path, attempt + 1, status, errorCode, retryable, message);
      }

      const waitMs = retryBaseMs * (2 ** attempt);
      await sleep(waitMs);
    }
  }

  throw new RemoteRequestError(path, maxRetries + 1, null, null, null, 'Remote API unknown failure');
}

export async function remoteGenerate(
  input: GenerateContentInput
): Promise<AIResult<GeneratedContentOutput>> {
  const path = '/api/generate';
  try {
    const { data, meta } = await postJson<GeneratedContentOutput>(path, input);
    return { success: true, data, meta };
  } catch (error) {
    return buildErrorResult<GeneratedContentOutput>(path, error);
  }
}

export async function remoteSearchRelevantDocs(
  params: { query: string; language?: string; topK?: number }
): Promise<SearchResult> {
  const { data } = await postJson<SearchResult>('/api/search', params);
  return data;
}

export async function remoteValidateContent(
  params: { content: string; type: 'generated' | 'user' }
): Promise<ValidationResult> {
  const { data } = await postJson<ValidationResult>('/api/validate', params);
  return data;
}

export async function remoteGetRecommendations(
  params: { userId: string; limit?: number }
): Promise<RecommendationsResult> {
  const { data } = await postJson<RecommendationsResult>('/api/recommendations', params);
  return data;
}

export async function remoteAssessLevel(
  params: AssessLevelInput
): Promise<AIResult<AssessmentQuestionsOutput>> {
  const path = '/api/assessment/questions';
  try {
    const { data, meta } = await postJson<AssessmentQuestionsOutput>(path, params);
    const mergedMeta = mergeFallbackServerMeta(meta, data.meta || null);
    return { success: true, data, meta: mergedMeta };
  } catch (error) {
    return buildErrorResult<AssessmentQuestionsOutput>(path, error);
  }
}

export async function remoteAnalyzeAnswers(
  params: AnalyzeAnswersInput
): Promise<AIResult<LevelAssessmentResult>> {
  const path = '/api/assessment/analyze';
  try {
    const { data, meta } = await postJson<LevelAssessmentResult>(path, params);
    return { success: true, data, meta };
  } catch (error) {
    return buildErrorResult<LevelAssessmentResult>(path, error);
  }
}

export async function remoteGenerateCurriculum(
  params: GenerateCurriculumInput
): Promise<AIResult<CurriculumOutput>> {
  const path = '/api/curriculum/generate';
  try {
    const { data, meta } = await postJson<CurriculumOutput>(path, params);
    return { success: true, data, meta };
  } catch (error) {
    return buildErrorResult<CurriculumOutput>(path, error);
  }
}

export async function remoteRefineCurriculum(
  params: RefineCurriculumInput
): Promise<AIResult<CurriculumOutput>> {
  const path = '/api/curriculum/refine';
  try {
    const { data, meta } = await postJson<CurriculumOutput>(path, params);
    return { success: true, data, meta };
  } catch (error) {
    return buildErrorResult<CurriculumOutput>(path, error);
  }
}

export async function remoteGenerateReasoning(
  params: GenerateCurriculumContentInput
): Promise<AIResult<PedagogicalReasoningOutput>> {
  const path = '/api/curriculum/reasoning';
  try {
    const { data, meta } = await postJson<PedagogicalReasoningOutput>(path, params);
    return { success: true, data, meta };
  } catch (error) {
    return buildErrorResult<PedagogicalReasoningOutput>(path, error);
  }
}

export async function remoteGenerateSections(
  input: GenerateCurriculumContentInput,
  reasoning: PedagogicalReasoningOutput
): Promise<AIResult<SectionedContentOutput>> {
  const path = '/api/curriculum/sections';
  try {
    const { data, meta } = await postJson<SectionedContentOutput>(path, {
      input,
      reasoning,
    });
    const mergedMeta = mergeFallbackServerMeta(meta, data.meta || null);
    return { success: true, data, meta: mergedMeta };
  } catch (error) {
    return buildErrorResult<SectionedContentOutput>(path, error);
  }
}
