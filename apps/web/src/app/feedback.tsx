/** Placeholder rows while data loads (keeps the layout from jumping). */
export function SkeletonRows({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="sk-rows">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk" style={{ width: i % 2 ? '82%' : '100%' }} />
      ))}
    </div>
  );
}

/** A failed load, with a way to try again. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <span>{error instanceof Error ? error.message : 'Could not load this data.'}</span>
      <button className="btn sm" onClick={onRetry}>Retry</button>
    </div>
  );
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Please try again.');
