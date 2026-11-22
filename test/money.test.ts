import { describe, it, expect } from 'vitest';
import { lineTotal, toGrosze } from '../src/items/money';

describe('money', () => {
  it('multiplies in grosze without float drift', () => {
    expect(0.1 * 3).not.toBe(0.3);
    expect(lineTotal(0.1, 3)).toBe(0.3);
    expect(lineTotal('19.99', 7)).toBe(139.93);
  });

  it('accepts Decimal-like values', () => {
    expect(toGrosze({ toString: () => '12.50' })).toBe(1250);
  });

  it('zero quantity gives zero', () => {
    expect(lineTotal(45.5, 0)).toBe(0);
  });
});
