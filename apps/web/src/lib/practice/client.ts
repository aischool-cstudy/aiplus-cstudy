import type {
  PracticeErrorCode,
  PracticeErrorResponse,
  PracticeRunRequest,
  PracticeRunResponse,
} from '@aiplus/contracts';

const PRACTICE_API_BASE_URL = (process.env.PRACTICE_API_BASE_URL || 'http://localhost:8100')
  .replace(/\/+$/, '');

const KNOWN_ERROR_CODES: ReadonlySet<PracticeErrorCode> = new Set([
  'schema_mismatch',
  'timeout',
  'internal_error',
  'unknown',
]);

interface PracticeRunSuccess {
  success: true;
  data: PracticeRunResponse;
}

interface PracticeRunFailure {
  success: false;
  error: PracticeErrorResponse;
}

export type PracticeRunResult = PracticeRunSuccess | PracticeRunFailure;

function normalizeErrorCode(value: unknown): PracticeErrorCode {
  const raw = String(value || '').trim().toLowerCase();
  return KNOWN_ERROR_CODES.has(raw as PracticeErrorCode)
    ? raw as PracticeErrorCode
    : 'unknown';
}

function parseRunResponse(payload: unknown): PracticeRunResponse | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  if (typeof row.passed !== 'boolean') return null;
  if (typeof row.stdout !== 'string') return null;
  if (typeof row.stderr !== 'string') return null;
  return {
    passed: row.passed,
    stdout: row.stdout,
    stderr: row.stderr,
  };
}

function parseErrorResponse(payload: unknown): PracticeErrorResponse {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      error_code: 'unknown',
      message: '실습 실행 서버 응답을 해석하지 못했습니다.',
    };
  }
  const row = payload as Record<string, unknown>;
  const message = String(row.message || '').trim() || '실습 실행 중 오류가 발생했습니다.';
  return {
    error_code: normalizeErrorCode(row.error_code),
    message,
  };
}

export async function runPractice(request: PracticeRunRequest): Promise<PracticeRunResult> {
  const res = await fetch(`${PRACTICE_API_BASE_URL}/v1/practice/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const rawText = await res.text();
  let parsedBody: unknown = rawText;
  try {
    parsedBody = rawText ? JSON.parse(rawText) : rawText;
  } catch {
    parsedBody = rawText;
  }

  if (!res.ok) {
    return {
      success: false,
      error: parseErrorResponse(parsedBody),
    };
  }

  const parsedRun = parseRunResponse(parsedBody);
  if (!parsedRun) {
    return {
      success: false,
      error: {
        error_code: 'unknown',
        message: '실습 실행 결과 형식이 올바르지 않습니다.',
      },
    };
  }

  return {
    success: true,
    data: parsedRun,
  };
}
