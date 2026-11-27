import { useState, type PointerEvent, type ReactNode } from 'react';
import { m, useMotionTemplate, useMotionValue } from 'motion/react';

type Ripple = { id: number; x: number; y: number; size: number };

/**
 * The sign-in submit button: a slowly moving gradient, a soft glow that follows the pointer, a shine on hover and
 * a ripple from wherever it is pressed. Keyboard users get the same button (Enter submits; no ripple needed).
 */
export function MagicSubmit({ pending, children }: { pending: boolean; children: ReactNode }) {
  const [ripples, setRipples] = useState<readonly Ripple[]>([]);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glow = useMotionTemplate`radial-gradient(140px circle at ${gx}% ${gy}%, rgba(255,255,255,.32), transparent 70%)`;

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    gx.set(((e.clientX - r.left) / r.width) * 100);
    gy.set(((e.clientY - r.top) / r.height) * 100);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    setRipples((rs) => [...rs, { id: (rs.at(-1)?.id ?? 0) + 1, x, y, size }]);
  };

  const remove = (id: number) => setRipples((rs) => rs.filter((r) => r.id !== id));

  return (
    <m.button
      className="signin-submit"
      disabled={pending}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
    >
      <m.span className="signin-submit-glow" aria-hidden="true" style={{ background: glow }} />
      <span className="signin-submit-shine" aria-hidden="true" />
      {ripples.map((r) => (
        <m.span
          key={r.id}
          className="signin-ripple"
          aria-hidden="true"
          style={{ left: r.x - r.size / 2, top: r.y - r.size / 2, width: r.size, height: r.size }}
          initial={{ scale: 0, opacity: 0.45 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
          onAnimationComplete={() => remove(r.id)}
        />
      ))}
      <span className="signin-submit-label">{children}</span>
    </m.button>
  );
}
