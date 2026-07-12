/**
 * Extract the SQL statement from an LLM completion. Models occasionally wrap
 * output in ```sql fences or prepend prose despite instructions.
 */
export function parseSqlFromCompletion(completion: string): string {
  const fenced = completion.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  let sql = (fenced ? fenced[1] : completion).trim();

  // If prose precedes the statement, start from the first SELECT/WITH keyword.
  const start = sql.search(/\b(select|with)\b/i);
  if (start > 0) sql = sql.slice(start);

  // Keep a single statement: drop anything after the first semicolon.
  const semicolon = sql.indexOf(';');
  if (semicolon !== -1) sql = sql.slice(0, semicolon);

  return sql.trim();
}
