import { describe, expect, it } from 'vitest';
import { AstSqlValidator } from '../modules/query/validator';

const validator = new AstSqlValidator(1000);

describe('AstSqlValidator', () => {
  it.each([
    'DELETE FROM users',
    'DROP TABLE users',
    'UPDATE users SET name = 1',
    'ALTER TABLE users ADD COLUMN x int',
    'TRUNCATE users',
    'INSERT INTO users (id) VALUES (1)',
    'GRANT ALL ON users TO public',
    'CREATE TABLE evil (id int)',
  ])('rejects mutating statement: %s', async (sql) => {
    const result = await validator.validate(sql);
    expect(result.ok).toBe(false);
  });

  it('rejects multiple statements', async () => {
    const result = await validator.validate('SELECT 1; SELECT 2');
    expect(result.ok).toBe(false);
  });

  it('rejects stacked mutation after a select', async () => {
    const result = await validator.validate('SELECT 1; DROP TABLE users');
    expect(result.ok).toBe(false);
  });

  it('rejects unparseable SQL (fails closed)', async () => {
    const result = await validator.validate('SELEC id FRM users');
    expect(result.ok).toBe(false);
  });

  it('rejects empty input', async () => {
    const result = await validator.validate('   ');
    expect(result.ok).toBe(false);
  });

  it('accepts a plain select', async () => {
    const result = await validator.validate('SELECT id, name FROM users WHERE id = 1');
    expect(result.ok).toBe(true);
  });

  it('accepts joins and aggregates', async () => {
    const result = await validator.validate(
      'SELECT c.name, SUM(o.total) AS total FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name ORDER BY total DESC',
    );
    expect(result.ok).toBe(true);
  });

  it('injects a LIMIT when missing', async () => {
    const result = await validator.validate('SELECT id FROM users');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql.toLowerCase()).toContain('limit 1000');
  });

  it('clamps an oversized LIMIT', async () => {
    const result = await validator.validate('SELECT id FROM users LIMIT 999999');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sql.toLowerCase()).toContain('limit 1000');
      expect(result.sql).not.toContain('999999');
    }
  });

  it('keeps a small LIMIT untouched', async () => {
    const result = await validator.validate('SELECT id FROM users LIMIT 5');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql.toLowerCase()).toContain('limit 5');
  });

  it('tolerates a trailing semicolon', async () => {
    const result = await validator.validate('SELECT 1;');
    expect(result.ok).toBe(true);
  });
});
