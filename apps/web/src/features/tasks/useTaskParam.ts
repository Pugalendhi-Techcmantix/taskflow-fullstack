import { useSearchParams } from 'react-router';
import { parseTaskKey } from '@taskflow/core';

/** `?task=TF-107` in the URL = that task's dialog is open (shareable, survives refresh). */
export function useTaskParam(projectKey: string) {
  const [params, setParams] = useSearchParams();
  const parsed = parseTaskKey(params.get('task') ?? '');
  const openNumber = parsed && parsed.projectKey === projectKey ? parsed.number : null;
  const open = (key: string) => setParams((p) => { p.set('task', key); return p; });
  const close = () => setParams((p) => { p.delete('task'); return p; }, { replace: true });
  return { openNumber, open, close };
}
