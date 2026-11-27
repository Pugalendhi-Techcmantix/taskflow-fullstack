import { m } from 'motion/react';

/*
 * Decorative effects for the sign-in page: rising bubbles, twinkling sparkles, shooting stars, a light beam that
 * runs around a border, and a small burst. Every effect is aria-hidden, uses fixed positions (no randomness, so
 * each render is identical) and is switched off by `prefers-reduced-motion` (see signin.css).
 */

type Bubble = { x: number; size: number; dur: number; delay: number };

// Negative delays start each bubble part-way up, so the screen is never empty on first paint.
const BUBBLES: readonly Bubble[] = [
  { x: 4, size: 22, dur: 17, delay: -3 },
  { x: 12, size: 10, dur: 13, delay: -9 },
  { x: 21, size: 34, dur: 22, delay: -14 },
  { x: 30, size: 14, dur: 15, delay: -1 },
  { x: 39, size: 8, dur: 12, delay: -6 },
  { x: 47, size: 26, dur: 19, delay: -11 },
  { x: 56, size: 12, dur: 14, delay: -4 },
  { x: 64, size: 40, dur: 24, delay: -18 },
  { x: 72, size: 9, dur: 11, delay: -8 },
  { x: 80, size: 20, dur: 18, delay: -2 },
  { x: 88, size: 13, dur: 15, delay: -12 },
  { x: 95, size: 28, dur: 21, delay: -7 },
];

export function Bubbles({ className }: { className: string }) {
  return (
    <div className={`fx-bubbles ${className}`} aria-hidden="true">
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          style={{ left: `${b.x}%`, width: b.size, height: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}
        />
      ))}
    </div>
  );
}

export type Spark = { x: number; y: number; size: number; delay: number; color: string };

const STAR = 'M12 0C12.7 6.4 17.6 11.3 24 12 17.6 12.7 12.7 17.6 12 24 11.3 17.6 6.4 12.7 0 12 6.4 11.3 11.3 6.4 12 0Z';

/** Four-point stars that twinkle around their parent (which must be positioned). */
export function Sparkles({ items }: { items: readonly Spark[] }) {
  return (
    <span className="fx-sparkles" aria-hidden="true">
      {items.map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={s.size}
          height={s.size}
          style={{ left: `${s.x}%`, top: `${s.y}%`, color: s.color, animationDelay: `${s.delay}s` }}
        >
          <path d={STAR} fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

const METEORS: readonly { x: number; delay: number; dur: number }[] = [
  { x: 12, delay: 1.2, dur: 9 },
  { x: 38, delay: 4.6, dur: 11 },
  { x: 61, delay: 7.4, dur: 10 },
  { x: 84, delay: 2.8, dur: 13 },
];

/** Shooting stars crossing the dark illustration side now and then. */
export function Meteors() {
  return (
    <div className="fx-meteors" aria-hidden="true">
      {METEORS.map((mt, i) => (
        <span key={i} style={{ left: `${mt.x}%`, animationDelay: `${mt.delay}s`, animationDuration: `${mt.dur}s` }} />
      ))}
    </div>
  );
}

/** A light that travels around the border of its parent (which must be positioned and rounded). */
export function BorderBeam({ duration }: { duration: number }) {
  return <span className="fx-beam" aria-hidden="true" style={{ animationDuration: `${duration}s` }} />;
}

const RAYS = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
const BURST_COLORS = ['#4ade80', '#a5b4fc', '#f0abfc', '#fde68a'] as const;

/** A one-off burst of particles from the centre of its parent. Re-key it to play again. */
export function Burst() {
  return (
    <span className="fx-burst" aria-hidden="true">
      {RAYS.map((angle, i) => {
        const reach = i % 2 ? 1 : 0.72;
        return (
          <m.i
            key={i}
            style={{ background: BURST_COLORS[i % BURST_COLORS.length] }}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
            // Particles fly out fast, stay bright most of the way, then shrink and fade at the end.
            animate={{ x: Math.cos(angle) * 64 * reach, y: Math.sin(angle) * 46 * reach, scale: [0.4, 1.3, 1, 0], opacity: [1, 1, 1, 0] }}
            transition={{
              duration: 1.1,
              ease: [0.16, 1, 0.3, 1],
              scale: { duration: 1.1, times: [0, 0.2, 0.7, 1] },
              opacity: { duration: 1.1, times: [0, 0.2, 0.7, 1] },
            }}
          />
        );
      })}
    </span>
  );
}
