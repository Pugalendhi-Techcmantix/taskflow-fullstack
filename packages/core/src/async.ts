/**
 * Every async UI state is one of these four — never a mix of isLoading / isError booleans.
 * Illegal combinations (loading AND error) cannot be represented.
 */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: T };
