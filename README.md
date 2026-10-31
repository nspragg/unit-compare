# unit-compare

[![CI](https://github.com/nspragg/unit-compare/actions/workflows/ci.yml/badge.svg)](https://github.com/nspragg/unit-compare/actions/workflows/ci.yml)

> Parse and compare byte sizes and date ages using expressions such as `'>10kb'` and `'<=3 days'`

* [Installation](#installation)
* [Usage](#usage)
* [Use cases](#use-cases)
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

A filter is a plain function, so a one-off check is a single call:

```js
parseSize('<10mb')(1024); // true
parseAge('<30 minutes')(stats.mtime); // modified in the last half an hour
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

## Use cases

unit-compare is for writing expressive size and age filters, typically given on the command line, in a config file or in a search query.

### Command-line options

A script that lists the files in a directory matching `--age` and `--size`, such as `cleanup --age '>=30 days' --size '>100mb' ./logs`:

```js
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ExpressionError, parseAge, parseSize } from 'unit-compare';

const { values, positionals } = parseArgs({
  options: {
    age: { type: 'string', default: '>=0' },
    size: { type: 'string', default: '>=0' }
  },
  allowPositionals: true
});

function parseOption(parse, name) {
  try {
    return parse(values[name]);
  } catch (err) {
    if (!(err instanceof ExpressionError)) throw err;
    console.error(`--${name}: ${err.message}`);
    process.exit(2);
  }
}

const isOld = parseOption(parseAge, 'age');
const isLarge = parseOption(parseSize, 'size');

const dir = positionals[0] ?? '.';
for (const name of await readdir(dir)) {
  const stats = await stat(join(dir, name));
  if (stats.isFile() && isOld(stats.mtime) && isLarge(stats.size)) {
    console.log(name);
  }
}
```

A mistyped option is reported before any files are read:

```
$ cleanup --age '>3 years' ./logs
--age: Invalid expression '>3 years': unknown time unit 'years'
```

Every file's age is measured from when the options were parsed, so a file can't drop in or out of the results partway through the run.

### Config files

An expression keeps a setting to one readable field:

```json
{ "maxSize": "<30mb" }
```

rather than an object that every app has to validate in its own way:

```json
{ "maxSize": { "operator": "<", "value": 30, "unit": "mb" } }
```

For example, a long-running service with a retention policy in `cleanup.json`:

```json
{
  "rules": [
    { "dir": "logs", "age": ">=30 days" },
    { "dir": "cache", "age": ">=1 week", "size": ">1mb" }
  ]
}
```

Parse every rule at startup, so a mistake in the config stops the service when it starts, rather than surfacing later when a cleanup runs:

```js
import { readFile } from 'node:fs/promises';
import { ExpressionError, parseAge, parseSize } from 'unit-compare';

const config = JSON.parse(await readFile('cleanup.json', 'utf8'));

const rules = config.rules.map((rule, i) => {
  try {
    return {
      dir: rule.dir,
      isOld: parseAge(rule.age, { now: Date.now }),
      isLarge: parseSize(rule.size ?? '>=0')
    };
  } catch (err) {
    if (!(err instanceof ExpressionError)) throw err;
    throw new Error(`cleanup.json rules[${i}]: ${err.message}`, { cause: err });
  }
});
```

```
Error: cleanup.json rules[1]: Invalid expression '>=1 fortnight': unknown time unit 'fortnight'
```

The service runs for days, so `now: Date.now` makes each cleanup measure ages from the current time rather than from startup.

### Finding files with filehound

unit-compare was written for [filehound](https://github.com/nspragg/filehound), whose `size`, `modified`, `accessed` and `changed` filters take these expressions:

```js
import { FileHound, modified, size } from 'filehound';

const files = await FileHound.create()
  .paths('/var/log')
  .match(size('>10mb').and(modified('>=7 days')))
  .find();
```

Combined with the command-line example above, a user's `--size` and `--age` can be passed straight through as `size(values.size)` and `modified(values.age)`.

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

### `ExpressionError`

Thrown for an invalid expression. Extends `Error`, and has an `expression` property holding the expression that failed.

## Migrating from 1.x

* Requires Node.js 24 or later. The package is ESM: use `import { parseSize, parseAge } from 'unit-compare'`, or `require()` on Node 24.
* `isNumber`, `isDate` and the `ByteAssertion` and `DateAssertion` classes are removed. Parse the expression into a filter with `parseSize` or `parseAge`, then call it with the value:
  * `isNumber(n).assert('<10k')` becomes `parseSize('<10k')(n)`
  * `isDate(date).assert('>2 days')` becomes `parseAge('>2 days')(date)`

  When testing many values, parse once and reuse the filter.
* The comparison methods, such as `lessThan` and `greaterThanOrEqual`, are removed. Use an expression instead: `isNumber(n).lessThan(10, 'k')` becomes `parseSize('<10k')(n)`.
* `moment` is no longer a dependency. Pass an age filter a `Date`, ISO string or timestamp; for a moment object, call `.toDate()` first.
* Invalid expressions and unknown units now throw an `ExpressionError` instead of returning a wrong answer. A size filter throws a `TypeError` for anything other than a number, including `undefined`, and an age filter throws a `TypeError` for an invalid date.
* Date ages are compared in whole units. `=` matches anywhere within the unit rather than to the second, and `>n` now means at least n + 1 units old.
* `>=` is now supported for dates, and so is the `weeks` unit.
* Because an expression is parsed before any values are tested, a bad expression is reported up front.
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
