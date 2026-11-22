import { describe, it, expect } from 'vitest';
import { diff } from '../src/audit/audit';

describe('audit diff', () => {
  it('keeps only changed fields', () => {
    expect(diff({ a: 1, b: 2, c: 'x' }, { a: 1, b: 3, c: 'x' })).toEqual({ before: { b: 2 }, after: { b: 3 } });
  });

  it('returns null when nothing changed', () => {
    expect(diff({ a: 1 }, { a: 1 })).toBeNull();
  });

  it('compares dates by value', () => {
    const d = '2026-01-11T00:00:00.000Z';
    expect(diff({ countedAt: new Date(d) }, { countedAt: new Date(d) })).toBeNull();
  });
});
