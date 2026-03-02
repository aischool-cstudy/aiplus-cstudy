import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyAIGenerationError } from './errors';

test('classifyAIGenerationError prefers error_code over legacy text', () => {
  const code = classifyAIGenerationError({
    errorCode: 'quality_failed',
    legacyDetail: 'content_generate_failed:provider_error:something',
  });
  assert.equal(code, 'quality_failed');
});

test('classifyAIGenerationError ignores legacy detail when error_code is missing', () => {
  const code = classifyAIGenerationError({
    errorCode: null,
    legacyDetail: 'curriculum_sections_failed:timeout:request timed out',
  });
  assert.equal(code, 'unknown');
});

test('classifyAIGenerationError returns unknown for unregistered code', () => {
  const code = classifyAIGenerationError({
    errorCode: 'random_error_code',
    legacyDetail: null,
  });
  assert.equal(code, 'unknown');
});
