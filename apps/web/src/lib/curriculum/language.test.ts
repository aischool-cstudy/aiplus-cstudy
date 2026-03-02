import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inferLanguageFromGoalAndInterests } from './language';

test('inferLanguageFromGoalAndInterests infers JavaScript from web keywords', () => {
  const language = inferLanguageFromGoalAndInterests(
    'next react 기반 프론트엔드 프로젝트 만들기',
    []
  );
  assert.equal(language, 'JavaScript');
});

test('inferLanguageFromGoalAndInterests infers TypeScript from direct keyword', () => {
  const language = inferLanguageFromGoalAndInterests(
    '타입스크립트로 대시보드 만들기',
    ['TypeScript']
  );
  assert.equal(language, 'TypeScript');
});

test('inferLanguageFromGoalAndInterests falls back to Python when unknown', () => {
  const language = inferLanguageFromGoalAndInterests('문서 정리', ['writing']);
  assert.equal(language, 'Python');
});
