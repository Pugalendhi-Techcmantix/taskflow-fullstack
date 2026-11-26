import { useActionState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { acceptInviteInput, fieldErrors } from '@taskflow/core';
import { SkeletonRows } from '../../app/feedback';
import { Field, formText } from '../../app/forms';
import { ApiError } from '../../lib/http';
import { signOut, startSession, useSession } from '../auth/session';
import { acceptInvite, fetchInvitePreview, teamKeys } from './team-api';

type FormState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fields: Record<string, string>; name: string };

/** Public page opened from the invite email: shows who invited you, then creates your account. */
export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: teamKeys.invite(token),
    queryFn: ({ signal }) => fetchInvitePreview(token, signal),
    retry: false,
  });

  const [state, formAction, isPending] = useActionState<FormState, FormData>(async (_prev, form) => {
    const name = formText(form.get('name'));
    const parsed = acceptInviteInput.safeParse({ name, password: formText(form.get('password')) });
    const fields = parsed.success ? {} : fieldErrors(parsed.error);
    if (formText(form.get('password')) !== formText(form.get('confirm'))) fields.confirm = 'Passwords do not match';
    if (!parsed.success || fields.confirm) return { status: 'error', message: 'Please fix the highlighted fields', fields, name };
    try {
      startSession(await acceptInvite(token, parsed.data));
      void navigate('/', { replace: true });
      return { status: 'idle' };
    } catch (err) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        fields: err instanceof ApiError ? err.fields : {},
        name,
      };
    }
  }, { status: 'idle' });

  const errors = state.status === 'error' ? state.fields : {};
  const formMessage = state.status === 'error' && Object.keys(state.fields).length === 0 ? state.message : null;

  return (
    <div className="center-screen">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 22 }}><div className="logo" aria-hidden="true">TF</div>TaskFlow</div>

        {preview.status === 'pending' && <SkeletonRows rows={5} label="Checking your invite" />}

        {preview.status === 'error' && (
          <div className="card error-state" role="alert">
            <h1>Invite not valid</h1>
            <p className="muted">{preview.error instanceof ApiError && preview.error.status === 404 ? preview.error.message : 'We couldn’t check this invite. Please try again.'}</p>
            <p className="muted small">Ask your TaskFlow admin to send a new invite.</p>
            <Link className="btn" to="/login">Go to sign in</Link>
          </div>
        )}

        {preview.status === 'success' && session.status === 'authenticated' && (
          <div className="card error-state">
            <h1>You're already signed in</h1>
            <p className="muted">
              You're signed in as <b>{session.user.email}</b>. This invite is for <b>{preview.data.email}</b>. Sign out first to accept it.
            </p>
            <button className="btn primary" onClick={() => void signOut()}>Sign out</button>
          </div>
        )}

        {preview.status === 'success' && session.status !== 'authenticated' && (
          <>
            <h1 className="invite-title">Join TaskFlow</h1>
            <p className="muted" style={{ marginBottom: 18 }}>
              <b>{preview.data.invitedByName}</b> invited <b>{preview.data.email}</b> to join as <b>{preview.data.role.name}</b>.
            </p>
            {formMessage && <div className="form-alert" role="alert">{formMessage}</div>}
            <form action={formAction} noValidate>
              <Field name="name" label="Full name" autoComplete="name" defaultValue={state.status === 'error' ? state.name : ''} error={errors.name} autoFocus />
              <div className="row">
                <Field name="password" label="Password" type="password" autoComplete="new-password" error={errors.password} hint="At least 8 characters" />
                <Field name="confirm" label="Confirm" type="password" autoComplete="new-password" error={errors.confirm} />
              </div>
              <button className="btn primary block" disabled={isPending}>{isPending ? 'Creating your account…' : 'Accept invite'}</button>
            </form>
            <p className="hint">Already have an account? <Link to="/login">Sign in</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
