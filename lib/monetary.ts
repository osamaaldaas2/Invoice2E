/**
 * Decimal-safe monetary arithmetic utilities.
 *
 * All public functions accept and return plain JS numbers representing amounts
 * with up to 2 decimal places. Internally, calculations use integer-cent
 * arithmetic to avoid IEEE 754 floating-point drift.
 *
 * Rounding policy: HALF_UP equivalent (standard commercial rounding).
 */

/**
 * Convert an amount (e.g. 19.99) to integer cents (1999).
 *
 * Uses string-based decomposition for 3+ decimal inputs to avoid IEEE 754
 * precision loss. E.g. `10.005 * 100 = 1000.4999...` in IEEE 754, which
 * `Math.round` incorrectly resolves to 1000 instead of 1001.
 *
 * FIX: Audit V2 [F-001] — string-based rounding for precision safety.
 */
export function toCents(amount: number): number {
  if (amount === 0) return 0;
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const str = String(abs);
  const dotIdx = str.indexOf('.');

  if (dotIdx === -1 || str.length - dotIdx - 1 <= 2) {
    // 0–2 decimal places: standard approach with epsilon correction
    const cents = Math.round((abs + Number.EPSILON) * 100);
    return negative ? -cents : cents;
  }

  // 3+ decimal places: string-based decomposition to avoid IEEE 754 drift
  const [intPart = '0', decPart = ''] = str.split('.');
  const paddedDec = (decPart + '000').slice(0, 3); // take 3 digits for rounding
  const centsStr = intPart + paddedDec.slice(0, 2);
  const thirdDigit = parseInt(paddedDec[2] || '0', 10);
  const baseCents = parseInt(centsStr, 10);
  const cents = thirdDigit >= 5 ? baseCents + 1 : baseCents;
  return negative ? -cents : cents;
}

/**
 * Convert integer cents back to a 2-decimal amount.
 */
export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Add two monetary amounts, returning a 2-decimal result.
 */
export function addMoney(a: number, b: number): number {
  return fromCents(toCents(a) + toCents(b));
}

/**
 * Subtract b from a, returning a 2-decimal result.
 */
export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

/**
 * Multiply an amount by a factor and round to 2 decimals.
 * Useful for quantity * unitPrice.
 */
export function multiplyMoney(amount: number, factor: number): number {
  return roundMoney(amount * factor);
}

/**
 * Round a number to exactly 2 decimal places (HALF_UP).
 */
export function roundMoney(value: number): number {
  return fromCents(Math.round(value * 100));
}

/**
 * Compute tax amount: basis * (rate / 100), rounded to 2 decimals.
 * @param basisAmount  Net amount (e.g. 100.00)
 * @param ratePercent  Tax rate as percentage (e.g. 19 for 19%)
 */
export function computeTax(basisAmount: number, ratePercent: number): number {
  return roundMoney((basisAmount * ratePercent) / 100);
}

/**
 * Sum an array of monetary amounts, returning a 2-decimal result.
 */
export function sumMoney(amounts: number[]): number {
  const totalCents = amounts.reduce((acc, amt) => acc + toCents(amt), 0);
  return fromCents(totalCents);
}

/**
 * Check if two monetary amounts are equal within a tolerance.
 * Default tolerance is 0 (exact match). Pass explicit tolerance only
 * where rounding differences are expected (e.g., AI-extracted vs calculated).
 *
 * FIX: Audit V2 [F-011] — strict default prevents masking real errors.
 */
export function moneyEqual(a: number, b: number, tolerance = 0): boolean {
  // Compare in cents to avoid floating-point comparison issues
  const diffCents = Math.abs(toCents(a) - toCents(b));
  const toleranceCents = Math.round(tolerance * 100);
  return diffCents <= toleranceCents;
}

/**
 * Format a number to exactly 2 decimal places as a string.
 */
export function formatMoney(amount: number): string {
  return roundMoney(amount).toFixed(2);
}
