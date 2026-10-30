import { ExpressionError, parseExpression, toCount, type Operator } from './expression.ts';

export type TimeUnit =
  | 'm' | 'min' | 'mins' | 'minute' | 'minutes'
  | 'h' | 'hour' | 'hours'
  | 'd' | 'day' | 'days'
  | 'w' | 'week' | 'weeks';

type CanonicalUnit = 'minutes' | 'hours' | 'days' | 'weeks';

const units: Record<string, CanonicalUnit> = {
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

function normalise(unit: string): CanonicalUnit {
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
function subtract(now: Date, amount: number, unit: CanonicalUnit): number {
  switch (unit) {
    case 'minutes': return now.getTime() - amount * 60_000;
    case 'hours': return now.getTime() - amount * 3_600_000;
    case 'days': return new Date(now).setDate(now.getDate() - amount);
    case 'weeks': return new Date(now).setDate(now.getDate() - amount * 7);
  }
}

export type DateInput = Date | string | number;

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
    const { operator, value, unit } = parseExpression(expression);
    const canonical = units[unit];
    if (canonical === undefined) {
      throw new ExpressionError(expression, `unknown time unit '${unit}'`);
    }
    return this.#compare(operator, value, canonical);
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

  // The age is at least n units when the date is at or before now - n units.
  #compare(operator: Operator, value: number, unit: CanonicalUnit): boolean {
    const now = new Date(this.#now ?? Date.now());
    const atLeast = (n: number) => this.#time <= subtract(now, n, unit);

    switch (operator) {
      case '<': return !atLeast(value);
      case '<=': return !atLeast(value + 1);
      case '>': return atLeast(value + 1);
      case '>=': return atLeast(value);
      case '==': return atLeast(value) && !atLeast(value + 1);
    }
  }
}
