import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { ExpressionError, parseAge } from '../src/index.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// No daylight saving change near NOW, so a day is always 24 hours here.
const NOW = Date.parse('2026-06-15T12:00:00Z');

function ago(ms: number): Date {
  return new Date(NOW - ms);
}

describe('parseAge', () => {
  let tz: string | undefined;

  beforeEach(() => {
    tz = process.env.TZ;
    process.env.TZ = 'UTC';
    mock.timers.enable({ apis: ['Date'], now: NOW });
  });

  afterEach(() => {
    mock.timers.reset();
    process.env.TZ = tz;
  });

  // Ages relative to 2 units, and the whole-unit age each one has.
  const ages = (unit: number) => [
    { ms: 2 * unit - 1, whole: 1 },
    { ms: 2 * unit, whole: 2 },
    { ms: 3 * unit - 1, whole: 2 },
    { ms: 3 * unit, whole: 3 }
  ];

  const operators: Record<string, (whole: number) => boolean> = {
    '<': (whole) => whole < 2,
    '<=': (whole) => whole <= 2,
    '>': (whole) => whole > 2,
    '>=': (whole) => whole >= 2,
    '==': (whole) => whole === 2,
    '': (whole) => whole === 2
  };

  const units: Record<string, number> = { m: MINUTE, h: HOUR, d: DAY, '': DAY, w: WEEK };

  for (const [unit, length] of Object.entries(units)) {
    for (const [operator, expected] of Object.entries(operators)) {
      it(`supports '${operator || '(none)'}2${unit}'`, () => {
        const isMatch = parseAge(`${operator}2${unit}`);
        for (const { ms, whole } of ages(length)) {
          assert.equal(isMatch(ago(ms)), expected(whole), `${ms}ms old`);
        }
      });
    }
  }

  it('exposes the parsed expression with the canonical unit', () => {
    const isMatch = parseAge(' >= 10 D ');
    assert.equal(isMatch.expression, ' >= 10 D ');
    assert.equal(isMatch.operator, '>=');
    assert.equal(isMatch.value, 10);
    assert.equal(isMatch.unit, 'days');
  });

  it('defaults to days', () => {
    assert.equal(parseAge(10).unit, 'days');
    assert.equal(parseAge(10)(ago(10 * DAY)), true);
  });

  it('is frozen', () => {
    assert.equal(Object.isFrozen(parseAge('>1d')), true);
  });

  it('accepts a Date, ISO string or milliseconds since the epoch', () => {
    const isMatch = parseAge('=2 days');
    assert.equal(isMatch(ago(2 * DAY)), true);
    assert.equal(isMatch(ago(2 * DAY).toISOString()), true);
    assert.equal(isMatch(NOW - 2 * DAY), true);
  });

  describe('now', () => {
    it('defaults to the time of parsing', () => {
      const isMatch = parseAge('=2 days');
      mock.timers.tick(DAY);
      assert.equal(isMatch(ago(2 * DAY)), true);
    });

    it('accepts a fixed Date, ISO string or milliseconds since the epoch', () => {
      const now = new Date(NOW + 10 * DAY);
      for (const fixed of [now, now.toISOString(), now.getTime()]) {
        assert.equal(parseAge('=12 days', { now: fixed })(ago(2 * DAY)), true);
      }
    });

    it('follows a clock function on each call', () => {
      const isMatch = parseAge('=2 days', { now: Date.now });
      const date = ago(2 * DAY);
      assert.equal(isMatch(date), true);
      mock.timers.tick(DAY);
      assert.equal(isMatch(date), false);
      assert.equal(parseAge('=3 days', { now: Date.now })(date), true);
    });

    it('calls a clock function once per test and never while parsing', () => {
      const clock = mock.fn(() => NOW);
      const isMatch = parseAge('>1d', { now: clock });
      assert.equal(clock.mock.callCount(), 0);
      isMatch(ago(0));
      isMatch(ago(0));
      assert.equal(clock.mock.callCount(), 2);
    });

    it('throws a TypeError when parsing with an invalid fixed now', () => {
      assert.throws(() => parseAge('>1d', { now: 'banana' }), {
        name: 'TypeError',
        message: "Invalid now 'banana'"
      });
    });

    it('throws a TypeError when a clock function returns an invalid time', () => {
      const isMatch = parseAge('>1d', { now: () => NaN });
      assert.throws(() => isMatch(ago(0)), { name: 'TypeError', message: "Invalid now 'NaN'" });
    });
  });

  it('counts days by the calendar across a daylight saving change', () => {
    // The UK clocks went forward at 01:00 UTC on 29 March 2026, so these
    // are 2 calendar days but 47 hours apart.
    process.env.TZ = 'Europe/London';
    const isMatch = parseAge('=2 days', { now: '2026-03-30T11:00:00Z' });
    assert.equal(isMatch('2026-03-28T12:00:00Z'), true);
  });

  for (const expression of ['banana', '>', '>3 years', '3kb', '1.5 days', -1]) {
    it(`throws an ExpressionError for '${expression}' when parsing`, () => {
      assert.throws(() => parseAge(expression), ExpressionError);
    });
  }

  for (const date of ['banana', NaN, new Date(NaN)]) {
    it(`throws a TypeError when called with ${String(date)}`, () => {
      assert.throws(() => parseAge('>1d')(date), { name: 'TypeError', message: `Invalid date '${String(date)}'` });
    });
  }
});
