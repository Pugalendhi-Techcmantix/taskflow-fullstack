import { useId, type ReactNode } from 'react';

/** Reads a text value from FormData (never trusts it is a string). */
export const formText = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

type FieldProps = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete: string;
  defaultValue?: string;
  error: string | undefined;
  hint?: string;
  autoFocus?: boolean;
};

/** Labelled input with an inline error that screen readers announce with the field. */
export function Field({ name, label, type = 'text', autoComplete, defaultValue, error, hint, autoFocus }: FieldProps) {
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
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

/** Labelled <select> with the same error handling as Field. */
export function SelectField({ name, label, defaultValue, error, children }: { name: string; label: string; defaultValue?: string; error: string | undefined; children: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" name={name} defaultValue={defaultValue} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}>
        {children}
      </select>
      <FieldMessage id={id} error={error} hint={undefined} />
    </div>
  );
}

function FieldMessage({ id, error, hint }: { id: string; error: string | undefined; hint: string | undefined }) {
  if (error) return <div className="err" id={`${id}-err`}>{error}</div>;
  if (hint) return <div className="field-hint" id={`${id}-hint`}>{hint}</div>;
  return null;
}
