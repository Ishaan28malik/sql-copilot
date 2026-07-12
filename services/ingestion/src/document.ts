import type { TableMetadata } from '@sqlcopilot/shared';

/**
 * Renders one table's metadata into the plain-text document that is both
 * embedded for retrieval and injected into the LLM prompt as schema context.
 */
export function renderTableDocument(table: TableMetadata): string {
  const lines: string[] = [`Table: ${table.schema}.${table.name}`, 'Columns:'];

  for (const col of table.columns) {
    const flags = [
      col.isPrimaryKey ? 'primary key' : null,
      col.nullable ? null : 'not null',
    ].filter(Boolean);
    lines.push(`  - ${col.name} (${col.dataType}${flags.length ? ', ' + flags.join(', ') : ''})`);
  }

  if (table.foreignKeys.length > 0) {
    lines.push('Foreign keys:');
    for (const fk of table.foreignKeys) {
      lines.push(`  - ${fk.column} -> ${fk.referencesSchema}.${fk.referencesTable}.${fk.referencesColumn}`);
    }
  }

  if (table.indexes.length > 0) {
    lines.push('Indexes:');
    for (const idx of table.indexes.slice(0, 5)) lines.push(`  - ${idx}`);
  }

  if (table.sampleRows.length > 0) {
    lines.push('Sample rows:');
    for (const row of table.sampleRows) {
      const cells = Object.entries(row)
        .slice(0, 12)
        .map(([k, v]) => `${k}=${v ?? 'NULL'}`)
        .join(', ');
      lines.push(`  - ${cells}`);
    }
  }

  return lines.join('\n');
}
