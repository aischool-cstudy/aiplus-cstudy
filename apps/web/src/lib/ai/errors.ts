import type { ApiErrorCode } from '@aiplus/contracts';

export type AIGenerationErrorCode = ApiErrorCode;

const KNOWN_ERROR_CODES: Set<AIGenerationErrorCode> = new Set([
  'schema_mismatch',
  'rate_limited',
  'timeout',
  'quality_failed',
  'config_error',
  'empty_output',
  'provider_error',
  'db_error',
  'unknown',
]);

function asKnownErrorCode(value?: string | null): AIGenerationErrorCode | null {
  const raw = String(value || '').trim().toLowerCase();
  return KNOWN_ERROR_CODES.has(raw as AIGenerationErrorCode)
    ? raw as AIGenerationErrorCode
    : null;
}

export function classifyAIGenerationError(
  input?: { errorCode?: string | null; legacyDetail?: string | null } | string | null
): AIGenerationErrorCode {
  if (!input) return 'unknown';

  if (typeof input === 'string') {
    return asKnownErrorCode(input) ?? 'unknown';
  }

  const fromCode = asKnownErrorCode(input.errorCode);
  if (fromCode) return fromCode;

  return 'unknown';
}

export function getUserFacingGenerationErrorMessage(
  code: AIGenerationErrorCode,
  fallback?: string | null
): string {
  switch (code) {
    case 'schema_mismatch':
      return 'AI 응답 형식을 자동 복구하려 했지만 실패했습니다. 잠시 후 다시 시도해주세요.';
    case 'rate_limited':
      return '요청이 몰려 생성이 지연되고 있습니다. 잠시 후 다시 시도해주세요.';
    case 'timeout':
      return '생성 시간이 길어져 중단되었습니다. 잠시 후 다시 시도해주세요.';
    case 'quality_failed':
      return '생성 결과가 학습 품질 기준을 충족하지 못해 저장하지 않았습니다. 다시 생성해주세요.';
    case 'config_error':
      return 'AI 서비스 설정에 문제가 있어 생성할 수 없습니다. 관리자 설정을 확인해주세요.';
    case 'empty_output':
      return '생성 결과가 비어 있어 다시 시도해 주세요.';
    case 'provider_error':
      return fallback?.trim() || 'AI 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    case 'db_error':
      return '생성은 되었지만 저장 중 문제가 발생했습니다. 다시 시도해주세요.';
    case 'unknown':
    default:
      return fallback?.trim() || '콘텐츠 생성에 실패했습니다. 잠시 후 다시 시도해주세요.';
  }
}
