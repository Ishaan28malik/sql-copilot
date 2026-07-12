import { parseSqlFromCompletion } from '@sqlcopilot/prompts';
import { describe, expect, it } from 'vitest';

describe('parseSqlFromCompletion', () => {
  it('returns bare SQL unchanged', () => {
    expect(parseSqlFromCompletion('SELECT 1')).toBe('SELECT 1');
  });

  it('strips markdown fences', () => {
    expect(parseSqlFromCompletion('```sql\nSELECT id FROM users\n```')).toBe('SELECT id FROM users');
  });

  it('strips leading prose', () => {
    expect(parseSqlFromCompletion('Here is the query:\nSELECT id FROM users')).toBe(
      'SELECT id FROM users',
    );
  });

  it('keeps only the first statement', () => {
    expect(parseSqlFromCompletion('SELECT 1; SELECT 2;')).toBe('SELECT 1');
  });

  it('handles WITH queries', () => {
    const sql = 'WITH t AS (SELECT 1 AS x) SELECT x FROM t';
    expect(parseSqlFromCompletion(sql)).toBe(sql);
  });
});
