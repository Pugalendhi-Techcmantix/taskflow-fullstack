import { useActionState, useId } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { fieldErrors, loginInput, registerInput } from '@taskflow/core';
import { ApiError } from '../../lib/http';
import { signIn, signUp, useSession } from './session';

type Mode = 'login' | 'register';

type FormState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fields: Record<string, string>; values: { name: string; email: string } };

const text = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

/** Only same-site paths are allowed as a "return to" target (blocks open redirects like //evil.com). */
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

const MODULES = [
  'Auth & users', 'Roles & permissions', 'Projects', 'Sprints', 'Tasks & issues',
  'Kanban drag & drop', 'Real-time notifications', 'Search & filters', 'Dashboard & analytics', 'Activity history',
];

export function AuthPage({ mode }: { mode: Mode }) {
  const session = useSession();
  const location = useLocation();
  const from: unknown = location.state && typeof location.state === 'object' && 'from' in location.state ? location.state.from : undefined;
  const returnTo = safeReturnPath(from);

  const [state, formAction, isPending] = useActionState<FormState, FormData>(async (_prev, form) => {
    const values = { name: text(form.get('name')), email: text(form.get('email')) };
    const fail = (message: string, fields: Record<string, string> = {}): FormState => ({ status: 'error', message, fields, values });

    if (mode === 'register') {
      const parsed = registerInput.safeParse({ name: values.name, email: values.email, password: text(form.get('password')) });
      const fields = parsed.success ? {} : fieldErrors(parsed.error);
      if (text(form.get('password')) !== text(form.get('confirm'))) fields.confirm = 'Passwords do not match';
      if (!parsed.success || fields.confirm) return fail('Please fix the highlighted fields', fields);
      try {
        await signUp(parsed.data);
        return { status: 'idle' };
      } catch (err) {
        return err instanceof ApiError ? fail(err.message, err.fields) : fail('Something went wrong. Please try again.');
      }
    }

    const parsed = loginInput.safeParse({ email: values.email, password: text(form.get('password')) });
    if (!parsed.success) return fail('Please fix the highlighted fields', fieldErrors(parsed.error));
    try {
      await signIn(parsed.data);
      return { status: 'idle' };
    } catch (err) {
      return err instanceof ApiError ? fail(err.message, err.fields) : fail('Something went wrong. Please try again.');
    }
  }, { status: 'idle' });

  if (session.status === 'authenticated') return <Navigate to={returnTo} replace />;

  const errors = state.status === 'error' ? state.fields : {};
  const values = state.status === 'error' ? state.values : { name: '', email: '' };
  // A message that is not about one specific field is shown above the form.
  const formMessage = state.status === 'error' && Object.keys(state.fields).length === 0 ? state.message : null;

  return (
    <div className="auth">
      <main className="auth-main">
        <div className="auth-card">
          <div className="brand"><div className="logo" aria-hidden="true">TF</div>TaskFlow</div>
          <nav className="tabs" aria-label="Account">
            <Link to="/login" state={location.state} className={mode === 'login' ? 'active' : ''} aria-current={mode === 'login' ? 'page' : undefined}>Sign in</Link>
            <Link to="/register" state={location.state} className={mode === 'register' ? 'active' : ''} aria-current={mode === 'register' ? 'page' : undefined}>Create account</Link>
          </nav>
          <h1 className="visually-hidden">{mode === 'login' ? 'Sign in to TaskFlow' : 'Create a TaskFlow account'}</h1>

          {formMessage && <div className="form-alert" role="alert">{formMessage}</div>}

          <form action={formAction} noValidate key={mode}>
            {mode === 'register' && (
              <Field name="name" label="Full name" autoComplete="name" defaultValue={values.name} error={errors.name} />
            )}
            <Field name="email" label={mode === 'register' ? 'Work email' : 'Email'} type="email" autoComplete="email" defaultValue={values.email} error={errors.email} />
            {mode === 'register' ? (
              <div className="row">
                <Field name="password" label="Password" type="password" autoComplete="new-password" error={errors.password} hint="At least 8 characters" />
                <Field name="confirm" label="Confirm" type="password" autoComplete="new-password" error={errors.confirm} />
              </div>
            ) : (
              <Field name="password" label="Password" type="password" autoComplete="current-password" error={errors.password} />
            )}
            <button className="btn primary block" disabled={isPending}>
              {isPending ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <p className="hint">
            {mode === 'login' ? <>New to TaskFlow? <Link to="/register" state={location.state}>Create an account</Link></> : <>Already have an account? <Link to="/login" state={location.state}>Sign in</Link></>}
          </p>
        </div>
      </main>
      <aside className="auth-side">
        <h2>Plan sprints, move work, ship together.</h2>
        <p>Projects, sprints, a Kanban board and real-time updates for your whole team.</p>
        <ul className="mod-list">{MODULES.map((m) => <li key={m}>{m}</li>)}</ul>
      </aside>
    </div>
  );
}

type FieldProps = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete: string;
  defaultValue?: string;
  error: string | undefined;
  hint?: string;
};

function Field({ name, label, type = 'text', autoComplete, defaultValue, error, hint }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? <div className="err" id={`${id}-err`}>{error}</div> : hint ? <div className="field-hint" id={`${id}-hint`}>{hint}</div> : null}
    </div>
  );
}
