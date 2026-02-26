// 자동 생성 파일입니다. 수동으로 수정하지 마세요.
// 오픈API 스펙 파일을 기준으로 생성됨

export type ApiErrorCode = 'schema_mismatch' | 'rate_limited' | 'timeout' | 'quality_failed' | 'config_error' | 'empty_output' | 'provider_error' | 'db_error' | 'unknown';

export interface ApiErrorResponse {
  error_code: ApiErrorCode;
  message: string;
  retryable: boolean;
  trace_id: string;
  detail: string | Record<string, unknown>;
}

export interface AIFallbackMeta {
  fallback_used: boolean;
  failure_kind: string | null;
  attempt_count: number;
}

