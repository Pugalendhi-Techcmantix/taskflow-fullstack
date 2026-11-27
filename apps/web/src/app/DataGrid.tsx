import { useState, type ReactNode } from 'react';

/** One column of a DataGrid. `id` must be a key of the row type, so column ids autocomplete and typos fail to compile. */
export type Column<T> = {
  id: keyof T & string;
  header: string;
  render: (row: T) => ReactNode;
  /** Value used for local sorting. Leave out to make the column unsortable (local mode). */
  sortValue?: (row: T) => string | number | null;
  className?: string;
};

export type GridSort<K extends string> = { by: K; dir: 'asc' | 'desc' };

/**
 * Who sorts the rows:
 * - `local`: the grid sorts the rows it was given (click: ascending → descending → unsorted).
 * - `server`: the rows arrive sorted; the grid only shows the current sort and reports clicks
 *   (click: ascending ↔ descending; another column starts ascending). Use it with paged data.
 */
export type GridSorting<T> =
  | { mode: 'local' }
  | { mode: 'server'; sortable: readonly (keyof T & string)[]; sort: GridSort<keyof T & string>; onSort: (next: GridSort<keyof T & string>) => void };

type Props<T> = {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Accessible label for the table. */
  label: string;
  empty: ReactNode;
  sorting?: GridSorting<T>;
  /** New rows are on their way (the old ones stay visible, dimmed). */
  busy?: boolean;
};

const compare = (a: string | number | null, b: string | number | null) => {
  if (a === b) return 0;
  if (a === null) return 1; // empty values last
  if (b === null) return -1;
  return a < b ? -1 : 1;
};

/** Generic, type-safe table: sortable headers, keyboard-reachable rows. */
export function DataGrid<T>({ rows, columns, rowKey, onRowClick, label, empty, sorting = { mode: 'local' }, busy = false }: Props<T>) {
  const [localSort, setLocalSort] = useState<GridSort<keyof T & string> | null>(null);
  const sort = sorting.mode === 'server' ? sorting.sort : localSort;

  const sortCol = sorting.mode === 'local' && localSort ? columns.find((c) => c.id === localSort.by) : undefined;
  const getter = sortCol?.sortValue;
  const shown = getter && localSort
    ? rows.toSorted((a, b) => {
        const r = compare(getter(a), getter(b));
        return localSort.dir === 'asc' ? r : -r;
      })
    : rows;

  const isSortable = (c: Column<T>) => (sorting.mode === 'server' ? sorting.sortable.includes(c.id) : c.sortValue !== undefined);
  const toggle = (id: keyof T & string) => {
    if (sorting.mode === 'server') {
      sorting.onSort({ by: id, dir: sorting.sort.by === id && sorting.sort.dir === 'asc' ? 'desc' : 'asc' });
      return;
    }
    setLocalSort((s) => (s?.by === id ? (s.dir === 'asc' ? { by: id, dir: 'desc' } : null) : { by: id, dir: 'asc' }));
  };

  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="table-scroll">
      <table className={`grid ${busy ? 'busy' : ''}`} aria-label={label} aria-busy={busy || undefined}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={c.className}
                aria-sort={sort?.by === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {isSortable(c) ? (
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
          {shown.map((row) => (
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
