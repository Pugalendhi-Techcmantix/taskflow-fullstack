import { useState, type ReactNode } from 'react';

/** One column of a DataGrid. `id` must be a key of the row type, so column ids autocomplete and typos fail to compile. */
export type Column<T> = {
  id: keyof T & string;
  header: string;
  render: (row: T) => ReactNode;
  /** Value used for sorting. Leave out to make the column unsortable. */
  sortValue?: (row: T) => string | number | null;
  className?: string;
};

type Sort<T> = { by: keyof T & string; dir: 'asc' | 'desc' } | null;

type Props<T> = {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Accessible label for the table. */
  label: string;
  empty: ReactNode;
};

const compare = (a: string | number | null, b: string | number | null) => {
  if (a === b) return 0;
  if (a === null) return 1; // empty values last
  if (b === null) return -1;
  return a < b ? -1 : 1;
};

/** Generic, type-safe table: sortable headers, keyboard-reachable rows. */
export function DataGrid<T>({ rows, columns, rowKey, onRowClick, label, empty }: Props<T>) {
  const [sort, setSort] = useState<Sort<T>>(null);
  const sortCol = sort ? columns.find((c) => c.id === sort.by) : undefined;
  const sorted = sortCol?.sortValue && sort
    ? rows.toSorted((a, b) => {
        const getter = sortCol.sortValue;
        if (!getter) return 0;
        const r = compare(getter(a), getter(b));
        return sort.dir === 'asc' ? r : -r;
      })
    : rows;

  const toggle = (id: keyof T & string) =>
    setSort((s) => (s?.by === id ? (s.dir === 'asc' ? { by: id, dir: 'desc' } : null) : { by: id, dir: 'asc' }));

  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="table-scroll">
      <table className="grid" aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={c.className}
                aria-sort={sort?.by === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sortValue ? (
                  <button type="button" className="th-sort" onClick={() => toggle(c.id)}>
                    {c.header}
                    <span aria-hidden="true">{sort?.by === c.id ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className={onRowClick ? 'click' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}>
              {columns.map((c) => <td key={c.id} className={c.className}>{c.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
