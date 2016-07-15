const bytes = 'b';
const kiloBytes = 'k';
const megaBytes = 'm';
const gigaBytes = 'g';
const teraBytes = 't';

function isDefined(value) {
  return value !== undefined;
}

class ByteAssertion {
  constructor(number) {
    this.number = number;
  }

  _parse(expression) {
    const matches = new RegExp('(<=|>=|<|>|==?)?\s*(.*?)\s*([kmgt])?b?\s*$').exec(expression);

    return {
      value: isDefined(matches[2]) ? parseInt(matches[2]) : 0,
      operator: matches[1] || '==',
      unit: matches[3] || bytes
    };
  }

  _magnify(value, unit) {
    if (unit === kiloBytes) return (value *= 1024);
    if (unit === megaBytes) return (value *= 1024 * 1024);
    if (unit === gigaBytes) return (value *= 1024 * 1024 * 1024);
    if (unit === teraBytes) return (value *= 1024 * 1024 * 1024 * 1024);

    return value;
  }

  assert(expression) {
    const parts = this._parse(expression);

    if (parts.operator === '<') return this.lessThan(parts.value, parts.unit);
    if (parts.operator === '<=') return this.lessThanOrEqual(parts.value, parts.unit);
    if (parts.operator === '>') return this.greaterThan(parts.value, parts.unit);
    if (parts.operator === '>=') return this.greaterThanOrEqual(parts.value, parts.unit);

    return this.equalTo(parts.value, parts.unit);
  }

  lessThan(unitNumber, unit) {
    const magnifiedValue = this._magnify(unitNumber, unit);
    return isDefined(this.number) && (this.number < magnifiedValue);
  }

  lessThanOrEqual(unitNumber, unit) {
    const magnifiedValue = this._magnify(unitNumber, unit);
    return isDefined(this.number) && (this.number <= magnifiedValue);
  }

  equalTo(number, unit) {
    const magnifiedValue = this._magnify(number, unit);
    return isDefined(this.number) && (this.number === magnifiedValue);
  }

  greaterThan(number, unit) {
    const magnifiedValue = this._magnify(number, unit);
    return isDefined(this.number) && (this.number > magnifiedValue);
  }

  greaterThanOrEqual(number, unit) {
    const magnifiedValue = this._magnify(number, unit);
    return isDefined(this.number) && (this.number >= magnifiedValue);
  }
}

export default ByteAssertion;
