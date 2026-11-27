import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { AnimatePresence, LayoutGroup, m, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { Icon, type IconName } from '../../app/icons';
import { BorderBeam, Bubbles, Burst, Meteors, Sparkles, type Spark } from './MagicFx';

/*
 * The sign-in page's illustration: a small Kanban board whose cards move on their own, the way a team's
 * board does in TaskFlow. Cards are abstract shapes (no invented task names or people), so this is an
 * illustration, not demo data.
 */

const COLUMNS = [
  { label: 'To Do', color: '#9ca3af' },
  { label: 'In Progress', color: '#60a5fa' },
  { label: 'In Review', color: '#a78bfa' },
  { label: 'Done', color: '#4ade80' },
] as const;
const DONE = COLUMNS.length - 1;

const TYPES = {
  story: { mark: 'S', color: '#16a34a' },
  task: { mark: 'T', color: '#2563eb' },
  bug: { mark: '!', color: '#dc2626' },
} as const;
const PEOPLE = ['linear-gradient(135deg,#f59e0b,#f97316)', 'linear-gradient(135deg,#ec4899,#a855f7)', 'linear-gradient(135deg,#06b6d4,#3b82f6)'] as const;

type Card = { id: string; type: keyof typeof TYPES; widths: readonly [number, number]; who: number; col: number; seq: number };

const START: readonly Card[] = [
  { id: 'a', type: 'story', widths: [82, 54], who: 0, col: 0, seq: 3 },
  { id: 'b', type: 'task', widths: [66, 40], who: 1, col: 0, seq: 2 },
  { id: 'g', type: 'story', widths: [74, 30], who: 2, col: 0, seq: 1 },
  { id: 'c', type: 'bug', widths: [70, 58], who: 2, col: 1, seq: 2 },
  { id: 'd', type: 'story', widths: [60, 44], who: 1, col: 1, seq: 1 },
  { id: 'e', type: 'task', widths: [86, 36], who: 0, col: 2, seq: 1 },
  { id: 'f', type: 'task', widths: [72, 50], who: 2, col: 3, seq: 1 },
];

type Board = { cards: readonly Card[]; tick: number; moved: string | null; toast: { n: number; text: string; who: number } };

/** One step of the loop: move one of the two cards closest to Done one column on; start a new sprint when Done fills up. */
function step(board: Board): Board {
  const tick = board.tick + 1;
  const done = board.cards.filter((c) => c.col === DONE).length;
  if (done >= 4) {
    return { cards: START, tick, moved: null, toast: { n: tick, text: 'Sprint complete · new sprint started', who: 1 } };
  }
  const open = board.cards.filter((c) => c.col < DONE).toSorted((a, b) => b.col - a.col || a.seq - b.seq);
  const pick = open[tick % Math.min(2, open.length)];
  if (!pick) return board;
  const col = pick.col + 1;
  const seq = Math.max(0, ...board.cards.filter((c) => c.col === col).map((c) => c.seq)) + 1;
  return {
    cards: board.cards.map((c) => (c.id === pick.id ? { ...c, col, seq } : c)),
    tick,
    moved: pick.id,
    toast: { n: tick, text: `Moved to ${COLUMNS[col]?.label ?? ''}`, who: pick.who },
  };
}

const STEP_MS = 2600;
const FEATURES: readonly { icon: IconName; text: string }[] = [
  { icon: 'board', text: 'Live Kanban board' },
  { icon: 'sprint', text: 'Sprints & burndown' },
  { icon: 'bell', text: 'Real-time notifications' },
  { icon: 'shield', text: 'Roles & permissions' },
];
const HEADLINE = 'Plan sprints, move work, ship together.'.split(' ');
/** The last words of the headline get the moving rainbow gradient. */
const MAGIC_FROM = HEADLINE.length - 2;
const HEADLINE_SPARKS: readonly Spark[] = [
  { x: 2, y: -18, size: 14, delay: 0.4, color: '#a5b4fc' },
  { x: 58, y: -6, size: 10, delay: 1.6, color: '#f0abfc' },
  { x: 96, y: 30, size: 16, delay: 0.9, color: '#67e8f9' },
  { x: 30, y: 104, size: 9, delay: 2.4, color: '#fde68a' },
  { x: 80, y: 96, size: 11, delay: 3.1, color: '#c4b5fd' },
];

/** `delay` (seconds) holds the entrance back while the sign-in intro is still playing. */
export default function LiveBoardStage({ delay }: { delay: number }) {
  const reduceMotion = useReducedMotion();
  const [board, setBoard] = useState<Board>({ cards: START, tick: 0, moved: null, toast: { n: 0, text: 'Your team, in sync', who: 2 } });
  const dragging = useRef(false);

  // The loop is driven by a timer (an external clock), paused while a card is held or the tab is hidden.
  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      if (!dragging.current && !document.hidden) setBoard(step);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  // Pointer position (0..1) drives the board's tilt and the spotlight, without re-rendering.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 120, damping: 20, mass: 0.6 };
  const rotateY = useSpring(useTransform(px, [0, 1], [-7, 7]), spring);
  const rotateX = useSpring(useTransform(py, [0, 1], [6, -6]), spring);
  const spotX = useTransform(px, (v) => `${v * 100}%`);
  const spotY = useTransform(py, (v) => `${v * 100}%`);
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${spotX} ${spotY}, rgba(165,180,252,.16), transparent 65%)`;

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const onPointerLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <aside className="stage" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div className="stage-aurora" aria-hidden="true"><span /><span /><span /></div>
      <div className="stage-grid" aria-hidden="true" />
      <m.div className="stage-spot" aria-hidden="true" style={{ background: spotlight }} />
      <Meteors />
      <Bubbles className="fx-bubbles--stage" />

      <div className="stage-inner">
        <m.h2
          className="stage-title"
          initial="hidden"
          animate="shown"
          variants={{ shown: { transition: { staggerChildren: 0.06, delayChildren: delay + 0.15 } } }}
        >
          <Sparkles items={HEADLINE_SPARKS} />
          {HEADLINE.map((word, i) => (
            <m.span
              key={i}
              className={i >= MAGIC_FROM ? 'stage-word stage-word--magic' : 'stage-word'}
              variants={{ hidden: { opacity: 0, y: 14, filter: 'blur(6px)' }, shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 260, damping: 24 } } }}
            >
              {word}{' '}
            </m.span>
          ))}
        </m.h2>
        <m.p className="stage-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.55, duration: 0.5 }}>
          Projects, sprints, a Kanban board and real-time updates for your whole team.
        </m.p>

        <m.div
          className="stage-board"
          aria-hidden="true"
          style={{ rotateX, rotateY, transformPerspective: 1100 }}
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: delay + 0.35, type: 'spring', stiffness: 120, damping: 20 }}
        >
          <BorderBeam duration={9} />
          <div className="board-head">
            <span className="board-title">Sprint board</span>
            <span className="board-live"><i />Live</span>
            <span className="board-people">{PEOPLE.map((bg, i) => <i key={i} style={{ background: bg }} />)}</span>
          </div>

          <LayoutGroup>
            <div className="board-cols">
              {COLUMNS.map((col, ci) => {
                const cards = board.cards.filter((c) => c.col === ci).toSorted((a, b) => b.seq - a.seq);
                return (
                  <div className="bcol" key={col.label}>
                    <div className="bcol-head">
                      <i style={{ background: col.color }} />
                      <span>{col.label}</span>
                      <m.b key={cards.length} initial={{ scale: 1.5, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}>{cards.length}</m.b>
                    </div>
                    <div className="bcol-cards">
                      {cards.map((c) => {
                        const landed = board.moved === c.id && c.col === DONE;
                        return (
                          <m.div
                            key={c.id}
                            layoutId={`card-${c.id}`}
                            layout
                            className={`bcard${landed ? ' landed' : board.moved === c.id ? ' moving' : ''}`}
                            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                            drag
                            dragSnapToOrigin
                            dragElastic={0.5}
                            whileHover={{ y: -2 }}
                            whileDrag={{ scale: 1.08, rotate: -4, zIndex: 5, cursor: 'grabbing' }}
                            onDragStart={() => { dragging.current = true; }}
                            onDragEnd={() => { dragging.current = false; }}
                          >
                            <div className="bcard-top">
                              <span className="bcard-type" style={{ background: TYPES[c.type].color }}>{TYPES[c.type].mark}</span>
                              <span className="bcard-line" style={{ width: `${c.widths[0] - 22}%` }} />
                            </div>
                            <span className="bcard-line" style={{ width: `${c.widths[1]}%` }} />
                            <div className="bcard-foot">
                              <span className="bcard-pts" />
                              <span className="bcard-who" style={{ background: PEOPLE[c.who] }} />
                            </div>
                            {/* A card reaching Done celebrates with a small burst. */}
                            {landed && <Burst key={board.tick} />}
                          </m.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </LayoutGroup>

          <div className="board-toast-slot">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.div
                key={board.toast.n}
                className="board-toast"
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              >
                <i className="board-toast-dot" />
                <span className="bcard-who" style={{ background: PEOPLE[board.toast.who] }} />
                <span>{board.toast.text}</span>
                <span className="board-toast-time">just now</span>
              </m.div>
            </AnimatePresence>
          </div>
        </m.div>

        <m.ul className="stage-features" initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: 0.07, delayChildren: delay + 0.7 } } }}>
          {FEATURES.map((f) => (
            <m.li key={f.text} variants={{ hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0 } }}>
              <Icon name={f.icon} size={15} />
              {f.text}
            </m.li>
          ))}
        </m.ul>
      </div>
    </aside>
  );
}
