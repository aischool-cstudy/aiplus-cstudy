import assert from 'node:assert/strict';
import { serializeColumnValue } from './serialization';

assert.deepEqual(
  serializeColumnValue('learner_profiles', 'interests', []),
  []
);

assert.deepEqual(
  serializeColumnValue('public.learning_progress', 'difficult_concepts', ['loops', 'recursion']),
  ['loops', 'recursion']
);

assert.deepEqual(
  serializeColumnValue('assessment_attempts', 'wrong_question_indexes', [1, 3]),
  [1, 3]
);

assert.equal(
  serializeColumnValue('generated_contents', 'quiz', []),
  '[]'
);

assert.equal(
  serializeColumnValue('ai_generation_logs', 'metadata', [{ stage: 'final' }]),
  '[{"stage":"final"}]'
);

const now = new Date('2026-03-09T05:45:05.480Z');
assert.equal(
  serializeColumnValue('profiles', 'updated_at', now),
  now
);

console.log('serialization tests passed');
