export type PracticeErrorCode =
  | "schema_mismatch"
  | "timeout"
  | "internal_error"
  | "unknown";

export interface PracticeRunRequest {
  problem_id: string;
  code: string;
}

export interface PracticeRunResponse {
  passed: boolean;
  stdout: string;
  stderr: string;
}

export interface PracticeErrorResponse {
  error_code: PracticeErrorCode;
  message: string;
}
