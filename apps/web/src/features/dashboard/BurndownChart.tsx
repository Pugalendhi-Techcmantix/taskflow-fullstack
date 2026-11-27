import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Burndown } from '@taskflow/core';
import { formatDay } from '../../lib/dates';

/* Chart geometry, in viewBox units (the SVG scales to the card width). */
const W = 600;
const H = 230;
const PAD = { left: 36, right: 14, top: 14, bottom: 28 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Sprint burndown (prototype): remaining work per day, the ideal straight line, and a "today" marker.
 * Hover or focus + ←/→ moves a crosshair that snaps to a day; the tooltip lists both lines.
 * Every value is also in the table view below, so nothing is reachable only by hovering.
 */
export function BurndownChart({ data, label }: { data: Burndown; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const { days, total, unit, todayIndex } = data;
  const last = Math.max(1, days.length - 1);
  const unitWord = unit === 'points' ? 'pts' : 'tasks';

  const x = (i: number) => PAD.left + (PLOT_W * i) / last;
  const y = (v: number) => PAD.top + PLOT_H * (1 - (total === 0 ? 0 : v / total));
  const ideal = (i: number) => round1(total * (1 - i / last));

  const actual = days.flatMap((d, i) => (d.remaining === null ? [] : [{ i, v: d.remaining }]));
  const ticks = [...new Set([0, Math.round(total / 2), total])];
  const labelEvery = Math.ceil(days.length / 6);

  /** Nearest day under the pointer (the crosshair finds the X; nobody has to hit a 2px line). */
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    setActive(Math.min(days.length - 1, Math.max(0, Math.round(((vx - PAD.left) / PLOT_W) * last))));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : days.length - 1);
    } else if (step) {
      e.preventDefault();
      setActive((a) => Math.min(days.length - 1, Math.max(0, (a ?? todayIndex ?? 0) + step)));
    }
  };

  const point = active !== null ? days[active] : undefined;
  const summary = `${label}: ${data.remaining} of ${total} ${unit === 'points' ? 'story points' : 'tasks'} left`;

  return (
    <div className="burndown">
      <div
        className="burndown-plot"
        tabIndex={0}
        role="group"
        aria-label={`${summary}. Use the left and right arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? todayIndex ?? 0)}
        onBlur={() => setActive(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary}
          onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)}>
          {/* recessive grid: solid hairlines */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="bd-grid" />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="bd-tick">{v}</text>
            </g>
          ))}
          {/* every few days, plus the last day; a regular label too close to the last one is skipped */}
          {days.map((d, i) => ((i % labelEvery === 0 && days.length - 1 - i >= labelEvery / 2) || i === days.length - 1) && (
            <text key={d.date} x={x(i)} y={H - 8} className="bd-tick"
              textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}>{formatDay(d.date, false)}</text>
          ))}
          {/* ideal: a dashed reference line, not a data series */}
          <line x1={x(0)} y1={y(total)} x2={x(last)} y2={y(0)} className="bd-ideal" />
          {todayIndex !== null && (
            <g>
              <line x1={x(todayIndex)} x2={x(todayIndex)} y1={PAD.top} y2={PAD.top + PLOT_H} className="bd-today" />
              <text x={x(todayIndex) + 4} y={PAD.top + 10} className="bd-today-label">Today</text>
            </g>
          )}
          {actual.length > 0 && (
            <polyline points={actual.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} className="bd-line" />
          )}
          {actual.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={4} className={`bd-dot ${p.i === active ? 'on' : ''}`} />)}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + PLOT_H} className="bd-cross" />}
        </svg>
        {point && active !== null && (
          // Beside the crosshair, never on top of the point being read; flips left near the right edge.
          <div className={`chart-tip ${x(active) > W * 0.6 ? 'left' : ''}`} role="status" style={{ left: `${(x(active) / W) * 100}%` }}>
            <div className="tip-date">{formatDay(point.date, false)}{active === todayIndex ? ' · today' : ''}</div>
            <div><i className="key-line accent" /> <b>{point.remaining ?? '—'}</b> {point.remaining === null ? 'not yet' : `${unitWord} left`}</div>
            <div><i className="key-line ideal" /> <b>{ideal(active)}</b> ideal</div>
          </div>
        )}
      </div>

      <div className="chart-legend">
        <span><i className="key-line accent" />Remaining {unit === 'points' ? 'points' : 'tasks'} ({data.remaining} of {total})</span>
        <span><i className="key-line ideal" />Ideal</span>
        {todayIndex !== null && <span><i className="key-line today" />Today</span>}
      </div>

      <details className="chart-table">
        <summary>Show as table</summary>
        <table className="grid compact">
          <caption className="visually-hidden">{summary}, per day</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Remaining</th><th scope="col">Ideal</th></tr></thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d.date}>
                <th scope="row">{formatDay(d.date, false)}{i === todayIndex ? ' (today)' : ''}</th>
                <td>{d.remaining ?? '—'}</td>
                <td>{ideal(i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
