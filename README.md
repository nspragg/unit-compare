# unit-compare

[![CI](https://github.com/nspragg/unit-compare/actions/workflows/ci.yml/badge.svg)](https://github.com/nspragg/unit-compare/actions/workflows/ci.yml)

> Parse and compare byte sizes and date ages using expressions such as `'>10kb'` and `'<=3 days'`

* [Installation](#installation)
* [Usage](#usage)
* [Expressions](#expressions)
* [API](#api)
* [Migrating from 1.x](#migrating-from-1x)
* [Test](#test)
* [Contributing](#contributing)

## Installation

Requires Node.js 24 or later.

```
npm install unit-compare
```

The package is ESM and ships TypeScript types. On Node 24 it can also be loaded with `require()`.

## Usage

Parse an expression once, then test values against it:

```js
import { parseSize, parseAge } from 'unit-compare';

const isLarge = parseSize('>10mb');
const isStale = parseAge('>=2 weeks'); // ages are measured from the time of parsing

const matches = files.filter((file) => isLarge(file.size) && isStale(file.mtime));
```

A bad expression throws when it's parsed, before any values are tested, so input from users can be checked up front.

For a one-off check, use `isSize` or `isDate`:

```js
import { isSize, isDate } from 'unit-compare';

isSize(1024).assert('<10mb'); // true
isDate(stats.mtime).assert('<30 minutes'); // modified in the last half an hour
```

An expression that can't be parsed, or has an unknown unit, throws an `ExpressionError` rather than returning `false`:

```js
import { ExpressionError } from 'unit-compare';

try {
  parseAge(userInput);
} catch (err) {
  if (err instanceof ExpressionError) {
    console.error(err.message); // e.g. Invalid expression '>3 years': unknown time unit 'years'
  }
}
```

## Expressions

An expression is `[operator] value [unit]`, where `value` is a non-negative integer. Whitespace before, after and between the parts is ignored, and units are case-insensitive.

Operators:

* `<` less than
* `<=` less than or equal to
* `>` greater than
* `>=` greater than or equal to
* `==` or `=` equal to (the default)

A number can be passed instead of a string, and is treated as `'==<number>'`.

### Sizes

Size units are multiples of 1024:

* bytes: `b` (the default)
* kilobytes: `k` or `kb`
* megabytes: `m` or `mb`
* gigabytes: `g` or `gb`
* terabytes: `t` or `tb`

Examples:

* equal to 10 bytes: `10`, `==10b`
* less than 10 bytes: `<10`
* greater than 50 megabytes: `>50mb`

### Ages

An age is how long ago a date was. Time units:

* minutes: `m`, `min`, `mins`, `minute` or `minutes`
* hours: `h`, `hour` or `hours`
* days: `d`, `day` or `days` (the default)
* weeks: `w`, `week` or `weeks`

Ages are compared in **whole units**, like `find -mtime`: a date 2½ days old is 2 days old. So it matches `=2 days`, `>=2 days`, `<=2 days` and `<3 days`, but not `>2 days`.

Days and weeks are calendar days, so they stay correct across daylight saving changes. Minutes and hours are fixed lengths.

Examples:

* 10 days old: `10`, `=10 days`
* less than 10 hours old: `< 10 hours`
* more than 50 minutes old: `>50minutes`
* at least 2 weeks old: `>=2w`

## API

### `parseSize(expression) -> SizeFilter`

Parses a [size expression](#sizes) into a function that takes a number of bytes and returns a `boolean`. The function throws a `TypeError` if it's given something other than a number.

The function also has read-only properties:

* `expression` - the expression as given
* `operator` - `'<'`, `'<='`, `'>'`, `'>='` or `'=='`
* `bytes` - the threshold in bytes, e.g. `10240` for `'>10kb'`

Throws an `ExpressionError` if the expression is invalid.

### `parseAge(expression, options?) -> AgeFilter`

Parses an [age expression](#ages) into a function that takes a date (a `Date`, ISO string or milliseconds since the epoch) and returns a `boolean`. The function throws a `TypeError` for an invalid date.

* `options.now` - the time ages are measured from. Defaults to the **time of parsing**, so every date tested against the filter is measured from the same moment. Pass a fixed time in any date form, or a function such as `Date.now` for a long-lived filter whose clock moves:

  ```js
  const isRecent = parseAge('<5 minutes', { now: Date.now });
  ```

The function also has read-only properties:

* `expression` - the expression as given
* `operator` - `'<'`, `'<='`, `'>'`, `'>='` or `'=='`
* `value` - the number in the expression
* `unit` - `'minutes'`, `'hours'`, `'days'` or `'weeks'`

Throws an `ExpressionError` if the expression is invalid, or a `TypeError` if a fixed `now` is invalid.

### `isSize(bytes).assert(expression) -> boolean`

The same as `parseSize(expression)(bytes)`. `isSize` throws a `TypeError` if `bytes` isn't a number, and `assert` throws an `ExpressionError` if the expression is invalid.

### `isDate(date).assert(expression) -> boolean`

The same as `parseAge(expression)(date)`, so the age is measured from the time `assert` is called. `isDate` throws a `TypeError` if the date is invalid, and `assert` throws an `ExpressionError` if the expression is invalid.

### `ExpressionError`

Thrown for an invalid expression. Extends `Error`, and has an `expression` property holding the expression that failed.

## Migrating from 1.x

* Requires Node.js 24 or later. The package is ESM: use `import { isSize, isDate } from 'unit-compare'`, or `require()` on Node 24.
* `isNumber` is renamed to `isSize`.
* The comparison methods, such as `lessThan` and `greaterThanOrEqual`, are removed. Use an expression instead: `isSize(n).lessThan(10, 'k')` becomes `isSize(n).assert('<10k')`.
* `isSize` and `isDate` return an object with only an `assert` method. The `ByteAssertion` and `DateAssertion` classes are no longer exported.
* `moment` is no longer a dependency. Pass `isDate` a `Date`, ISO string or timestamp; for a moment object, call `.toDate()` first.
* Invalid expressions and unknown units now throw an `ExpressionError` instead of returning a wrong answer. `isSize` throws a `TypeError` for anything other than a number, including `undefined`, and `isDate` throws a `TypeError` for an invalid date.
* Date ages are compared in whole units. `=` matches anywhere within the unit rather than to the second, and `>n` now means at least n + 1 units old.
* `>=` is now supported for dates, and so is the `weeks` unit.
* New `parseSize` and `parseAge` functions parse an expression once, so it's checked before any values are tested.
* Size units are now case-insensitive, and leading or trailing whitespace no longer breaks parsing.

## Test

```
npm test
```

To check coverage:

```
npm run coverage
```

## Contributing

* If you're unsure if a feature would make a good addition, you can always [create an issue](https://github.com/nspragg/unit-compare/issues/new) first.
* We aim for 100% test coverage. Please write tests for any new functionality or changes.
* Any API changes should be fully documented.
* Make sure your code passes `npm run lint` and `npm run typecheck`.
* Be mindful of others when making suggestions and/or code reviewing.
