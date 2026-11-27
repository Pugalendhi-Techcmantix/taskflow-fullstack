import { useSearchParams } from 'react-router';
import type { z } from 'zod';

/**
 * Typed state kept in the URL query string, so a refresh or a shared link shows the same view.
 *
 * `schema` is a Zod object whose fields all end in `.catch(default)`: a missing or hand-edited value
 * falls back to the default instead of breaking the page. Values equal to their default are left out of the URL.
 * Other query parameters (such as `?task=TF-107`) are kept untouched.
 */
export function useUrlState<S extends z.ZodObject>(schema: S) {
  const [params, setParams] = useSearchParams();
  const defaults = new Map(Object.entries(schema.parse({})));
  const value: z.output<S> = schema.parse(Object.fromEntries(params));
  const isDefault = Object.entries(value).every(([k, v]) => v === defaults.get(k));

  /**
   * Updates some fields. Replaces the history entry, so typing in a filter doesn't flood the Back button.
   * The URL updates a moment later (React Router navigates asynchronously), so a text box must not read
   * its value straight from here while the user types. Use <UrlTextInput>.
   */
  const set = (patch: Partial<z.output<S>>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === defaults.get(k)) next.delete(k);
        else next.set(k, String(v));
      }
      return next;
    }, { replace: true });

  /** Back to the defaults (removes this state's fields from the URL). */
  const reset = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const k of Object.keys(schema.shape)) next.delete(k);
      return next;
    }, { replace: true });

  return [value, set, { isDefault, reset }] as const;
}
