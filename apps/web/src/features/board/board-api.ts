import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TASK_STATUS_LABELS,
  boardResponse,
  byPosition,
  positionBetween,
  taskSummaryResponse,
  type Board,
  type MoveTaskInput,
  type TaskStatus,
  type TaskSummary,
} from '@taskflow/core';
import { errorMessage } from '../../app/feedback';
import { toast } from '../../app/toast';
import { ApiError, api } from '../../lib/http';
import { reloadSessionUser } from '../auth/session';
import { projectKeys } from '../projects/projects-api';
import { sprintKeys } from '../sprints/sprints-api';
import { taskKeys } from '../tasks/tasks-api';

/** Lives under the task list key, so every task change that refreshes the list refreshes the board too. */
export const boardKey = (projectKey: string) => [...taskKeys.list(projectKey), 'board'] as const;
const moveKey = (projectKey: string) => ['board-move', projectKey] as const;

const project = (projectKey: string) => `/api/projects/${encodeURIComponent(projectKey)}`;

export const fetchBoard = (projectKey: string, signal?: AbortSignal) =>
  api(`${project(projectKey)}/board`, { schema: boardResponse, ...(signal ? { signal } : {}) });
export const moveTask = (projectKey: string, number: number, input: MoveTaskInput) =>
  api(`${project(projectKey)}/tasks/${number}/move`, { method: 'POST', body: input, schema: taskSummaryResponse });

/** A card move: `task` as it was before the move, and where it goes. */
export type Move = { task: TaskSummary; status: TaskStatus; afterId: string | null; beforeId: string | null };

/** The board after a move: the same rule the server applies, so the card lands where it will stay. */
export function applyMove(tasks: TaskSummary[], m: Move): TaskSummary[] {
  const positionOf = (id: string | null) => (id === null ? null : (tasks.find((t) => t.id === id)?.position ?? null));
  const after = positionOf(m.afterId);
  const before = positionOf(m.beforeId);
  const column = tasks.filter((t) => t.status === m.status).map((t) => t.position);
  const position = after === null && before === null
    ? positionBetween(column.length ? Math.max(...column) : null, null)
    : positionBetween(after, before);
  return tasks.map((t) => (t.id === m.task.id ? { ...t, status: m.status, position } : t)).toSorted(byPosition);
}

const replaceTask = (tasks: TaskSummary[], task: TaskSummary) => tasks.map((t) => (t.id === task.id ? task : t)).toSorted(byPosition);

/**
 * Optimistic card moves: the card moves at once, the save runs in the background, and a failed save
 * puts only that card back (other moves still in flight keep their place) with a message saying why.
 */
export function useMoveCard(projectKey: string) {
  const qc = useQueryClient();
  const key = boardKey(projectKey);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [reverted, setReverted] = useState<string | null>(null);
  const setBoard = (update: (tasks: TaskSummary[]) => TaskSummary[]) =>
    qc.setQueryData<Board>(key, (old) => old && { ...old, tasks: update(old.tasks) });

  const mutation = useMutation({
    mutationKey: moveKey(projectKey),
    mutationFn: (m: Move) => moveTask(projectKey, m.task.number, { status: m.status, afterId: m.afterId, beforeId: m.beforeId }),
    onMutate: async (m) => {
      await qc.cancelQueries({ queryKey: key, exact: true });
      setBoard((tasks) => applyMove(tasks, m));
    },
    onSuccess: ({ task }, m) => {
      setBoard((tasks) => replaceTask(tasks, task));
      if (task.status !== m.task.status) toast(`Moved ${task.key} to ${TASK_STATUS_LABELS[task.status]}`);
    },
    onError: (err, m) => {
      setBoard((tasks) => replaceTask(tasks, m.task));
      setReverted(m.task.id);
      toast(`Couldn't move ${m.task.key} to ${TASK_STATUS_LABELS[m.status]} (${errorMessage(err)}). It went back to ${TASK_STATUS_LABELS[m.task.status]}.`, 'error');
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
    },
    onSettled: () => {
      // Refetch once the last move has finished, so a refetch never overwrites a move still in flight.
      if (qc.isMutating({ mutationKey: moveKey(projectKey) }) > 1) return;
      void qc.invalidateQueries({ queryKey: taskKeys.list(projectKey) });
      void qc.invalidateQueries({ queryKey: sprintKeys.list(projectKey) });
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });

  const move = (m: Move) => {
    setSaving((s) => new Set(s).add(m.task.id));
    setReverted(null);
    mutation.mutate(m, {
      onSettled: () => setSaving((s) => {
        const next = new Set(s);
        next.delete(m.task.id);
        return next;
      }),
    });
  };

  return { move, saving, reverted, clearReverted: () => setReverted(null) };
}
