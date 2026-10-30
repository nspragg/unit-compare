import { ByteAssertion } from './byteAssertion.ts';
import { DateAssertion, type DateAssertionOptions, type DateInput } from './dateAssertion.ts';

export { ByteAssertion, type ByteUnit } from './byteAssertion.ts';
export { DateAssertion, type DateAssertionOptions, type DateInput, type TimeUnit } from './dateAssertion.ts';
export { ExpressionError, type Operator } from './expression.ts';

/**
 * @throws TypeError if the date or `now` is invalid
 */
export function isDate(date: DateInput, options?: DateAssertionOptions): DateAssertion {
  return new DateAssertion(date, options);
}

export function isSize(bytes: number | undefined): ByteAssertion {
  return new ByteAssertion(bytes);
}

/**
 * An alias for {@link isSize}.
 */
export function isNumber(bytes: number | undefined): ByteAssertion {
  return new ByteAssertion(bytes);
}
