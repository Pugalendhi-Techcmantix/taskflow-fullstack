import { pageCount, pageItems } from '@taskflow/core';

type Props<S extends number> = {
  page: number;
  size: S;
  total: number;
  sizes: readonly S[];
  onPage: (page: number) => void;
  onSize: (size: S) => void;
  /** What the rows are, for screen readers ("tasks"). */
  noun: string;
};

/** "Showing 1–25 of 42", rows per page, and ‹ 1 2 3 › (prototype pager). */
export function Pager<S extends number>({ page, size, total, sizes, onPage, onSize, noun }: Props<S>) {
  const pages = pageCount(total, size);
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  return (
    <div className="pager">
      <span aria-live="polite">Showing {from}–{to} of {total}</span>
      <span className="pager-controls">
        <select className="input" aria-label="Rows per page" value={size}
          onChange={(e) => {
            const next = sizes.find((s) => String(s) === e.target.value);
            if (next !== undefined) onSize(next);
          }}>
          {sizes.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
        <nav className="pages" aria-label={`Pages of ${noun}`}>
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
          {pageItems(page, pages).map((p, i) =>
            p === 'gap'
              ? <span key={`gap-${i}`} className="gap" aria-hidden="true">…</span>
              : (
                <button key={p} type="button" className={p === page ? 'active' : undefined} aria-label={`Page ${p}`}
                  aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>
              ))}
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
        </nav>
      </span>
    </div>
  );
}
