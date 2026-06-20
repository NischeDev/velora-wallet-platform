import { parsePositiveMinorUnits, toMinorUnitString } from '../../dist/common/money/money.js';

describe('money utilities', () => {
  test('parses integer strings without floating-point conversion', () => {
    expect(parsePositiveMinorUnits('9007199254740993')).toBe(9007199254740993n);
  });

  test.each(['0', '-1', '1.25', '1e3', 'abc', ''])('rejects invalid minor units: %s', (value) => {
    expect(() => parsePositiveMinorUnits(value)).toThrow();
  });

  test('serializes bigint values as JSON-safe strings', () => {
    expect(toMinorUnitString(12345n)).toBe('12345');
  });
});
