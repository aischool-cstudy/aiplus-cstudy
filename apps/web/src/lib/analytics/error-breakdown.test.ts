import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildErrorBreakdown } from './error-breakdown';

test('buildErrorBreakdown counts only failed runs and uses error code only', () => {
  const result = buildErrorBreakdown([
    { status: 'running', terminalErrorCode: null },
    { status: 'completed', terminalErrorCode: null },
    { status: 'failed', terminalErrorCode: 'timeout' },
    { status: 'failed', terminalErrorCode: 'rate_limited' },
    { status: 'failed', terminalErrorCode: 'unknown' },
    { status: 'abandoned', terminalErrorCode: 'timeout' },
  ]);

  assert.equal(result.timeoutFailures, 1);
  assert.equal(result.rateLimitedFailures, 1);
  assert.equal(result.timeoutOrRateLimitedFailures, 2);
  assert.deepEqual(result.errorCodes, [
    { errorCode: 'timeout', count: 1 },
    { errorCode: 'rate_limited', count: 1 },
    { errorCode: 'unknown', count: 1 },
  ]);
});
