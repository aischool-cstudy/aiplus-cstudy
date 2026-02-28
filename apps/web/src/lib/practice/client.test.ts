import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPractice } from './client';

test('runPractice parses success response', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(
    JSON.stringify({
      passed: true,
      stdout: 'ok\n',
      stderr: '',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )) as typeof fetch;

  try {
    const result = await runPractice({
      problem_id: 'prob_1',
      code: 'print("ok")',
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.passed, true);
      assert.equal(result.data.stdout, 'ok\n');
      assert.equal(result.data.stderr, '');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runPractice parses error response with known error code', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(
    JSON.stringify({
      error_code: 'timeout',
      message: 'Execution timed out',
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  )) as typeof fetch;

  try {
    const result = await runPractice({
      problem_id: 'prob_2',
      code: 'while True: pass',
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.error_code, 'timeout');
      assert.equal(result.error.message, 'Execution timed out');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
