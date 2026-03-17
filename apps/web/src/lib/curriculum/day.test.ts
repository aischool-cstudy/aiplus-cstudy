import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getCurriculumDay,
  normalizeCurriculumTotalDays,
  parseCurriculumStartDate,
} from './day';

test('normalizeCurriculumTotalDays falls back to 1 for invalid values', () => {
  assert.equal(normalizeCurriculumTotalDays(null), 1);
  assert.equal(normalizeCurriculumTotalDays(''), 1);
  assert.equal(normalizeCurriculumTotalDays(0), 1);
});

test('parseCurriculumStartDate accepts a date-only string and ISO datetime', () => {
  const dateOnly = parseCurriculumStartDate('2026-03-17');
  const isoDateTime = parseCurriculumStartDate('2026-03-17T09:30:00.000Z');

  assert.ok(dateOnly instanceof Date);
  assert.equal(dateOnly?.getFullYear(), 2026);
  assert.equal(dateOnly?.getMonth(), 2);
  assert.equal(dateOnly?.getDate(), 17);
  assert.ok(isoDateTime instanceof Date);
  assert.equal(isoDateTime?.getFullYear(), 2026);
  assert.equal(isoDateTime?.getMonth(), 2);
  assert.equal(isoDateTime?.getDate(), 17);
});

test('parseCurriculumStartDate returns null for an invalid value', () => {
  assert.equal(parseCurriculumStartDate('not-a-date'), null);
});

test('getCurriculumDay returns 1 when start date is invalid', () => {
  const now = new Date('2026-03-20T12:00:00.000Z');
  assert.equal(getCurriculumDay('not-a-date', 14, now), 1);
});

test('getCurriculumDay clamps the current day to total days', () => {
  const now = new Date('2026-03-20T12:00:00.000Z');
  assert.equal(getCurriculumDay('2026-03-17', 2, now), 2);
});
