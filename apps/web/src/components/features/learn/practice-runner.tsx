'use client';

import { useState } from 'react';
import { Play, CheckCircle2, XCircle } from 'lucide-react';
import { runPracticeCodeAction } from '@/actions/practice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PracticeRunnerProps {
  problemId: string;
  initialCode: string;
}

interface PracticeRunState {
  passed: boolean;
  stdout: string;
  stderr: string;
}

const DEFAULT_PYTHON_CODE = [
  '# Python 코드를 입력하고 실행해보세요.',
  '',
  'def solve():',
  '    print("Hello, AI+")',
  '',
  'solve()',
].join('\n');

export function PracticeRunner({ problemId, initialCode }: PracticeRunnerProps) {
  const [code, setCode] = useState<string>(
    initialCode.trim().length > 0 ? initialCode : DEFAULT_PYTHON_CODE
  );
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<PracticeRunState | null>(null);

  async function handleRunCode() {
    if (running) return;
    setRunning(true);
    setErrorMessage(null);

    const result = await runPracticeCodeAction({
      problemId,
      code,
    });

    if (!result.ok) {
      setRunResult(null);
      setErrorMessage(result.message);
      setRunning(false);
      return;
    }

    setRunResult({
      passed: result.data.passed,
      stdout: result.data.stdout,
      stderr: result.data.stderr,
    });
    setRunning(false);
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">코드 실습</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full min-h-56 rounded-lg border border-border bg-background px-3 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            spellCheck={false}
            placeholder="Python 코드를 입력하세요."
          />

          {errorMessage && (
            <div className="rounded-lg bg-error/10 text-error text-sm px-3 py-2">
              {errorMessage}
            </div>
          )}

          {runResult && (
            <div className="space-y-3">
              <div
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  runResult.passed
                    ? 'bg-success/10 text-success'
                    : 'bg-error/10 text-error'
                }`}
              >
                {runResult.passed ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    정답입니다.
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    오답입니다. 코드를 수정해서 다시 실행해보세요.
                  </span>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">stdout</p>
                  <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto">
                    <code>{runResult.stdout || '(empty)'}</code>
                  </pre>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">stderr</p>
                  <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto">
                    <code>{runResult.stderr || '(empty)'}</code>
                  </pre>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleRunCode}
              loading={running}
              disabled={running || code.trim().length === 0}
            >
              <Play className="w-4 h-4 mr-1" />
              코드 실행
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRunResult(null);
                setErrorMessage(null);
              }}
              disabled={running || (!runResult && !errorMessage)}
            >
              결과 초기화
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
