import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeQuizOptions } from './options';

test('sanitizeQuizOptions preserves indexes while replacing placeholders', () => {
  const output = sanitizeQuizOptions(
    ['1', '선택지 2', 'A', '4번'],
    '1) 정답 A\n2) 정답 B\n3) 정답 C\n4) 정답 D'
  );
  assert.deepEqual(output, ['정답 A', '정답 B', '정답 C', '정답 D']);
});

test('sanitizeQuizOptions falls back to deterministic labels when sources are empty', () => {
  const output = sanitizeQuizOptions([], '', '');
  assert.deepEqual(output, ['선택지 1', '선택지 2', '선택지 3', '선택지 4']);
});
