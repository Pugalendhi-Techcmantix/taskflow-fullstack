import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  /** The value stored in the URL. */
  value: string;
  /** Called on every keystroke; writes the new text to the URL. */
  onValueChange: (value: string) => void;
};

/**
 * A text box whose value lives in the URL (search filters). The URL updates asynchronously, so reading
 * it back on every keystroke would drop characters when typing fast. Instead the box keeps its own text
 * while the user types, and takes the URL value only when it changes from outside (Clear filters, a link).
 */
export function UrlTextInput({ value, onValueChange, ...inputProps }: Props) {
  const [state, setState] = useState({ text: value, sent: value, waiting: false });
  // Adjust during render (no effect): wait until the URL has caught up with what we sent;
  // after that, any other URL value is an outside change and replaces the text.
  let next = state;
  if (state.waiting && value === state.sent) next = { ...state, waiting: false };
  else if (!state.waiting && value !== state.sent) next = { text: value, sent: value, waiting: false };
  if (next !== state) setState(next);

  return (
    <input
      {...inputProps}
      value={next.text}
      onChange={(e) => {
        const text = e.target.value;
        setState({ text, sent: text, waiting: true });
        onValueChange(text);
      }}
    />
  );
}
