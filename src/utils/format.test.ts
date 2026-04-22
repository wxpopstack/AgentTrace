import { describe, it, expect } from 'vitest';
import { formatTimestamp, formatJson } from '../utils/format';

describe('formatTimestamp', () => {
  it('returns empty string for empty input', () => {
    expect(formatTimestamp('')).toBe('');
  });

  it('formats ISO timestamp to local time', () => {
    const result = formatTimestamp('2025-01-15T10:30:00Z');
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/01/);
  });

  it('returns original string if not ISO format', () => {
    expect(formatTimestamp('some text')).toBe('some text');
  });
});

describe('formatJson', () => {
  it('returns null for non-JSON content', () => {
    expect(formatJson('plain text')).toBeNull();
  });

  it('formats valid JSON object', () => {
    const result = formatJson('{"name":"test"}');
    expect(result).toBe('{\n  "name": "test"\n}');
  });

  it('formats valid JSON array', () => {
    const result = formatJson('[1,2,3]');
    expect(result).toBe('[\n  1,\n  2,\n  3\n]');
  });

  it('returns null for invalid JSON', () => {
    expect(formatJson('{invalid}')).toBeNull();
  });
});
