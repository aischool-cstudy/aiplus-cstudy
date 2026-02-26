import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateRunFailureRate } from './run-metrics';

test('calculateRunFailureRate excludes running runs by construction', () => {
  const failureRate = calculateRunFailureRate({
    completedRuns: 2,
    failedRuns: 1,
    abandonedRuns: 1,
  });
  assert.equal(failureRate, 25);
});

test('calculateRunFailureRate handles empty terminal runs', () => {
  const failureRate = calculateRunFailureRate({
    completedRuns: 0,
    failedRuns: 0,
    abandonedRuns: 0,
  });
  assert.equal(failureRate, 0);
});
