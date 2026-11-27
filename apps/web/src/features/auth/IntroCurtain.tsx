import { m } from 'motion/react';

const INTRO_KEY = 'tf-signin-intro';
const WORD = 'TaskFlow'.split('');

/** Play the opening once per browser tab, never with reduced motion. Only reads, so it is safe as a state initialiser. */
export function shouldPlayIntro(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return sessionStorage.getItem(INTRO_KEY) === null;
  } catch {
    return false;
  }
}

function rememberIntro() {
  try {
    sessionStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Storage blocked (private mode): the intro may play again next time, which is harmless.
  }
}

/**
 * The opening of the sign-in page (about one second): the logo springs in with light rings, the name types in,
 * a line fills, then the curtain lifts to reveal the page. Clicking anywhere skips it.
 * The parent removes it inside <AnimatePresence> so the lift (the exit) can play.
 */
export function IntroCurtain({ onDone }: { onDone: () => void }) {
  const finish = () => {
    rememberIntro();
    onDone();
  };

  return (
    <m.div
      className="intro"
      aria-hidden="true"
      onClick={finish}
      exit={{ y: '-100%', transition: { duration: 0.75, ease: [0.76, 0, 0.24, 1] } }}
    >
      <div className="stage-aurora"><span /><span /><span /></div>
      <div className="intro-center">
        <div className="intro-mark">
          <span className="intro-ring" />
          <span className="intro-ring" />
          <m.div
            className="logo intro-logo"
            initial={{ scale: 0.3, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          >
            TF
          </m.div>
        </div>
        <m.div
          className="intro-word"
          initial="hidden"
          animate="shown"
          variants={{ shown: { transition: { staggerChildren: 0.045, delayChildren: 0.25 } } }}
        >
          {WORD.map((ch, i) => (
            <m.span key={i} variants={{ hidden: { opacity: 0, y: 12, filter: 'blur(6px)' }, shown: { opacity: 1, y: 0, filter: 'blur(0px)' } }}>
              {ch}
            </m.span>
          ))}
        </m.div>
        <div className="intro-bar">
          <m.i
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.2, duration: 0.85, ease: [0.65, 0, 0.35, 1] }}
            onAnimationComplete={finish}
          />
        </div>
      </div>
    </m.div>
  );
}
