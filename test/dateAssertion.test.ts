import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { ExpressionError, isDate, type TimeUnit } from '../src/index.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// No daylight saving change near NOW, so a day is always 24 hours here.
const NOW = Date.parse('2026-06-15T12:00:00Z');

function ago(ms: number): Date {
  return new Date(NOW - ms);
}

describe('DateAssertion', () => {
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

  describe('.assert', () => {
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

    const units: Record<string, number> = {
      m: MINUTE,
      min: MINUTE,
      mins: MINUTE,
      minute: MINUTE,
      minutes: MINUTE,
      h: HOUR,
      hour: HOUR,
      hours: HOUR,
      d: DAY,
      day: DAY,
      days: DAY,
      '': DAY,
      w: WEEK,
      week: WEEK,
      weeks: WEEK
    };

    for (const [unit, length] of Object.entries(units)) {
      describe(`in '${unit || '(default: days)'}'`, () => {
        for (const [operator, expected] of Object.entries(operators)) {
          it(`supports '${operator || '(none)'}2${unit}'`, () => {
            for (const { label, ms, whole } of ages(length)) {
              assert.equal(
                isDate(ago(ms)).assert(`${operator}2${unit}`),
                expected(whole),
                `${label} units old`
              );
            }
          });
        }
      });
    }

    it('compares equality within the unit', () => {
      assert.equal(isDate(ago(2 * DAY + 23 * HOUR)).assert('=2 days'), true);
      assert.equal(isDate(ago(3 * DAY)).assert('=2 days'), false);
    });

    it('defaults to equality in days for a number', () => {
      assert.equal(isDate(ago(10 * DAY)).assert(10), true);
      assert.equal(isDate(ago(11 * DAY)).assert(10), false);
    });

    it('matches =0 for a date up to one unit old', () => {
      assert.equal(isDate(ago(0)).assert('=0 minutes'), true);
      assert.equal(isDate(ago(MINUTE - 1)).assert('=0 minutes'), true);
      assert.equal(isDate(ago(MINUTE)).assert('=0 minutes'), false);
    });

    it('treats a future date as younger than any age', () => {
      const future = ago(-DAY);
      assert.equal(future.getTime() > NOW, true);
      assert.equal(isDate(future).assert('<1'), true);
      assert.equal(isDate(future).assert('=0'), false);
      assert.equal(isDate(future).assert('>=0'), false);
    });

    it('ignores the case of the unit', () => {
      assert.equal(isDate(ago(2 * DAY)).assert('2 DAYS'), true);
      assert.equal(isDate(ago(2 * HOUR)).assert('2H'), true);
    });

    it('ignores whitespace', () => {
      const date = ago(3 * DAY);
      assert.equal(isDate(date).assert(' >2 days'), true);
      assert.equal(isDate(date).assert('>2 days '), true);
      assert.equal(isDate(date).assert('> 2days'), true);
      assert.equal(isDate(date).assert('  >  2  days  '), true);
    });

    for (const expression of ['banana', '>', '>3 years', '3 months', '3 s', '3kb', '== minutes', '1.5 days', -1]) {
      it(`throws an ExpressionError for '${expression}'`, () => {
        assert.throws(() => isDate(ago(0)).assert(expression), ExpressionError);
      });
    }

    describe('regressions', () => {
      it('parses >=', () => {
        assert.equal(isDate(ago(3 * DAY)).assert('>=10 days'), false);
        assert.equal(isDate(ago(10 * DAY)).assert('>=10 days'), true);
      });

      it('supports weeks', () => {
        assert.equal(isDate(ago(3 * DAY)).assert('>3 weeks'), false);
        assert.equal(isDate(ago(3 * DAY)).assert('<3 weeks'), true);
      });

      it('throws for an unknown unit', () => {
        assert.throws(() => isDate(ago(5000)).assert('>3 years'), {
          name: 'ExpressionError',
          message: "Invalid expression '>3 years': unknown time unit 'years'",
          expression: '>3 years'
        });
      });

      it('parses a leading space', () => {
        assert.equal(isDate(ago(3 * DAY)).assert(' >2 days'), true);
      });

      it('throws rather than comparing with NaN', () => {
        assert.throws(() => isDate(ago(0)).assert('banana'), /Invalid expression 'banana'/);
      });
    });
  });

  describe('calendar days', () => {
    // The UK clocks went forward at 01:00 UTC on 29 March 2026, so midday
    // on 28 March to midday on 30 March is 2 calendar days but 47 hours.
    const now = Date.parse('2026-03-30T11:00:00Z');
    const date = new Date('2026-03-28T12:00:00Z');

    beforeEach(() => {
      process.env.TZ = 'Europe/London';
      mock.timers.setTime(now);
    });

    it('counts days by the calendar across a daylight saving change', () => {
      assert.equal(now - date.getTime(), 47 * HOUR);
      assert.equal(isDate(date).assert('=2 days'), true);
      assert.equal(isDate(date).assert('>=2 days'), true);
      assert.equal(isDate(date).assert('<2 days'), false);
    });

    it('counts weeks by the calendar', () => {
      const weekAgo = new Date('2026-03-23T12:00:00Z');
      assert.equal(now - weekAgo.getTime(), WEEK - HOUR);
      assert.equal(isDate(weekAgo).assert('=1 week'), true);
    });

    it('counts hours as fixed lengths', () => {
      assert.equal(isDate(date).assert('=47 hours'), true);
    });
  });

  describe('comparison methods', () => {
    const methods = {
      lessThan: [true, false, false],
      lessThanOrEqual: [true, true, false],
      equalTo: [false, true, false],
      greaterThan: [false, false, true],
      greaterThanOrEqual: [false, true, true]
    } as const;

    type Method = keyof typeof methods;

    for (const [method, expected] of Object.entries(methods) as [Method, readonly boolean[]][]) {
      describe(`.${method}`, () => {
        it('compares whole units either side of the value', () => {
          const actual = [9, 10, 11].map((n) => isDate(ago(n * MINUTE + 30_000))[method](10, 'minutes'));
          assert.deepEqual(actual, expected);
        });

        it('defaults to days', () => {
          assert.equal(isDate(ago(10 * DAY))[method](10), expected[1]);
        });

        it('accepts unit aliases', () => {
          assert.equal(isDate(ago(10 * WEEK))[method](10, 'w'), expected[1]);
        });

        it('throws for an unknown unit', () => {
          assert.throws(
            () => isDate(ago(0))[method](10, 'years' as TimeUnit),
            { name: 'RangeError', message: "Unknown time unit 'years'" }
          );
        });

        it('throws for a value that is not a non-negative integer', () => {
          assert.throws(() => isDate(ago(0))[method](-1), RangeError);
          assert.throws(() => isDate(ago(0))[method](1.5), RangeError);
        });
      });
    }
  });

  describe('now', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    const date = new Date('2026-01-01T12:00:00Z');

    it('measures ages from now instead of the current time', () => {
      assert.equal(isDate(date, { now }).assert('=9 days'), true);
      assert.equal(isDate(date, { now }).greaterThanOrEqual(9), true);
      assert.equal(isDate(date, { now }).greaterThan(9), false);
    });

    it('stays fixed while the clock moves', () => {
      const assertion = isDate(date, { now });
      mock.timers.tick(30 * DAY);
      assert.equal(assertion.assert('=9 days'), true);
    });

    it('defaults to the time of each comparison', () => {
      const assertion = isDate(ago(9 * DAY));
      assert.equal(assertion.assert('=9 days'), true);
      mock.timers.tick(DAY);
      assert.equal(assertion.assert('=10 days'), true);
    });

    it('accepts an ISO string or milliseconds since the epoch', () => {
      assert.equal(isDate(date, { now: now.toISOString() }).assert('=9 days'), true);
      assert.equal(isDate(date, { now: now.getTime() }).assert('=9 days'), true);
    });

    it('throws a TypeError for an invalid now', () => {
      assert.throws(() => isDate(date, { now: 'banana' }), {
        name: 'TypeError',
        message: "Invalid now 'banana'"
      });
    });
  });

  describe('isDate', () => {
    it('accepts a Date', () => {
      assert.equal(isDate(ago(20 * DAY)).assert('20 days'), true);
    });

    it('accepts an ISO string', () => {
      assert.equal(isDate(ago(20 * DAY).toISOString()).assert('20 days'), true);
    });

    it('accepts milliseconds since the epoch', () => {
      assert.equal(isDate(NOW - 20 * DAY).assert('20 days'), true);
    });

    for (const date of ['banana', NaN, new Date(NaN)]) {
      it(`throws a TypeError for ${String(date)}`, () => {
        assert.throws(() => isDate(date), TypeError);
      });
    }
  });
});
