import { ExpressionError, parseExpression, type Assertion, type Operator } from './expression.ts';

const multipliers: Record<string, number> = {
  '': 1,
  b: 1,
  k: 1024,
  kb: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4
};

function checkBytes(bytes: number): number {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
    throw new TypeError(`Expected a number of bytes, got ${String(bytes)}`);
  }
  return bytes;
}

function compare(operator: Operator, bytes: number, threshold: number): boolean {
  switch (operator) {
    case '<': return bytes < threshold;
    case '<=': return bytes <= threshold;
    case '>': return bytes > threshold;
    case '>=': return bytes >= threshold;
    case '==': return bytes === threshold;
  }
}

export interface SizeFilter {
  /**
   * @throws TypeError if `bytes` isn't a number
   */
  (bytes: number): boolean;
  readonly expression: string | number;
  readonly operator: Operator;
  /** The threshold in bytes, e.g. 10240 for `'>10kb'`. */
  readonly bytes: number;
}

/**
 * Parses a size expression such as `'>=10kb'` into a function that tests a
 * number of bytes against it. Units are powers of 1024 and default to bytes;
 * the operator defaults to `==`.
 *
 * @throws ExpressionError if the expression can't be parsed or has an unknown unit
 */
export function parseSize(expression: string | number): SizeFilter {
  const { operator, value, unit } = parseExpression(expression);
  const multiplier = multipliers[unit];
  if (multiplier === undefined) {
    throw new ExpressionError(expression, `unknown size unit '${unit}'`);
  }
  const threshold = value * multiplier;

  const filter = (bytes: number) => compare(operator, checkBytes(bytes), threshold);

  return Object.freeze(Object.assign(filter, { expression, operator, bytes: threshold }));
}

/**
 * For a one-off check: `isSize(n).assert(expression)` is the same as
 * `parseSize(expression)(n)`.
 *
 * @throws TypeError if `bytes` isn't a number
 */
export function isSize(bytes: number): Assertion {
  checkBytes(bytes);
  return { assert: (expression) => parseSize(expression)(bytes) };
}
