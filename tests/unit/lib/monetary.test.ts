import { describe, it, expect } from 'vitest';
import {
  toCents,
  fromCents,
  addMoney,
  subtractMoney,
  multiplyMoney,
  roundMoney,
  computeTax,
  sumMoney,
  moneyEqual,
  formatMoney,
} from '@/lib/monetary';

describe('monetary utilities', () => {
  describe('toCents / fromCents', () => {
    it('converts 19.99 to 1999 cents', () => {
      expect(toCents(19.99)).toBe(1999);
    });

    it('converts 1999 cents to 19.99', () => {
      expect(fromCents(1999)).toBe(19.99);
    });

    it('handles zero', () => {
      expect(toCents(0)).toBe(0);
      expect(fromCents(0)).toBe(0);
    });

    it('handles IEEE 754 problem: 0.1 + 0.2 via toCents', () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JS, but toCents should round correctly
      expect(toCents(0.1 + 0.2)).toBe(30);
    });
  });

  describe('addMoney', () => {
    it('adds two amounts correctly', () => {
      expect(addMoney(10.5, 3.75)).toBe(14.25);
    });

    it('handles IEEE 754 problem pair 0.1 + 0.2', () => {
      expect(addMoney(0.1, 0.2)).toBe(0.3);
    });

    it('adds negative amounts', () => {
      expect(addMoney(10.0, -3.5)).toBe(6.5);
    });
  });

  describe('subtractMoney', () => {
    it('subtracts correctly', () => {
      expect(subtractMoney(100.0, 33.33)).toBe(66.67);
    });
  });

  describe('multiplyMoney', () => {
    it('multiplies amount by factor', () => {
      expect(multiplyMoney(10.5, 3)).toBe(31.5);
    });

    it('rounds result to 2 decimals', () => {
      expect(multiplyMoney(33.33, 0.19)).toBe(6.33);
    });
  });

  describe('roundMoney', () => {
    it('rounds 0.005 up (HALF_UP)', () => {
      expect(roundMoney(0.005)).toBe(0.01);
    });

    it('rounds 0.004 down', () => {
      expect(roundMoney(0.004)).toBe(0.0);
    });

    it('does not change already-rounded values', () => {
      expect(roundMoney(19.99)).toBe(19.99);
    });
  });

  describe('computeTax', () => {
    it('computes 19% of 100.00', () => {
      expect(computeTax(100.0, 19)).toBe(19.0);
    });

    it('computes 19% of 33.33 correctly', () => {
      expect(computeTax(33.33, 19)).toBe(6.33);
    });

    it('computes 7% of 100.00', () => {
      expect(computeTax(100.0, 7)).toBe(7.0);
    });

    it('computes 0% tax', () => {
      expect(computeTax(100.0, 0)).toBe(0.0);
    });

    it('handles large amounts', () => {
      expect(computeTax(999999.99, 19)).toBe(190000.0);
    });
  });

  describe('sumMoney', () => {
    it('sums multiple amounts without drift', () => {
      const amounts = Array(100).fill(33.33);
      expect(sumMoney(amounts)).toBe(3333.0);
    });

    it('sums empty array to 0', () => {
      expect(sumMoney([])).toBe(0);
    });

    it('sums single amount', () => {
      expect(sumMoney([42.5])).toBe(42.5);
    });

    it('handles mixed positive/negative', () => {
      expect(sumMoney([100.0, -50.25, 25.75])).toBe(75.5);
    });
  });

  describe('moneyEqual', () => {
    it('treats equal values as equal', () => {
      expect(moneyEqual(100.0, 100.0)).toBe(true);
    });

    it('treats 0.01 difference as equal (default tolerance)', () => {
      expect(moneyEqual(100.0, 100.01)).toBe(true);
    });

    it('treats 0.02 difference as NOT equal (default tolerance)', () => {
      expect(moneyEqual(100.0, 100.02)).toBe(false);
    });

    it('respects custom tolerance', () => {
      expect(moneyEqual(100.0, 100.05, 0.05)).toBe(true);
      expect(moneyEqual(100.0, 100.06, 0.05)).toBe(false);
    });
  });

  describe('formatMoney', () => {
    it('formats to 2 decimals', () => {
      expect(formatMoney(19)).toBe('19.00');
      expect(formatMoney(19.9)).toBe('19.90');
      expect(formatMoney(19.99)).toBe('19.99');
    });
  });
});
