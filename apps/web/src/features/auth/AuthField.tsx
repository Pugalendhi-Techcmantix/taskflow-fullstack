import { useId, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Icon, type IconName } from '../../app/icons';

type Props = {
  name: string;
  label: string;
  icon: IconName;
  type?: 'text' | 'email' | 'password';
  autoComplete: string;
  defaultValue?: string;
  error: string | undefined;
  hint?: string;
};

const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 } } as const;

/**
 * Sign-in field: label, leading icon, inline error announced with the input, and for passwords
 * a show/hide toggle and a Caps Lock warning.
 */
export function AuthField({ name, label, icon, type = 'text', autoComplete, defaultValue, error, hint }: Props) {
  const id = useId();
  const isPassword = type === 'password';
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'));
  const describedBy = [error ? `${id}-err` : hint ? `${id}-hint` : null, isPassword && capsLock ? `${id}-caps` : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="sf">
      <label className="sf-label" htmlFor={id}>{label}</label>
      <div className="sf-control">
        {/* A light runs around the field while it has focus (CSS only). */}
        <span className="sf-beam" aria-hidden="true" />
        <span className="sf-icon"><Icon name={icon} size={17} /></span>
        <input
          id={id}
          className="sf-input"
          name={name}
          type={isPassword && visible ? 'text' : type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          spellCheck={false}
          {...(isPassword ? { onKeyDown: onKey, onKeyUp: onKey, onBlur: () => setCapsLock(false) } : {})}
        />
        {isPassword && (
          <button
            type="button"
            className="sf-eye"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            aria-controls={id}
            onClick={() => setVisible((v) => !v)}
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} size={17} />
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {isPassword && capsLock && (
          <m.div key="caps" className="sf-caps" id={`${id}-caps`} {...reveal}>Caps Lock is on</m.div>
        )}
        {error ? (
          <m.div key="err" className="sf-err" id={`${id}-err`} {...reveal}>{error}</m.div>
        ) : hint ? (
          <div key="hint" className="sf-hint" id={`${id}-hint`}>{hint}</div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
