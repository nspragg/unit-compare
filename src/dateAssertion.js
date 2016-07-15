import moment from 'moment';

import {
  normalise
} from './dates';

class DateAssertion {
  constructor(date) {
    this.date = date;
  }

  _parse(expression) {
    const matches = new RegExp('(<=|<|>|==?)?\s*(.*?)\s*([a-z]*)?\s*$').exec(expression);

    return {
      value: parseInt(matches[2] || 0),
      operator: matches[1] || '==',
      unit: normalise(matches[3] || 'days')
    };
  }

  _diff(value, unit) {
    const targetDate = moment().subtract(value, unit);
    const modified = moment(this.date);
    const unitDifference = moment(targetDate.format()).diff(modified, 'seconds');

    return unitDifference;
  }

  assert(expression) {
    const parts = this._parse(expression);

    if (parts.operator === '<') return this.lessThan(parts.value, parts.unit);
    if (parts.operator === '>') return this.greaterThan(parts.value, parts.unit);
    if (parts.operator === '<=') return this.lessThanOrEqual(parts.value, parts.unit);
    if (parts.operator === '>=') return this.greaterThanOrEqual(parts.value, parts.unit);

    return this.equalTo(parts.value, parts.unit);
  }

  lessThan(unitNumber, unit) {
    return this._diff(unitNumber, unit) < 0;
  }

  equalTo(number, unit) {
    return this._diff(number, unit) === 0;
  }

  greaterThan(number, unit) {
    return this._diff(number, unit) > 0;
  }

  lessThanOrEqual(number, unit) {
    return this._diff(number, unit) <= 0;
  }

  greaterThanOrEqual(number, unit) {
    return this._diff(number, unit) >= 0;
  }
}

export default DateAssertion;
