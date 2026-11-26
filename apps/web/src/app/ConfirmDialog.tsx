import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** "Are you sure?" as a native modal dialog: focus trapped, Escape cancels. */
export function ConfirmDialog({ title, children, confirmLabel, pendingLabel, danger, pending, onConfirm, onClose }: Props) {
  return (
    <dialog className="modal" aria-labelledby="confirm-h" onClose={onClose} ref={(el) => { if (el && !el.open) el.showModal(); }}>
      <div className="modal-head">
        <h2 id="confirm-h">{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="modal-body"><div style={{ marginBottom: 14 }}>{children}</div></div>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={onClose} autoFocus>Cancel</button>
        <button type="button" className={`btn ${danger ? 'danger-solid' : 'primary'}`} disabled={pending} onClick={onConfirm}>
          {pending ? (pendingLabel ?? 'Working…') : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
