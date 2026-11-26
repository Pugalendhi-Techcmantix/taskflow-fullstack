import { useActionState, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SPRINT_WEEK_OPTIONS, createSprintInput, fieldErrors, sprintEndDate, updateSprintInput, type Sprint } from '@taskflow/core';
import { errorMessage } from '../../app/feedback';
import { formText } from '../../app/forms';
import { toast } from '../../app/toast';
import { formatRange, inclusiveDays, plural } from '../../lib/dates';
import { ApiError } from '../../lib/http';
import { reloadSessionUser } from '../auth/session';
import { createSprint, sprintKeys, updateSprint } from './sprints-api';

type Props =
  | { mode: 'create'; projectKey: string; defaults: { name: string; startDate: string }; onClose: () => void }
  | { mode: 'edit'; projectKey: string; sprint: Sprint; onClose: () => void };

type FormState = { status: 'idle' } | { status: 'error'; message: string; fields: Record<string, string>; name: string; goal: string };

/** Create a sprint, or edit one. Active sprints can't move their start date; completed ones aren't editable. */
export function SprintFormDialog(props: Props) {
  const qc = useQueryClient();
  const editing = props.mode === 'edit' ? props.sprint : null;
  const [startDate, setStartDate] = useState(editing?.startDate ?? (props.mode === 'create' ? props.defaults.startDate : ''));
  const [endDate, setEndDate] = useState(editing?.endDate ?? sprintEndDate(startDate, 2));
  const startLocked = editing?.status === 'active';
  const ids = { name: useId(), goal: useId(), start: useId(), end: useId() };

  const [state, formAction, isPending] = useActionState<FormState, FormData>(async (_prev, form) => {
    const name = formText(form.get('name'));
    const goal = formText(form.get('goal'));
    const fail = (message: string, fields: Record<string, string>): FormState => ({ status: 'error', message, fields, name, goal });
    try {
      if (props.mode === 'create') {
        const parsed = createSprintInput.safeParse({ name, goal, startDate, endDate });
        if (!parsed.success) return fail('Please fix the highlighted fields', fieldErrors(parsed.error));
        const { sprint } = await createSprint(props.projectKey, parsed.data);
        toast(`${sprint.name} created`);
      } else {
        const parsed = updateSprintInput.safeParse({ name, goal, ...(startLocked ? {} : { startDate }), endDate });
        if (!parsed.success) return fail('Please fix the highlighted fields', fieldErrors(parsed.error));
        const { sprint } = await updateSprint(props.projectKey, props.sprint.id, parsed.data);
        toast(`${sprint.name} saved`);
      }
      void qc.invalidateQueries({ queryKey: sprintKeys.list(props.projectKey) });
      props.onClose();
      return { status: 'idle' };
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
      return fail(errorMessage(err), err instanceof ApiError ? err.fields : {});
    }
  }, { status: 'idle' });

  const errors = state.status === 'error' ? state.fields : {};
  const formMessage = state.status === 'error' && Object.keys(state.fields).length === 0 ? state.message : null;
  const days = startDate && endDate && endDate >= startDate ? inclusiveDays(startDate, endDate) : null;
  const title = editing ? `Edit ${editing.name}` : 'New sprint';

  return (
    <dialog className="modal" aria-labelledby="sprint-form-h" onClose={props.onClose} ref={(el) => { if (el && !el.open) el.showModal(); }}>
      <form action={formAction} noValidate>
        <div className="modal-head">
          <h2 id="sprint-form-h">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={props.onClose}>×</button>
        </div>
        <div className="modal-body">
          {formMessage && <div className="form-alert" role="alert">{formMessage}</div>}
          <div className="field">
            <label htmlFor={ids.name}>Name</label>
            <input id={ids.name} className="input" name="name" autoFocus autoComplete="off" maxLength={60}
              defaultValue={state.status === 'error' ? state.name : (editing?.name ?? (props.mode === 'create' ? props.defaults.name : ''))}
              aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? `${ids.name}-e` : undefined} />
            {errors.name && <div className="err" id={`${ids.name}-e`}>{errors.name}</div>}
          </div>
          <div className="field">
            <label htmlFor={ids.goal}>Sprint goal <span className="muted small">(optional)</span></label>
            <textarea id={ids.goal} className="input" name="goal" rows={2} maxLength={300} placeholder="What should this sprint deliver?"
              defaultValue={state.status === 'error' ? state.goal : (editing?.goal ?? '')}
              aria-invalid={errors.goal ? true : undefined} />
            {errors.goal && <div className="err">{errors.goal}</div>}
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor={ids.start}>Start date</label>
              <input id={ids.start} className="input" type="date" value={startDate} disabled={startLocked}
                onChange={(e) => setStartDate(e.target.value)} aria-invalid={errors.startDate ? true : undefined}
                aria-describedby={startLocked ? `${ids.start}-h` : errors.startDate ? `${ids.start}-e` : undefined} />
              {startLocked && <div className="field-hint" id={`${ids.start}-h`}>Already started</div>}
              {errors.startDate && <div className="err" id={`${ids.start}-e`}>{errors.startDate}</div>}
            </div>
            <div className="field">
              <label htmlFor={ids.end}>End date</label>
              <input id={ids.end} className="input" type="date" value={endDate} min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)} aria-invalid={errors.endDate ? true : undefined}
                aria-describedby={errors.endDate ? `${ids.end}-e` : undefined} />
              {errors.endDate && <div className="err" id={`${ids.end}-e`}>{errors.endDate}</div>}
            </div>
          </div>
          <div className="duration-chips" role="group" aria-label="Set the length">
            <span className="muted small">Length:</span>
            {SPRINT_WEEK_OPTIONS.map((w) => (
              <button key={w} type="button" className={`chip ${days === w * 7 ? 'on' : ''}`} disabled={!startDate}
                onClick={() => setEndDate(sprintEndDate(startDate, w))}>{plural(w, 'week')}</button>
            ))}
          </div>
          {days !== null && <p className="muted small" aria-live="polite">{formatRange(startDate, endDate)} · {plural(days, 'day')}</p>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn primary" disabled={isPending}>{isPending ? 'Saving…' : editing ? 'Save changes' : 'Create sprint'}</button>
        </div>
      </form>
    </dialog>
  );
}
