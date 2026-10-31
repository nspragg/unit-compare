import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ExpressionError, parseSize } from '../src/index.ts';

const KB = 1024;

describe('parseSize', () => {
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
      const isMatch = parseSize(`${operator}10kb`);
      assert.deepEqual([10 * KB - 1, 10 * KB, 10 * KB + 1].map(isMatch), expected);
    });
  }

  const units = {
    '': 1,
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
    it(`magnifies '${unit || '(none)'}' by ${multiplier}`, () => {
      const isMatch = parseSize(`10${unit}`);
      assert.equal(isMatch.bytes, 10 * multiplier);
      assert.equal(isMatch(10 * multiplier), true);
      assert.equal(isMatch(10 * multiplier + 1), false);
    });
  }

  it('ignores the case of the unit', () => {
    assert.equal(parseSize('10KB').bytes, 10 * KB);
    assert.equal(parseSize('10Kb').bytes, 10 * KB);
  });

  it('ignores whitespace', () => {
    assert.equal(parseSize('>=   10 ')(11), true);
    assert.equal(parseSize(' > 1 kb ')(2 * KB), true);
  });

  it('treats a number as ==<bytes>', () => {
    const isMatch = parseSize(2048);
    assert.equal(isMatch(2048), true);
    assert.equal(isMatch(2049), false);
  });

  it('exposes the parsed expression', () => {
    const isMatch = parseSize(' >= 10 KB ');
    assert.equal(isMatch.expression, ' >= 10 KB ');
    assert.equal(isMatch.operator, '>=');
    assert.equal(isMatch.bytes, 10 * KB);
  });

  it('is frozen', () => {
    assert.equal(Object.isFrozen(parseSize('>1kb')), true);
  });

  it('works as an array filter', () => {
    assert.deepEqual([512, 1024, 2048].filter(parseSize('>=1kb')), [1024, 2048]);
  });

  for (const expression of ['banana', '>', '10x', '10bb', '10kbb', '10 bytes', '1.5mb', -1]) {
    it(`throws an ExpressionError for '${expression}' when parsing`, () => {
      assert.throws(() => parseSize(expression), ExpressionError);
    });
  }

  it('names an unknown unit in the error', () => {
    assert.throws(() => parseSize('10 weeks'), {
      name: 'ExpressionError',
      message: "Invalid expression '10 weeks': unknown size unit 'weeks'",
      expression: '10 weeks'
    });
  });

  for (const bytes of [undefined, null, '1024', NaN]) {
    it(`throws a TypeError when called with ${String(bytes)}`, () => {
      const isMatch = parseSize('>1kb');
      assert.throws(() => isMatch(bytes as unknown as number), {
        name: 'TypeError',
        message: `Expected a number of bytes, got ${String(bytes)}`
      });
    });
  }

  describe('regressions', () => {
    it('parses a leading space', () => {
      assert.equal(parseSize(' >1kb')(2 * KB), true);
    });

    it('keeps the unit when there is trailing whitespace', () => {
      assert.equal(parseSize('>1kb ')(512), false);
    });

    it('throws rather than comparing with NaN', () => {
      assert.throws(() => parseSize('banana'), /Invalid expression 'banana'/);
    });
  });
});
