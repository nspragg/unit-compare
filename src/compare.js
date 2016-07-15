import DateAssertion from './dateAssertion';
import ByteAssertion from './byteAssertion';

export function isDate(date) {
  return new DateAssertion(date);
}

export function isNumber(number) {
  return new ByteAssertion(number);
}
