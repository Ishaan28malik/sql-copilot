import type { SqlDialect } from '@sqlcopilot/shared';

const DIALECT_NAMES: Record<SqlDialect, string> = {
  postgres: 'PostgreSQL',
};

export interface SqlGenerationInput {
  question: string;
  /** Rendered schema documents for the tables retrieved from vector search. */
  schemaContext: string;
  dialect: SqlDialect;
}

export interface SqlRepairInput extends SqlGenerationInput {
  failedSql: string;
  error: string;
}

export const SQL_SYSTEM_PROMPT = [
  'You are an expert SQL analyst. You translate natural-language questions into SQL.',
  'Rules:',
  '- Return exactly ONE SQL statement and nothing else. No explanations, no markdown fences.',
  '- The statement must be a read-only SELECT (WITH ... SELECT is allowed).',
  '- Never write INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, or GRANT.',
  '- Only use tables and columns that appear in the provided schema.',
  '- Use explicit JOINs based on the foreign keys in the schema.',
  '- Prefer readable aliases and qualify columns when joining.',
].join('\n');

export function buildSqlGenerationPrompt(input: SqlGenerationInput): string {
  return [
    `SQL dialect: ${DIALECT_NAMES[input.dialect]}`,
    '',
    'Database schema (only these tables exist):',
    input.schemaContext,
    '',
    `Question: ${input.question}`,
    '',
    `Write the ${DIALECT_NAMES[input.dialect]} SELECT statement that answers the question. Output only the SQL.`,
  ].join('\n');
}

export function buildSqlRepairPrompt(input: SqlRepairInput): string {
  return [
    `SQL dialect: ${DIALECT_NAMES[input.dialect]}`,
    '',
    'Database schema (only these tables exist):',
    input.schemaContext,
    '',
    `Question: ${input.question}`,
    '',
    'A previous attempt failed.',
    'Failed SQL:',
    input.failedSql,
    '',
    `Error: ${input.error}`,
    '',
    'Fix the SQL so it runs correctly and still answers the question. Output only the corrected SQL.',
  ].join('\n');
}
