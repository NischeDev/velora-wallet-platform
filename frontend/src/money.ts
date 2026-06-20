export function decimalToMinorUnits(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Enter a valid amount with up to 2 decimal places.');
  }
  const [whole = '0', fraction = ''] = trimmed.split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result <= 0n) throw new Error('Amount must be greater than zero.');
  return result.toString();
}

export function formatMoney(minorUnits: string, currency = 'USD'): string {
  const value = BigInt(minorUnits);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const rawWhole = (absolute / 100n).toString();
  const whole =
    currency === 'INR'
      ? groupIndianDigits(rawWhole)
      : rawWhole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (absolute % 100n).toString().padStart(2, '0');
  const symbol = currency === 'USD' ? '$' : currency === 'INR' ? '₹' : `${currency} `;
  return `${negative ? '-' : ''}${symbol}${whole}.${cents}`;
}

function groupIndianDigits(value: string): string {
  if (value.length <= 3) return value;
  const lastThree = value.slice(-3);
  const leading = value.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${leading},${lastThree}`;
}
