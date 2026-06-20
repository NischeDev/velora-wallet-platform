import { ValidationError } from '../errors/app-error.js';

const MAX_AMOUNT_MINOR = 1_000_000_000_000_000_000n;

export function parsePositiveMinorUnits(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new ValidationError('amountMinor must be a positive integer string');
  }

  const amount = BigInt(value);
  if (amount > MAX_AMOUNT_MINOR) {
    throw new ValidationError('amountMinor exceeds the supported transaction limit');
  }

  return amount;
}

export function toMinorUnitString(value: bigint | string): string {
  return typeof value === 'bigint' ? value.toString() : value;
}
