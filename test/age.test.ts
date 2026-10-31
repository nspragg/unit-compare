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

describe('parseAge', () => {
  // Ages relative to 2 units, and the whole-unit age each one has.
  const ages = (unit: number) => [
    { label: 'just under 2', ms: 2 * unit - 1, whole: 1 },
    { label: 'exactly 2', ms: 2 * unit, whole: 2 },
    { label: '2.5', ms: 2.5 * unit, whole: 2 },
    { label: 'just under 3', ms: 3 * unit - 1, whole: 2 },
    { label: 'exactly 3', ms: 3 * unit, whole: 3 }
  ];

  const operators: Record<string, (whole: number) => boolean> = {
    '<': (whole) => whole < 2,
    '<=': (whole) => whole <= 2,
    '>': (whole) => whole > 2,
    '>=': (whole) => whole >= 2,
    '==': (whole) => whole === 2,
    '=': (whole) => whole === 2,
    '': (whole) => whole === 2
  };

  const units: Record<string, [number, string]> = {
    m: [MINUTE, 'minutes'],
    min: [MINUTE, 'minutes'],
    mins: [MINUTE, 'minutes'],
    minute: [MINUTE, 'minutes'],
    minutes: [MINUTE, 'minutes'],
    h: [HOUR, 'hours'],
    hour: [HOUR, 'hours'],
    hours: [HOUR, 'hours'],
    d: [DAY, 'days'],
    day: [DAY, 'days'],
    days: [DAY, 'days'],
    '': [DAY, 'days'],
    w: [WEEK, 'weeks'],
    week: [WEEK, 'weeks'],
    weeks: [WEEK, 'weeks']
  };

  for (const [unit, [length, canonical]] of Object.entries(units)) {
    describe(`in '${unit || '(default: days)'}'`, () => {
      it(`normalises the unit to '${canonical}'`, () => {
        assert.equal(parseAge(`2${unit}`).unit, canonical);
      });

      for (const [operator, expected] of Object.entries(operators)) {
        it(`supports '${operator || '(none)'}2${unit}'`, () => {
          const isMatch = parseAge(`${operator}2${unit}`);
          for (const { label, ms, whole } of ages(length)) {
            assert.equal(isMatch(ago(ms)), expected(whole), `${label} units old`);
          }
        });
      }
    });
  }

  it('compares equality within the unit', () => {
    assert.equal(parseAge('=2 days')(ago(2 * DAY + 23 * HOUR)), true);
    assert.equal(parseAge('=2 days')(ago(3 * DAY)), false);
  });

  it('treats a number as equality in days', () => {
    assert.equal(parseAge(10)(ago(10 * DAY)), true);
    assert.equal(parseAge(10)(ago(11 * DAY)), false);
  });

  it('matches =0 for a date up to one unit old', () => {
    const isMatch = parseAge('=0 minutes');
    assert.equal(isMatch(ago(0)), true);
    assert.equal(isMatch(ago(MINUTE - 1)), true);
    assert.equal(isMatch(ago(MINUTE)), false);
  });

  it('treats a future date as younger than any age', () => {
    const future = ago(-DAY);
    assert.equal(parseAge('<1')(future), true);
    assert.equal(parseAge('=0')(future), false);
    assert.equal(parseAge('>=0')(future), false);
  });

  it('ignores the case of the unit', () => {
    assert.equal(parseAge('2 DAYS')(ago(2 * DAY)), true);
    assert.equal(parseAge('2H')(ago(2 * HOUR)), true);
  });

  it('ignores whitespace', () => {
    const date = ago(3 * DAY);
    for (const expression of [' >2 days', '>2 days ', '> 2days', '  >  2  days  ', '\t>\t2\tdays\t']) {
      assert.equal(parseAge(expression)(date), true, `'${expression}'`);
    }
  });

  it('exposes the parsed expression with the canonical unit', () => {
    const isMatch = parseAge(' >= 10 D ');
    assert.equal(isMatch.expression, ' >= 10 D ');
    assert.equal(isMatch.operator, '>=');
    assert.equal(isMatch.value, 10);
    assert.equal(isMatch.unit, 'days');
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

  describe('calendar days', () => {
    // The UK clocks went forward at 01:00 UTC on 29 March 2026, so midday
    // on 28 March to midday on 30 March is 2 calendar days but 47 hours.
    const now = '2026-03-30T11:00:00Z';
    const date = '2026-03-28T12:00:00Z';

    beforeEach(() => {
      process.env.TZ = 'Europe/London';
    });

    it('counts days by the calendar across a daylight saving change', () => {
      assert.equal(Date.parse(now) - Date.parse(date), 47 * HOUR);
      assert.equal(parseAge('=2 days', { now })(date), true);
      assert.equal(parseAge('>=2 days', { now })(date), true);
      assert.equal(parseAge('<2 days', { now })(date), false);
    });

    it('counts weeks by the calendar', () => {
      const weekAgo = '2026-03-23T12:00:00Z';
      assert.equal(Date.parse(now) - Date.parse(weekAgo), WEEK - HOUR);
      assert.equal(parseAge('=1 week', { now })(weekAgo), true);
    });

    it('counts hours as fixed lengths', () => {
      assert.equal(parseAge('=47 hours', { now })(date), true);
    });
  });

  for (const expression of ['banana', '>', '>3 years', '3 months', '3 s', '3kb', '== minutes', '1.5 days', -1]) {
    it(`throws an ExpressionError for '${expression}' when parsing`, () => {
      assert.throws(() => parseAge(expression), ExpressionError);
    });
  }

  for (const date of ['banana', NaN, new Date(NaN)]) {
    it(`throws a TypeError when called with ${String(date)}`, () => {
      assert.throws(() => parseAge('>1d')(date), { name: 'TypeError', message: `Invalid date '${String(date)}'` });
    });
  }

  describe('regressions', () => {
    it('parses >=', () => {
      assert.equal(parseAge('>=10 days')(ago(3 * DAY)), false);
      assert.equal(parseAge('>=10 days')(ago(10 * DAY)), true);
    });

    it('supports weeks', () => {
      assert.equal(parseAge('>3 weeks')(ago(3 * DAY)), false);
      assert.equal(parseAge('<3 weeks')(ago(3 * DAY)), true);
    });

    it('throws for an unknown unit', () => {
      assert.throws(() => parseAge('>3 years'), {
        name: 'ExpressionError',
        message: "Invalid expression '>3 years': unknown time unit 'years'",
        expression: '>3 years'
      });
    });

    it('parses a leading space', () => {
      assert.equal(parseAge(' >2 days')(ago(3 * DAY)), true);
    });

    it('throws rather than comparing with NaN', () => {
      assert.throws(() => parseAge('banana'), /Invalid expression 'banana'/);
    });
  });
});
