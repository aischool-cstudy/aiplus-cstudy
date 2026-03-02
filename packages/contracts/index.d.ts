// AI API error codes
export type ApiErrorCode =
  | 'schema_mismatch'
  | 'rate_limited'
  | 'timeout'
  | 'quality_failed'
  | 'config_error'
  | 'empty_output'
  | 'provider_error'
  | 'db_error'
  | 'unknown';

export interface ApiErrorResponse {
  message?: string;
  detail?: string;
  error?: string;
  error_code?: ApiErrorCode;
  retryable?: boolean;
}

// Practice runner types
export type PracticeErrorCode =
  | 'schema_mismatch'
  | 'timeout'
  | 'internal_error'
  | 'unknown';

export interface PracticeErrorResponse {
  error: PracticeErrorCode;
  message?: string;
}

export interface PracticeRunRequest {
  code: string;
  language: string;
  stdin?: string;
}

export interface PracticeRunResponse {
  stdout: string;
  stderr: string;
  exit_code: number;
}
