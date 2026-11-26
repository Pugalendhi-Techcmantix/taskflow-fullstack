import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, isOverdue, type TaskStatus, type TaskSummary } from '@taskflow/core';
import { Avatar } from '../../app/Avatar';
import { Icon } from '../../app/icons';
import { toast } from '../../app/toast';
import { formatDay, todayIso } from '../../lib/dates';
import { PriorityBadge, TypeIcon } from '../tasks/badges';
import type { Move } from './board-api';

type Columns = Record<TaskStatus, string[]>;
const ARROW_STEP: Partial<Record<string, -1 | 1>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };

type Props = {
  /** Cards to show (already filtered), in board order. */
  tasks: TaskSummary[];
  canMove: boolean;
  /** Shown under To Do when the user may create tasks. */
  onAddTask?: (() => void) | undefined;
  onOpen: (task: TaskSummary) => void;
  onMove: (move: Move) => void;
  /** Cards whose move is still being saved: they can't be moved again until it finishes. */
  saving: ReadonlySet<string>;
  /** The card that just snapped back after a failed save (shakes once). */
  reverted: string | null;
  onRevertShown: () => void;
};

const columnId = (s: TaskStatus) => `col:${s}`;
const pts = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;
const columnOf = (cols: Columns, id: string): TaskStatus | undefined =>
  TASK_STATUSES.find((s) => columnId(s) === id) ?? TASK_STATUSES.find((s) => cols[s].includes(id));

/**
 * The 4 columns. Mouse and touch drag with dnd-kit; keyboard: arrows move focus, Shift + ←/→ moves the card
 * to the previous/next column, Shift + ↑/↓ moves it up or down, Enter opens it.
 */
export function KanbanBoard({ tasks, canMove, onAddTask, onOpen, onMove, saving, reverted, onRevertShown }: Props) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const fromTasks: Columns = { todo: [], in_progress: [], in_review: [], done: [] };
  for (const t of tasks) fromTasks[t.status].push(t.id);

  // While dragging, the columns follow the pointer locally; the server is only asked on drop.
  const [drag, setDrag] = useState<{ id: string; columns: Columns } | null>(null);
  const columns = drag?.columns ?? fromTasks;

  const cards = useRef(new Map<string, HTMLElement>());
  /** The card moved with the keyboard: it gets focus back once it shows up in its new column. */
  const focusNext = useRef<{ id: string; status: TaskStatus } | null>(null);
  const today = todayIso();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // a click still opens the card
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), // a swipe still scrolls
  );

  function tryMove(m: Move) {
    if (!canMove) toast("Your role can't move cards", 'error');
    else if (saving.has(m.task.id)) toast(`${m.task.key} is still saving`, 'error');
    else {
      focusNext.current = { id: m.task.id, status: m.status };
      onMove(m);
    }
  }

  /* ---------- mouse and touch ---------- */

  const onDragStart = ({ active }: DragStartEvent) => {
    focusNext.current = null;
    setDrag({ id: String(active.id), columns: fromTasks });
  };

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setDrag((d) => {
      if (!d) return d;
      const id = String(active.id);
      const from = columnOf(d.columns, id);
      const to = columnOf(d.columns, String(over.id));
      if (!from || !to || from === to) return d;
      const target = d.columns[to];
      const at = target.indexOf(String(over.id));
      const moved = at === -1 ? [...target, id] : target.toSpliced(at, 0, id);
      return { ...d, columns: { ...d.columns, [from]: d.columns[from].filter((x) => x !== id), [to]: moved } };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const d = drag;
    setDrag(null);
    const task = byId.get(String(active.id));
    if (!d || !over || !task) return;
    const status = columnOf(d.columns, task.id);
    if (!status) return;
    let list = d.columns[status];
    const overIndex = list.indexOf(String(over.id));
    if (overIndex !== -1) list = arrayMove(list, list.indexOf(task.id), overIndex);
    const i = list.indexOf(task.id);
    const afterId = list[i - 1] ?? null;
    const beforeId = list[i + 1] ?? null;

    const was = fromTasks[task.status];
    const j = was.indexOf(task.id);
    if (status === task.status && (was[j - 1] ?? null) === afterId && (was[j + 1] ?? null) === beforeId) return; // dropped where it was
    onMove({ task, status, afterId, beforeId });
  }

  /* ---------- keyboard ---------- */

  function onCardKey(e: KeyboardEvent<HTMLElement>, t: TaskSummary) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(t);
      return;
    }
    const step = ARROW_STEP[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const sideways = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    const col = TASK_STATUSES.indexOf(t.status);
    const list = columns[t.status];
    const i = list.indexOf(t.id);

    if (e.shiftKey && sideways) {
      const target = TASK_STATUSES[col + step];
      if (target) tryMove({ task: t, status: target, afterId: null, beforeId: columns[target][0] ?? null });
      return;
    }
    if (e.shiftKey) {
      if (step < 0 && i > 0) tryMove({ task: t, status: t.status, afterId: list[i - 2] ?? null, beforeId: list[i - 1] ?? null });
      if (step > 0 && i < list.length - 1) tryMove({ task: t, status: t.status, afterId: list[i + 1] ?? null, beforeId: list[i + 2] ?? null });
      return;
    }
    let next: string | undefined;
    if (sideways) {
      for (let c = col + step; c >= 0 && c < TASK_STATUSES.length && next === undefined; c += step) {
        const s = TASK_STATUSES[c];
        const other = s ? columns[s] : [];
        next = other[Math.min(i, other.length - 1)];
      }
    } else {
      next = list[i + step];
    }
    if (next) cards.current.get(next)?.focus();
  }

  /**
   * Keeps a handle on every card. A card moved with the keyboard is a new element in its new column, so focus
   * is given back to it there; a card that snapped back after a failed save gets focus back if focus was lost.
   */
  const cardRef = (t: TaskSummary) => (el: HTMLElement | null) => {
    if (!el) return void cards.current.delete(t.id);
    cards.current.set(t.id, el);
    const target = focusNext.current;
    if (target?.id === t.id && target.status === t.status) {
      focusNext.current = null;
      el.focus();
    } else if (reverted === t.id && document.activeElement === document.body) {
      el.focus();
    }
  };

  const dragged = drag ? byId.get(drag.id) : undefined;
  const dragColumn = drag ? columnOf(drag.columns, drag.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrag(null)}
      accessibility={{
        screenReaderInstructions: { draggable: 'Press Shift and an arrow key to move this card. Press Enter to open it.' },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${byId.get(String(active.id))?.key ?? 'card'}.`,
          onDragOver: () => undefined,
          onDragEnd: ({ active, over }) => (over ? `Dropped ${byId.get(String(active.id))?.key ?? 'card'}.` : 'Move cancelled.'),
          onDragCancel: () => 'Move cancelled.',
        },
      }}
    >
      <div className="board">
        {TASK_STATUSES.map((status) => (
          <BoardColumn key={status} status={status} cards={columns[status].flatMap((id) => byId.get(id) ?? [])}
            highlight={dragColumn === status} readOnly={!canMove} onAddTask={status === 'todo' ? onAddTask : undefined}>
            {(t) => (
              <SortableCard key={t.id} task={t} today={today} disabled={!canMove || saving.has(t.id)} saving={saving.has(t.id)}
                reverted={reverted === t.id} onRevertShown={onRevertShown} cardRef={cardRef(t)}
                onOpen={() => onOpen(t)} onKeyDown={(e) => onCardKey(e, t)} />
            )}
          </BoardColumn>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged ? <div className="kcard overlay"><CardBody task={dragged} today={today} /></div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({ status, cards, highlight, readOnly, onAddTask, children }: {
  status: TaskStatus;
  cards: TaskSummary[];
  highlight: boolean;
  readOnly: boolean;
  onAddTask?: (() => void) | undefined;
  children: (t: TaskSummary) => ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: columnId(status) });
  const headingId = useId();
  const points = cards.reduce((n, t) => n + (t.points ?? 0), 0);
  return (
    <section className="col" aria-labelledby={headingId}>
      <div className="col-head">
        <span className={`dot ${status}`} aria-hidden="true" />
        <b id={headingId}>{TASK_STATUS_LABELS[status]}</b>
        <span className="count" aria-label={`${cards.length} cards`}>{cards.length}</span>
        <span className="pts">{pts(points)}</span>
      </div>
      <SortableContext id={columnId(status)} items={cards.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`col-body ${highlight ? 'over' : ''} ${readOnly ? 'readonly' : ''}`}>
          {cards.map(children)}
        </div>
      </SortableContext>
      {onAddTask && <button type="button" className="add-card" onClick={onAddTask}>+ Add task</button>}
    </section>
  );
}

function SortableCard({ task, today, disabled, saving, reverted, onRevertShown, cardRef, onOpen, onKeyDown }: {
  task: TaskSummary;
  today: string;
  disabled: boolean;
  saving: boolean;
  reverted: boolean;
  onRevertShown: () => void;
  cardRef: (el: HTMLElement | null) => void;
  onOpen: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  const label = `${task.key} ${task.title}. ${TASK_STATUS_LABELS[task.status]}, ${TASK_PRIORITY_LABELS[task.priority]} priority${saving ? ', saving' : ''}`;
  return (
    <article
      ref={(el) => { setNodeRef(el); cardRef(el); }}
      {...attributes}
      {...listeners}
      aria-disabled={undefined}
      aria-roledescription="card"
      aria-label={label}
      className={['kcard', disabled && !saving ? 'locked' : '', saving ? 'saving' : '', reverted ? 'reverted' : '', isDragging ? 'dragging' : ''].filter(Boolean).join(' ')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      onAnimationEnd={reverted ? onRevertShown : undefined}
    >
      <CardBody task={task} today={today} />
    </article>
  );
}

function CardBody({ task: t, today }: { task: TaskSummary; today: string }) {
  return (
    <>
      <div className="kc-top"><TypeIcon type={t.type} /><span className="key">{t.key}</span><PriorityBadge priority={t.priority} /></div>
      <div className="kc-title">{t.title}</div>
      <div className="kc-foot">
        {t.points !== null && <span className="pill">{pts(t.points)}</span>}
        {t.dueDate && <span className={`meta ${isOverdue(t, today) ? 'overdue' : ''}`}><Icon name="cal" size={12} /> {formatDay(t.dueDate, false)}</span>}
        {t.subtasks.total > 0 && <span className="meta" title="Subtasks done"><Icon name="check" size={12} /> {t.subtasks.done}/{t.subtasks.total}</span>}
        {t.commentCount > 0 && <span className="meta" title="Comments"><Icon name="msg" size={12} /> {t.commentCount}</span>}
        <span className="spacer" />
        {t.assignee && <Avatar id={t.assignee.id} name={t.assignee.name} size="sm" title={t.assignee.name} />}
      </div>
    </>
  );
}
