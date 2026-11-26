import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Sprint } from '@taskflow/core';
import { ConfirmDialog } from '../../app/ConfirmDialog';
import { errorMessage } from '../../app/feedback';
import { toast } from '../../app/toast';
import { plural } from '../../lib/dates';
import { ApiError } from '../../lib/http';
import { reloadSessionUser } from '../auth/session';
import { projectKeys } from '../projects/projects-api';
import { taskKeys } from '../tasks/tasks-api';
import { completeSprint, sprintKeys } from './sprints-api';

/** Completes a sprint (Sprints page and board). `destination` is the name shown in the toast. */
export function useCompleteSprint(projectKey: string, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sprint, moveTo }: { sprint: Sprint; moveTo: string; destination: string }) =>
      completeSprint(projectKey, sprint.id, { moveUnfinishedTo: moveTo }),
    onError: (err) => {
      toast(errorMessage(err), 'error');
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
    },
    onSuccess: ({ sprint, movedTasks }, { destination }) => {
      toast(`${sprint.name} completed${movedTasks ? ` · ${plural(movedTasks, 'unfinished task')} moved to ${destination}` : ''}`);
      onDone();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: sprintKeys.list(projectKey) });
      void qc.invalidateQueries({ queryKey: taskKeys.list(projectKey) }); // also refreshes the board
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

/** Where `moveTo` (a sprint id or "backlog") is, in words. */
export const destinationName = (moveTo: string, planned: Sprint[]) =>
  moveTo === 'backlog' ? 'the backlog' : (planned.find((s) => s.id === moveTo)?.name ?? 'the next sprint');

/** Asks where unfinished tasks should go: the next planned sprint (default) or the backlog. */
export function CompleteSprintDialog({ sprint, unfinished, planned, pending, onConfirm, onClose }: {
  sprint: Sprint; unfinished: number; planned: Sprint[]; pending: boolean; onConfirm: (moveTo: string) => void; onClose: () => void;
}) {
  const selectId = useId();
  const [moveTo, setMoveTo] = useState(planned[0]?.id ?? 'backlog');
  return (
    <ConfirmDialog title={`Complete ${sprint.name}?`} confirmLabel="Complete sprint" pendingLabel="Completing…" pending={pending}
      onConfirm={() => onConfirm(moveTo)} onClose={onClose}>
      <p>The sprint becomes read-only and another sprint can be started.</p>
      {unfinished > 0 ? (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor={selectId}>Move the {plural(unfinished, 'unfinished task')} to</label>
          <select id={selectId} className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {planned.map((s) => <option key={s.id} value={s.id}>{s.name} (planned)</option>)}
            <option value="backlog">Backlog</option>
          </select>
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 8 }}>All its tasks are done. 🎉</p>
      )}
    </ConfirmDialog>
  );
}
