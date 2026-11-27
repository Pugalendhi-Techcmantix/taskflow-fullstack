import { useEffect, useEffectEvent } from 'react';
import { useNavigate } from 'react-router';

/** "G then D" style navigation: the second key must follow within this time. */
const SEQUENCE_MS = 1200;

/** G + letter → page (prototype). Pages that arrive in later modules open their "coming soon" page. */
const GO_TO: Record<string, string> = { d: '/', p: '/projects', b: '/board', s: '/sprints', t: '/tasks', m: '/team', a: '/activity' };

/** Shown in the help dialog. Only shortcuts that really work are listed. */
const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: 'Search', keys: ['/'] },
  { label: 'New task', keys: ['C'] },
  { label: 'Show this help', keys: ['?'] },
  { label: 'Close dialog or menu', keys: ['Esc'] },
  { label: 'Collapse sidebar', keys: ['['] },
  { label: 'Go to Dashboard', keys: ['G', 'D'] },
  { label: 'Go to Projects', keys: ['G', 'P'] },
  { label: 'Go to Board', keys: ['G', 'B'] },
  { label: 'Go to Sprints', keys: ['G', 'S'] },
  { label: 'Go to Tasks', keys: ['G', 'T'] },
  { label: 'Go to Team & roles', keys: ['G', 'M'] },
  { label: 'Go to Activity', keys: ['G', 'A'] },
  { label: 'Board: move between cards', keys: ['←', '↑', '→', '↓'] },
  { label: 'Board: move card to next column', keys: ['Shift', '→'] },
  { label: 'Board: move card to previous column', keys: ['Shift', '←'] },
  { label: 'Board: open the focused card', keys: ['Enter'] },
];

/** Typing in a field, or a dialog being open, pauses the single-key shortcuts. */
function shortcutsPaused(target: EventTarget | null): boolean {
  if (document.querySelector('dialog[open]')) return true;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

type Handlers = { onSearch: () => void; onHelp: () => void; onNewTask: () => void; onToggleSidebar: () => void };

/** The app-wide keyboard shortcuts. One document listener for the whole signed-in app. */
export function useGlobalShortcuts(handlers: Handlers) {
  const navigate = useNavigate();
  const onKey = useEffectEvent((e: KeyboardEvent, state: { gAt: number }) => {
    if (e.ctrlKey || e.metaKey || e.altKey || shortcutsPaused(e.target)) return;
    const key = e.key.toLowerCase();
    const page = GO_TO[key];
    if (state.gAt && Date.now() - state.gAt < SEQUENCE_MS && page) {
      e.preventDefault();
      state.gAt = 0;
      navigate(page);
      return;
    }
    state.gAt = 0;
    if (e.key === '/') {
      e.preventDefault();
      handlers.onSearch();
    } else if (e.key === '?') {
      e.preventDefault();
      handlers.onHelp();
    } else if (key === 'c' && !e.shiftKey) {
      e.preventDefault();
      handlers.onNewTask();
    } else if (key === 'g' && !e.shiftKey) {
      state.gAt = Date.now();
    } else if (e.key === '[') {
      e.preventDefault();
      handlers.onToggleSidebar();
    }
  });

  useEffect(() => {
    const state = { gAt: 0 };
    const listener = (e: KeyboardEvent) => onKey(e, state);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
}

/** The "Keyboard shortcuts" help (prototype), as a native modal dialog. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <dialog className="modal shortcuts" aria-labelledby="shortcuts-h" onClose={onClose} ref={(el) => { if (el && !el.open) el.showModal(); }}>
      <div className="modal-head">
        <h2 id="shortcuts-h">Keyboard shortcuts</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose} autoFocus>×</button>
      </div>
      <div className="modal-body">
        <dl className="sc-grid">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="sc-row">
              <dt>{s.label}</dt>
              <dd>{s.keys.map((k) => <kbd key={k}>{k}</kbd>)}</dd>
            </div>
          ))}
        </dl>
        <p className="muted small sc-note">"G then D" means press G, release it, then press D. Shortcuts are paused while you type in a field.</p>
      </div>
    </dialog>
  );
}
