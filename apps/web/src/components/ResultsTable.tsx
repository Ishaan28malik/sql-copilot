import type { QueryResultData } from '@sqlcopilot/shared';
import { downloadCsv } from '../lib/csv';

export function ResultsTable({ result, filename }: { result: QueryResultData; filename?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-1 font-medium">
          {result.rowCount} row{result.rowCount === 1 ? '' : 's'}
          {result.truncated ? ' (truncated)' : ''}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 font-medium">{result.executionMs} ms</span>
        <button
          onClick={() => downloadCsv(filename ?? 'results.csv', result.columns, result.rows)}
          className="ml-auto rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-slate-50"
        >
          Download CSV
        </button>
      </div>

      {result.rowCount === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Query ran successfully but returned no rows.
        </p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                {result.columns.map((column) => (
                  <th key={column} className="px-3 py-2 text-left font-semibold text-slate-700">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {result.rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {row.map((cell, j) => (
                    <td key={j} className="max-w-xs truncate px-3 py-2 text-slate-600" title={cell === null ? 'NULL' : String(cell)}>
                      {cell === null ? <span className="italic text-slate-400">NULL</span> : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
