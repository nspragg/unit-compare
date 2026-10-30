import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ExpressionError, parseExpression } from '../src/expression.ts';

describe('ExpressionError', () => {
  it('is an Error', () => {
    const error = new ExpressionError('banana');
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'ExpressionError');
  });

  it('includes the reason in the message', () => {
    assert.equal(new ExpressionError('1x', 'unknown unit').message, "Invalid expression '1x': unknown unit");
  });
});

describe('parseExpression', () => {
  it('parses an operator, value and unit', () => {
    assert.deepEqual(parseExpression('>=10kb'), { operator: '>=', value: 10, unit: 'kb' });
  });

  for (const operator of ['<', '<=', '>', '>=', '=='] as const) {
    it(`parses ${operator}`, () => {
      assert.equal(parseExpression(`${operator}1`).operator, operator);
    });
  }

  it('treats = as ==', () => {
    assert.equal(parseExpression('=1').operator, '==');
  });

  it('defaults the operator to ==', () => {
    assert.equal(parseExpression('1').operator, '==');
  });

  it('defaults the unit to an empty string', () => {
    assert.equal(parseExpression('<1').unit, '');
  });

  it('lower-cases the unit', () => {
    assert.equal(parseExpression('1 KB').unit, 'kb');
  });

  it('treats a number as ==<number>', () => {
    assert.deepEqual(parseExpression(2048), { operator: '==', value: 2048, unit: '' });
  });

  describe('whitespace', () => {
    const cases = {
      leading: ' >1kb',
      trailing: '>1kb ',
      'between the operator and value': '> 1kb',
      'between the value and unit': '>1 kb',
      everywhere: '  >  1  kb  ',
      tabs: '\t>\t1\tkb\t'
    };

    for (const [name, expression] of Object.entries(cases)) {
      it(`ignores ${name} whitespace`, () => {
        assert.deepEqual(parseExpression(expression), { operator: '>', value: 1, unit: 'kb' });
      });
    }
  });

  describe('invalid expressions', () => {
    const invalid = [
      '',
      ' ',
      'banana',
      '>',
      'kb',
      '-1',
      '1.5kb',
      '1e3',
      '>>1',
      '=>1',
      '!=1',
      '===1',
      'k10',
      '1 k b',
      '1kb!',
      '1 2'
    ];

    for (const expression of invalid) {
      it(`throws for '${expression}'`, () => {
        assert.throws(() => parseExpression(expression), {
          name: 'ExpressionError',
          message: `Invalid expression '${expression}'`,
          expression
        });
      });
    }

    for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      it(`throws for the number ${value}`, () => {
        assert.throws(() => parseExpression(value), {
          name: 'ExpressionError',
          message: `Invalid expression '${value}': expected a non-negative integer`,
          expression: value
        });
      });
    }

    for (const value of [undefined, null, {}, ['1']]) {
      it(`throws a TypeError for ${JSON.stringify(value)}`, () => {
        assert.throws(() => parseExpression(value as unknown as string), TypeError);
      });
    }
  });
});
