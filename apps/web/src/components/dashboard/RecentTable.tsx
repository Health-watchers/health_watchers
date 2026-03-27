import { Card, Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui'

interface Column<T> {
  key: keyof T | string
  label: string
  render?: (row: T) => React.ReactNode
}

interface RecentTableProps<T extends Record<string, unknown>> {
  title: string
  columns: Column<T>[]
  rows: T[]
  emptyMessage: string
}

export function RecentTable<T extends Record<string, unknown>>({
  title, columns, rows, emptyMessage,
}: RecentTableProps<T>) {
  return (
    <Card padding="none">
      <div className="px-6 py-4 border-b border-secondary-200">
        <h2 className="text-base font-semibold text-secondary-900">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-secondary-400">
          <span className="text-4xl mb-2" aria-hidden="true">📭</span>
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(col => (
                <TableHead key={String(col.key)}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map(col => (
                  <TableCell key={String(col.key)}>
                    {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '—')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
