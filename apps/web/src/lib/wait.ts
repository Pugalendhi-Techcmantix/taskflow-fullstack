/** How long typing must pause before a search request goes out. */
export const TYPING_DEBOUNCE_MS = 250;

/**
 * Resolves after `ms`, or rejects with an AbortError as soon as `signal` aborts.
 * Used inside TanStack Query functions as a debounce: when the user keeps typing, the query key
 * changes, Query aborts the old signal, and the old request is never sent.
 */
export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
