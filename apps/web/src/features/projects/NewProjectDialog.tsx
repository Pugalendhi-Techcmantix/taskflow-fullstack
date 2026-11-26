import { useActionState, useDeferredValue, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PROJECT_COLORS, createProjectInput, fieldErrors, projectKeySchema, suggestProjectKey } from '@taskflow/core';
import { errorMessage } from '../../app/feedback';
import { formText } from '../../app/forms';
import { toast } from '../../app/toast';
import { ApiError } from '../../lib/http';
import { reloadSessionUser } from '../auth/session';
import { checkKey, createProject, projectKeys, rememberProject } from './projects-api';

type FormState = { status: 'idle' } | { status: 'error'; message: string; fields: Record<string, string>; description: string; color: string };

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Name and key are controlled so the key can be suggested from the name until the user edits it.
  const [name, setName] = useState('');
  const [typedKey, setTypedKey] = useState<string | null>(null);
  const key = typedKey ?? suggestProjectKey(name);

  const [state, formAction, isPending] = useActionState<FormState, FormData>(async (_prev, form) => {
    const values = { name, key, description: formText(form.get('description')), color: formText(form.get('color')) };
    const parsed = createProjectInput.safeParse(values);
    const fail = (message: string, fields: Record<string, string>): FormState => ({ status: 'error', message, fields, description: values.description, color: values.color });
    if (!parsed.success) return fail('Please fix the highlighted fields', fieldErrors(parsed.error));
    try {
      const { project } = await createProject(parsed.data);
      void qc.invalidateQueries({ queryKey: projectKeys.all });
      toast(`Project ${project.name} (${project.key}) created`);
      rememberProject(project.key);
      onClose();
      void navigate(`/projects/${project.key}`);
      return { status: 'idle' };
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
      return fail(errorMessage(err), err instanceof ApiError ? err.fields : {});
    }
  }, { status: 'idle' });

  const errors = state.status === 'error' ? state.fields : {};
  const formMessage = state.status === 'error' && Object.keys(state.fields).length === 0 ? state.message : null;
  const selectedColor = state.status === 'error' && state.color ? state.color : PROJECT_COLORS[0];

  return (
    <dialog className="modal" aria-labelledby="new-project-h" onClose={onClose} ref={(el) => { if (el && !el.open) el.showModal(); }}>
      <form action={formAction} noValidate>
        <div className="modal-head">
          <h2 id="new-project-h">New project</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {formMessage && <div className="form-alert" role="alert">{formMessage}</div>}
          <ControlledField label="Project name" value={name} onChange={setName} error={errors.name} placeholder="e.g. Customer Portal" autoFocus />
          <KeyField value={key} onChange={(v) => setTypedKey(v.toUpperCase())} serverError={errors.key} />
          <TextAreaField name="description" label="Description" defaultValue={state.status === 'error' ? state.description : ''} error={errors.description} />
          <ColorPicker name="color" defaultValue={selectedColor} error={errors.color} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={isPending}>{isPending ? 'Creating…' : 'Create project'}</button>
        </div>
      </form>
    </dialog>
  );
}

/* ---------- key with live availability check ---------- */

function KeyField({ value, onChange, serverError }: { value: string; onChange: (v: string) => void; serverError: string | undefined }) {
  const id = useId();
  // Deferred: typing stays instant; the check runs for the settled value. Stale requests are cancelled.
  const deferred = useDeferredValue(value);
  const valid = projectKeySchema.safeParse(deferred).success;
  const check = useQuery({
    queryKey: projectKeys.keyCheck(deferred),
    queryFn: ({ signal }) => checkKey(deferred, signal),
    enabled: valid,
    staleTime: 5_000,
  });

  let status: { kind: 'ok' | 'bad' | 'info'; text: string } | null = null;
  if (serverError) status = { kind: 'bad', text: serverError };
  else if (value && !projectKeySchema.safeParse(value).success) status = { kind: 'bad', text: 'Use 2–5 letters (A–Z)' };
  else if (valid && check.data && check.data.key === deferred) {
    status = check.data.available ? { kind: 'ok', text: `${deferred} is available` } : { kind: 'bad', text: `${deferred} is already used by another project` };
  } else if (valid) status = { kind: 'info', text: 'Checking…' };

  return (
    <div className="field">
      <label htmlFor={id}>Key <span className="muted small">(used in task IDs like {value || 'TF'}-101 · can't be changed later)</span></label>
      <input
        id={id}
        className="input key-input"
        name="key"
        value={value}
        maxLength={5}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z]/g, ''))}
        aria-invalid={status?.kind === 'bad' ? true : undefined}
        aria-describedby={status ? `${id}-st` : undefined}
      />
      {status && <div id={`${id}-st`} className={status.kind === 'bad' ? 'err' : status.kind === 'ok' ? 'ok-msg' : 'field-hint'} aria-live="polite">{status.text}</div>}
    </div>
  );
}

/* ---------- small field helpers used by the project forms ---------- */

export function ControlledField({ label, value, onChange, error, placeholder, autoFocus }: { label: string; value: string; onChange: (v: string) => void; error: string | undefined; placeholder?: string; autoFocus?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" name="name" value={value} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off"
        onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} />
      {error && <div className="err" id={`${id}-err`}>{error}</div>}
    </div>
  );
}

export function TextAreaField({ name, label, defaultValue, error }: { name: string; label: string; defaultValue: string; error: string | undefined }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="input" name={name} rows={3} defaultValue={defaultValue} maxLength={500}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} />
      {error && <div className="err" id={`${id}-err`}>{error}</div>}
    </div>
  );
}

/** Radio buttons styled as colour swatches: keyboard arrows move between them. */
export function ColorPicker({ name, defaultValue, error }: { name: string; defaultValue: string; error: string | undefined }) {
  return (
    <fieldset className="field swatches">
      <legend>Colour</legend>
      <div className="swatch-row">
        {PROJECT_COLORS.map((c) => (
          <label key={c} className="swatch" style={{ background: c }}>
            <input type="radio" name={name} value={c} defaultChecked={c === defaultValue} aria-label={`Colour ${c}`} />
          </label>
        ))}
      </div>
      {error && <div className="err">{error}</div>}
    </fieldset>
  );
}
