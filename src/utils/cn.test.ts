import { describe, it, expect } from 'vitest';
import { cn } from '../utils/cn';

describe('cn', () => {
  it('joins string classes', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('filters out falsy values', () => {
    expect(cn('a', null, 'b', undefined, false, 'c')).toBe('a b c');
  });

  it('returns empty string for all falsy values', () => {
    expect(cn(null, undefined, false)).toBe('');
  });
});
