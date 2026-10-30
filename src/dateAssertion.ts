import { ExpressionError, parseExpression, toCount, type Operator } from './expression.ts';

export type TimeUnit =
  | 'm' | 'min' | 'mins' | 'minute' | 'minutes'
  | 'h' | 'hour' | 'hours'
  | 'd' | 'day' | 'days'
  | 'w' | 'week' | 'weeks';

export type AgeUnit = 'minutes' | 'hours' | 'days' | 'weeks';

const units: Record<string, AgeUnit> = {
  '': 'days',
  m: 'minutes',
  min: 'minutes',
  mins: 'minutes',
  minute: 'minutes',
  minutes: 'minutes',
  h: 'hours',
  hour: 'hours',
  hours: 'hours',
  d: 'days',
  day: 'days',
  days: 'days',
  w: 'weeks',
  week: 'weeks',
  weeks: 'weeks'
};

function normalise(unit: string): AgeUnit {
  const canonical = units[unit.toLowerCase()];
  if (canonical === undefined) {
    throw new RangeError(`Unknown time unit '${unit}'`);
  }
  return canonical;
}

function toTime(date: DateInput, name: string): number {
  const time = new Date(date).getTime();
  if (Number.isNaN(time)) {
    throw new TypeError(`Invalid ${name} '${String(date)}'`);
  }
  return time;
}

// Days and weeks are calendar days, so they stay correct across daylight
// saving changes; minutes and hours are fixed lengths.
function subtract(now: Date, amount: number, unit: AgeUnit): number {
  switch (unit) {
    case 'minutes': return now.getTime() - amount * 60_000;
    case 'hours': return now.getTime() - amount * 3_600_000;
    case 'days': return new Date(now).setDate(now.getDate() - amount);
    case 'weeks': return new Date(now).setDate(now.getDate() - amount * 7);
  }
}

// The times n and n + 1 units before now. A date's age is at least n units
// when it is at or before the first.
type Thresholds = readonly [number, number];

function thresholds(now: number, value: number, unit: AgeUnit): Thresholds {
  const date = new Date(now);
  return [subtract(date, value, unit), subtract(date, value + 1, unit)];
}

function compare(operator: Operator, time: number, [nAgo, nPlusOneAgo]: Thresholds): boolean {
  switch (operator) {
    case '<': return time > nAgo;
    case '<=': return time > nPlusOneAgo;
    case '>': return time <= nPlusOneAgo;
    case '>=': return time <= nAgo;
    case '==': return time <= nAgo && time > nPlusOneAgo;
  }
}

export type DateInput = Date | string | number;

export interface AgeOptions {
  /**
   * The time ages are measured from: a fixed time, or a function such as
   * `Date.now` for a clock that moves. Defaults to the time of parsing.
   */
  now?: DateInput | (() => DateInput);
}

export interface AgeFilter {
  /**
   * @throws TypeError if the date is invalid
   */
  (date: DateInput): boolean;
  readonly expression: string | number;
  readonly operator: Operator;
  readonly value: number;
  readonly unit: AgeUnit;
}

/**
 * Parses an age expression such as `'>=10 days'` into a function that tests
 * a date against it. The unit defaults to days; the operator defaults to
 * `==`. Ages are compared in whole units, like `find -mtime`.
 *
 * @throws ExpressionError if the expression can't be parsed or has an unknown unit
 * @throws TypeError if a fixed `now` is invalid
 */
export function parseAge(expression: string | number, options: AgeOptions = {}): AgeFilter {
  const { operator, value, unit } = parseExpression(expression);
  const canonical = units[unit];
  if (canonical === undefined) {
    throw new ExpressionError(expression, `unknown time unit '${unit}'`);
  }

  const { now = Date.now() } = options;
  const at = (time: DateInput) => thresholds(toTime(time, 'now'), value, canonical);
  let current: () => Thresholds;
  if (typeof now === 'function') {
    current = () => at(now());
  } else {
    const fixed = at(now);
    current = () => fixed;
  }

  const filter = (date: DateInput) => compare(operator, toTime(date, 'date'), current());

  return Object.freeze(Object.assign(filter, { expression, operator, value, unit: canonical }));
}

export interface DateAssertionOptions {
  /**
   * The time ages are measured from. Defaults to the time of each comparison;
   * pass a fixed time to compare many dates consistently.
   */
  now?: DateInput;
}

/**
 * Compares the age of a date in whole units: a date 2.5 days old is 2 days
 * old, so it matches `'=2 days'`, `'>=2 days'` and `'<3 days'` but not
 * `'>2 days'`. This is the same rounding as `find -mtime`.
 */
export class DateAssertion {
  readonly #time: number;
  readonly #now: number | undefined;

  /**
   * @throws TypeError if the date or `now` is invalid
   */
  constructor(date: DateInput, options: DateAssertionOptions = {}) {
    this.#time = toTime(date, 'date');
    this.#now = options.now === undefined ? undefined : toTime(options.now, 'now');
  }

  /**
   * Compares against an age expression such as `'>=10 days'`. The unit
   * defaults to days; the operator defaults to `==`.
   *
   * @throws ExpressionError if the expression can't be parsed or has an unknown unit
   */
  assert(expression: string | number): boolean {
    return parseAge(expression, { now: this.#now ?? Date.now })(this.#time);
  }

  lessThan(value: number, unit: TimeUnit = 'days'): boolean {
    return this.#compare('<', toCount(value), normalise(unit));
  }

  lessThanOrEqual(value: number, unit: TimeUnit = 'days'): boolean {
    return this.#compare('<=', toCount(value), normalise(unit));
  }

  equalTo(value: number, unit: TimeUnit = 'days'): boolean {
    return this.#compare('==', toCount(value), normalise(unit));
  }

  greaterThan(value: number, unit: TimeUnit = 'days'): boolean {
    return this.#compare('>', toCount(value), normalise(unit));
  }

  greaterThanOrEqual(value: number, unit: TimeUnit = 'days'): boolean {
    return this.#compare('>=', toCount(value), normalise(unit));
  }

  #compare(operator: Operator, value: number, unit: AgeUnit): boolean {
    return compare(operator, this.#time, thresholds(this.#now ?? Date.now(), value, unit));
  }
}
