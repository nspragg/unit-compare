import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ExpressionError, isNumber, isSize, type ByteUnit } from '../src/index.ts';

const KB = 1024;

describe('isSize', () => {
  it('is an alias for isNumber', () => {
    assert.equal(isSize(2 * KB).assert('>1kb'), true);
    assert.equal(isSize(2 * KB).lessThan(1, 'k'), false);
  });
});

describe('ByteAssertion', () => {
  describe('.assert', () => {
    it('defaults to equality in bytes', () => {
      assert.equal(isNumber(10).assert('10'), true);
      assert.equal(isNumber(11).assert('10'), false);
    });

    it('treats a number as ==<bytes>', () => {
      assert.equal(isNumber(2048).assert(2048), true);
      assert.equal(isNumber(2049).assert(2048), false);
    });

    const operators = {
      '<': [true, false, false],
      '<=': [true, true, false],
      '>': [false, false, true],
      '>=': [false, true, true],
      '==': [false, true, false],
      '=': [false, true, false],
      '': [false, true, false]
    };

    for (const [operator, expected] of Object.entries(operators)) {
      it(`supports '${operator || '(none)'}' either side of the boundary`, () => {
        const actual = [10 * KB - 1, 10 * KB, 10 * KB + 1].map((n) => isNumber(n).assert(`${operator}10kb`));
        assert.deepEqual(actual, expected);
      });
    }

    const units = {
      b: 1,
      k: KB,
      kb: KB,
      m: KB ** 2,
      mb: KB ** 2,
      g: KB ** 3,
      gb: KB ** 3,
      t: KB ** 4,
      tb: KB ** 4
    };

    for (const [unit, multiplier] of Object.entries(units)) {
      it(`magnifies '${unit}' by ${multiplier}`, () => {
        assert.equal(isNumber(10 * multiplier).assert(`10${unit}`), true);
        assert.equal(isNumber(10 * multiplier + 1).assert(`10${unit}`), false);
      });
    }

    it('ignores the case of the unit', () => {
      assert.equal(isNumber(10 * KB).assert('10KB'), true);
      assert.equal(isNumber(10 * KB).assert('10Kb'), true);
    });

    it('ignores whitespace', () => {
      assert.equal(isNumber(11).assert('>=   10 '), true);
      assert.equal(isNumber(2 * KB).assert(' > 1 kb '), true);
    });

    it('returns false when the number is undefined', () => {
      assert.equal(isNumber(undefined).assert('>=0'), false);
    });

    for (const expression of ['banana', '>', '10x', '10bb', '10kbb', '10 bytes', -1]) {
      it(`throws an ExpressionError for '${expression}'`, () => {
        assert.throws(() => isNumber(0).assert(expression), ExpressionError);
      });
    }

    it('names an unknown unit in the error', () => {
      assert.throws(() => isNumber(0).assert('10 weeks'), {
        name: 'ExpressionError',
        message: "Invalid expression '10 weeks': unknown size unit 'weeks'",
        expression: '10 weeks'
      });
    });

    describe('regressions', () => {
      it('parses a leading space', () => {
        assert.equal(isNumber(2 * KB).assert(' >1kb'), true);
      });

      it('keeps the unit when there is trailing whitespace', () => {
        assert.equal(isNumber(512).assert('>1kb '), false);
      });

      it('throws rather than comparing with NaN', () => {
        assert.throws(() => isNumber(0).assert('banana'), /Invalid expression 'banana'/);
      });
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

    for (const [method, expected] of Object.entries(methods)) {
      describe(`.${method}`, () => {
        it('compares either side of the boundary', () => {
          const actual = [KB ** 2 * 10 - 1, KB ** 2 * 10, KB ** 2 * 10 + 1]
            .map((n) => isNumber(n)[method as keyof typeof methods](10, 'm'));
          assert.deepEqual(actual, expected);
        });

        it('defaults to bytes', () => {
          assert.equal(isNumber(10)[method as keyof typeof methods](10), expected[1]);
        });

        it('throws for an unknown unit', () => {
          assert.throws(
            () => isNumber(10)[method as keyof typeof methods](10, 'x' as ByteUnit),
            { name: 'RangeError', message: "Unknown size unit 'x'" }
          );
        });

        it('throws for a value that is not a non-negative integer', () => {
          assert.throws(() => isNumber(10)[method as keyof typeof methods](-1), RangeError);
          assert.throws(() => isNumber(10)[method as keyof typeof methods](1.5), RangeError);
        });

        it('returns false when the number is undefined', () => {
          assert.equal(isNumber(undefined)[method as keyof typeof methods](0), false);
        });
      });
    }
  });
});
