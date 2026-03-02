import { test } from 'node:test';
import assert from 'node:assert/strict';

import { acquireLock, createRequestLockKey, releaseLock } from './request-lock';

test('createRequestLockKey is stable regardless of object key order', () => {
  const keyA = createRequestLockKey('user-1', 'pipeline', { a: 1, b: { x: 1, y: 2 } });
  const keyB = createRequestLockKey('user-1', 'pipeline', { b: { y: 2, x: 1 }, a: 1 });
  assert.equal(keyA, keyB);
});

test('acquireLock prevents duplicate execution until release', async () => {
  const key = createRequestLockKey('user-2', 'pipeline', { goal: 'typescript' });
  assert.equal(await acquireLock(key, 30_000), true);
  assert.equal(await acquireLock(key, 30_000), false);
  await releaseLock(key);
  assert.equal(await acquireLock(key, 30_000), true);
  await releaseLock(key);
});
