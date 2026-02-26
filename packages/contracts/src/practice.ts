export type PracticeLanguage = "python" | "javascript" | "typescript" | "java" | "go" | "rust";
export type PracticeState = "ready" | "running" | "failed" | "completed";

export interface PracticeSessionDto {
  session_id: string;
  topic: string;
  language: PracticeLanguage;
  template_id: string | null;
  state: PracticeState;
  provider: string;
  message: string;
}

export interface PracticeRunDto {
  success: boolean;
  state: PracticeState;
  stdout: string;
  stderr: string;
  message: string;
  provider: string;
}

export interface PracticeSubmitDto {
  accepted: boolean;
  state: PracticeState;
  score: number;
  feedback: string;
  retryable: boolean;
  provider: string;
}
