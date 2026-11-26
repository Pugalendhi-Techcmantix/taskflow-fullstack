import { useSyncExternalStore } from 'react';

export type Toast = { id: number; kind: 'success' | 'error'; message: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Shows a short message in the corner. Errors stay a little longer. */
export function toast(message: string, kind: Toast['kind'] = 'success') {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { id, kind, message }];
  emit();
  setTimeout(() => dismissToast(id), kind === 'error' ? 6000 : 3500);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.message}</span>
          <button className="toast-x" onClick={() => dismissToast(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
