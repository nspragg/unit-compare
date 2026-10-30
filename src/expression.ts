export type Operator = '<' | '<=' | '>' | '>=' | '==';

export interface Expression {
  operator: Operator;
  value: number;
  unit: string;
}

/**
 * Thrown when an expression passed to `assert` can't be parsed or has an
 * unknown unit.
 */
export class ExpressionError extends Error {
  override name = 'ExpressionError';
  readonly expression: string | number;

  constructor(expression: string | number, reason?: string) {
    super(`Invalid expression '${expression}'${reason ? `: ${reason}` : ''}`);
    this.expression = expression;
  }
}

const EXPRESSION = /^\s*(<=|>=|<|>|==?)?\s*(\d+)\s*([a-z]*)\s*$/i;

/**
 * Parses `[operator] value [unit]`, e.g. `'>= 10 kb'`. A number is treated as
 * `'==<number>'`. The operator defaults to `==` and `=` is an alias for it.
 * The unit is returned lower-cased, or as `''` when absent.
 */
export function parseExpression(expression: string | number): Expression {
  if (typeof expression === 'number') {
    if (!isCount(expression)) {
      throw new ExpressionError(expression, 'expected a non-negative integer');
    }
    return {
      operator: '==',
      value: expression,
      unit: ''
    };
  }

  if (typeof expression !== 'string') {
    throw new TypeError(`Expected a string or number expression, got ${typeof expression}`);
  }

  const matches = EXPRESSION.exec(expression);
  const [, operator = '==', value = '', unit = ''] = matches ?? [];
  if (!matches || !isCount(Number(value))) {
    throw new ExpressionError(expression);
  }

  return {
    operator: operator === '=' ? '==' : operator as Operator,
    value: Number(value),
    unit: unit.toLowerCase()
  };
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function toCount(value: number): number {
  if (!isCount(value)) {
    throw new RangeError(`Expected a non-negative integer, got ${value}`);
  }
  return value;
}
