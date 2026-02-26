import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clampScore, extractConceptTags, normalizeConceptTag } from './concept-signal';

test('clampScore rounds and clamps into range', () => {
  assert.equal(clampScore(67.6), 68);
  assert.equal(clampScore(-10), 0);
  assert.equal(clampScore(130), 100);
});

test('normalizeConceptTag trims, lowercases and removes punctuation', () => {
  const normalized = normalizeConceptTag('  React.js / 상태관리!!  ');
  assert.equal(normalized, 'reactjs  상태관리');
});

test('extractConceptTags deduplicates and caps length', () => {
  const tags = extractConceptTags({
    itemTitle: '파이썬 자료구조',
    difficultConcepts: [
      '리스트',
      '딕셔너리',
      '리스트',
      '튜플',
      '집합',
      '큐',
      '스택',
      '트리',
      '그래프',
      '힙',
      '정렬',
      '탐색',
    ],
  });

  assert.equal(tags[0], '파이썬 자료구조');
  assert.equal(tags.length, 10);
  assert.equal(new Set(tags).size, tags.length);
});
