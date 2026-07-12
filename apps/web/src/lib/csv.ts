import type { SqlCell } from '@sqlcopilot/shared';

const escapeCell = (value: SqlCell): string => {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function downloadCsv(filename: string, columns: string[], rows: SqlCell[][]): void {
  const lines = [columns.map(escapeCell).join(','), ...rows.map((row) => row.map(escapeCell).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
