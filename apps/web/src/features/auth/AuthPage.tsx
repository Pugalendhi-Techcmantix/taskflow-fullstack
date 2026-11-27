import { lazy, Suspense, useActionState, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { AnimatePresence, LazyMotion, MotionConfig, m } from 'motion/react';
import { fieldErrors, loginInput, registerInput } from '@taskflow/core';
import { formText as text } from '../../app/forms';
import { Icon } from '../../app/icons';
import { toggleTheme } from '../../app/theme';
import { ApiError } from '../../lib/http';
import { AuthField } from './AuthField';
import { IntroCurtain, shouldPlayIntro } from './IntroCurtain';
import { BorderBeam, Bubbles, Sparkles, type Spark } from './MagicFx';
import { MagicSubmit } from './MagicSubmit';
import { signIn, signUp, useSession } from './session';
import './signin.css';

type Mode = 'login' | 'register';

type FormState =
  | { status: 'idle' }
  | { status: 'error'; mode: Mode; message: string; fields: Record<string, string>; values: { name: string; email: string }; attempt: number };

/** Only same-site paths are allowed as a "return to" target (blocks open redirects like //evil.com). */
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

const loadFeatures = () => import('./motion-features').then((r) => r.default);
/** The illustration is code-split: the form is usable before it arrives. */
const LiveBoardStage = lazy(() => import('./LiveBoardStage'));

const COPY = {
  login: { title: 'Welcome back', sub: 'Sign in to continue to your workspace.', submit: 'Sign in', pending: 'Signing in…' },
  register: { title: 'Create your account', sub: 'Plan sprints and ship together with your team.', submit: 'Create account', pending: 'Creating account…' },
} as const;

const swap = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16 } },
} as const;
const item = {
  initial: { opacity: 0, y: 14, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 300, damping: 26 } },
} as const;
/** Fields arrive one after another; on first load they wait for the card (and the intro, if it plays). */
const listFor = (delay: number) => ({ animate: { transition: { staggerChildren: 0.07, delayChildren: delay } } });

const TITLE_SPARKS: readonly Spark[] = [
  { x: -3, y: 8, size: 12, delay: 0.2, color: '#818cf8' },
  { x: 74, y: -14, size: 15, delay: 1.1, color: '#c084fc' },
  { x: 92, y: 40, size: 9, delay: 2.0, color: '#38bdf8' },
  { x: 40, y: 92, size: 8, delay: 2.7, color: '#a5b4fc' },
];

export function AuthPage({ mode }: { mode: Mode }) {
  const session = useSession();
  const location = useLocation();
  const from: unknown = location.state && typeof location.state === 'object' && 'from' in location.state ? location.state.from : undefined;
  const returnTo = safeReturnPath(from);
  // The opening plays once per tab; everything else waits for it on that first load only.
  const [introOnLoad] = useState(shouldPlayIntro);
  const [intro, setIntro] = useState(introOnLoad);
  const enter = introOnLoad ? 0.95 : 0;

  const [state, formAction, isPending] = useActionState<FormState, FormData>(async (prev, form) => {
    const values = { name: text(form.get('name')), email: text(form.get('email')) };
    const attempt = prev.status === 'error' ? prev.attempt + 1 : 1;
    const fail = (message: string, fields: Record<string, string> = {}): FormState => ({ status: 'error', mode, message, fields, values, attempt });

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

  // An error belongs to the tab it came from: switching tabs clears it (the typed name and email stay).
  const failed = state.status === 'error' && state.mode === mode ? state : null;
  const errors = failed ? failed.fields : {};
  const values = state.status === 'error' ? state.values : { name: '', email: '' };
  const attempt = failed ? failed.attempt : 0;
  // A message that is not about one specific field is shown above the form.
  const formMessage = failed && Object.keys(failed.fields).length === 0 ? failed.message : null;
  const copy = COPY[mode];

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        <AnimatePresence>{intro && <IntroCurtain key="intro" onDone={() => setIntro(false)} />}</AnimatePresence>
        <div className="signin">
          <main className="signin-main">
            <div className="signin-glow" aria-hidden="true" />
            <Bubbles className="fx-bubbles--form" />
            <header className="signin-top">
              <div className="brand"><div className="logo signin-logo" aria-hidden="true">TF</div>TaskFlow</div>
              <button type="button" className="icon-btn signin-theme" onClick={toggleTheme} aria-label="Switch light or dark theme" title="Switch theme">
                <span className="when-light"><Icon name="moon" size={18} /></span>
                <span className="when-dark"><Icon name="sun" size={18} /></span>
              </button>
            </header>

            <m.div
              className="signin-card"
              initial={{ opacity: 0, y: 28, scale: 0.96, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              transition={{ type: 'spring', stiffness: 150, damping: 20, delay: enter }}
            >
              <BorderBeam duration={8} />
              <AnimatePresence mode="wait" initial={false}>
                <m.div key={mode} className="signin-head" {...swap}>
                  <h1><span className="fx-shimmer-text">{copy.title}</span><Sparkles items={TITLE_SPARKS} /></h1>
                  <p>{copy.sub}</p>
                </m.div>
              </AnimatePresence>

              <nav className="signin-tabs" aria-label="Account">
                {(['login', 'register'] as const).map((tab) => (
                  <Link key={tab} to={tab === 'login' ? '/login' : '/register'} state={location.state} className={mode === tab ? 'active' : ''} aria-current={mode === tab ? 'page' : undefined}>
                    {mode === tab && <m.span layoutId="signin-tab-pill" className="signin-tab-pill" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
                    <span className="signin-tab-text">{tab === 'login' ? 'Sign in' : 'Create account'}</span>
                  </Link>
                ))}
              </nav>

              <AnimatePresence initial={false}>
                {formMessage && (
                  <m.div key="alert" className="signin-alert-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="signin-alert" role="alert">
                      <Icon name="alert" size={16} />
                      <span>{formMessage}</span>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>

              {/* A new failed attempt gives the form a short shake. */}
              <m.div
                variants={{ rest: { x: 0 }, [`shake${attempt}`]: { x: [0, -10, 9, -6, 4, -2, 0], transition: { duration: 0.45 } } }}
                animate={attempt ? `shake${attempt}` : 'rest'}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <m.form key={mode} action={formAction} noValidate {...swap}>
                    <m.div variants={listFor(intro ? enter + 0.2 : 0.05)} initial="initial" animate="animate">
                      {mode === 'register' && (
                        <m.div variants={item}>
                          <AuthField name="name" label="Full name" icon="user" autoComplete="name" defaultValue={values.name} error={errors.name} />
                        </m.div>
                      )}
                      <m.div variants={item}>
                        <AuthField name="email" label={mode === 'register' ? 'Work email' : 'Email'} icon="mail" type="email" autoComplete="email" defaultValue={values.email} error={errors.email} />
                      </m.div>
                      {mode === 'register' ? (
                        <m.div variants={item} className="signin-row">
                          <AuthField name="password" label="Password" icon="lock" type="password" autoComplete="new-password" error={errors.password} hint="At least 8 characters" />
                          <AuthField name="confirm" label="Confirm" icon="lock" type="password" autoComplete="new-password" error={errors.confirm} />
                        </m.div>
                      ) : (
                        <m.div variants={item}>
                          <AuthField name="password" label="Password" icon="lock" type="password" autoComplete="current-password" error={errors.password} />
                        </m.div>
                      )}
                      <m.div variants={item}>
                        <MagicSubmit pending={isPending}>
                          {isPending ? (
                            <><span className="signin-spinner" aria-hidden="true" />{copy.pending}</>
                          ) : (
                            <>{copy.submit}<span className="signin-arrow"><Icon name="arrowRight" size={17} /></span></>
                          )}
                        </MagicSubmit>
                      </m.div>
                    </m.div>
                  </m.form>
                </AnimatePresence>
              </m.div>

              <p className="signin-switch">
                {mode === 'login' ? <>New to TaskFlow? <Link to="/register" state={location.state}>Create an account</Link></> : <>Already have an account? <Link to="/login" state={location.state}>Sign in</Link></>}
              </p>
            </m.div>
          </main>

          <Suspense fallback={<aside className="stage" aria-hidden="true" />}>
            <LiveBoardStage delay={enter} />
          </Suspense>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
