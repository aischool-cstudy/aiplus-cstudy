import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldIncludeAIOpsRun } from './ops-scope';

test('shouldIncludeAIOpsRun excludes assessment_analysis in rule mode', () => {
  assert.equal(
    shouldIncludeAIOpsRun({
      pipeline: 'assessment_analysis',
      assessmentAnalysisMode: 'rule',
    }),
    false
  );
});

test('shouldIncludeAIOpsRun includes assessment_analysis in llm mode', () => {
  assert.equal(
    shouldIncludeAIOpsRun({
      pipeline: 'assessment_analysis',
      assessmentAnalysisMode: 'llm',
    }),
    true
  );
});

test('shouldIncludeAIOpsRun includes other pipelines regardless of mode', () => {
  assert.equal(
    shouldIncludeAIOpsRun({
      pipeline: 'curriculum_generate',
      assessmentAnalysisMode: 'rule',
    }),
    true
  );
});
