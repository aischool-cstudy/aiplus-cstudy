'use server';

import type { PracticeErrorCode, PracticeRunResponse } from '@aiplus/contracts';
import { runPractice } from '@/lib/practice/client';

interface PracticeRunActionSuccess {
  ok: true;
  data: PracticeRunResponse;
}

interface PracticeRunActionFailure {
  ok: false;
  errorCode: PracticeErrorCode;
  message: string;
}

export type PracticeRunActionResult = PracticeRunActionSuccess | PracticeRunActionFailure;

function getPracticeErrorMessage(errorCode: PracticeErrorCode, fallback: string): string {
  switch (errorCode) {
    case 'schema_mismatch':
      return '실행 요청 형식이 올바르지 않습니다. 코드를 다시 확인해주세요.';
    case 'timeout':
      return '실행 시간이 초과되었습니다. 코드를 줄이거나 다시 시도해주세요.';
    case 'internal_error':
      return '실습 실행 서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    case 'unknown':
    default:
      return fallback || '실습 실행 중 알 수 없는 오류가 발생했습니다.';
  }
}

export async function runPracticeCodeAction(input: {
  problemId: string;
  code: string;
}): Promise<PracticeRunActionResult> {
  const problemId = String(input.problemId || '').trim();
  const code = String(input.code || '');

  if (!problemId) {
    return {
      ok: false,
      errorCode: 'schema_mismatch',
      message: '문제 식별자가 없습니다.',
    };
  }

  if (!code.trim()) {
    return {
      ok: false,
      errorCode: 'schema_mismatch',
      message: '실행할 코드를 입력해주세요.',
    };
  }

  try {
    const result = await runPractice({
      problem_id: problemId,
      code,
    });

    if (!result.success) {
      return {
        ok: false,
        errorCode: result.error.error_code,
        message: getPracticeErrorMessage(result.error.error_code, result.error.message),
      };
    }

    return {
      ok: true,
      data: result.data,
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: 'unknown',
      message: error instanceof Error
        ? error.message
        : '실습 실행 요청 중 네트워크 오류가 발생했습니다.',
    };
  }
}
