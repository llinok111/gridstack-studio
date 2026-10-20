/**
 * studio/morph.ts
 * FLIP-style morph transitions for programmatic layout changes.
 *
 * NEW IN THIS FORK. Upstream ships exactly one animation path: a CSS class that transitions
 * `left/top/width/height` whenever `opts.animate` is on. That is fine for drags, but it has
 * three gaps this module closes:
 *
 *  1. **No reduced-motion support.** Upstream never checks `prefers-reduced-motion`, so users
 *     who ask the OS for less motion still get sliding dashboards. Here the preference is
 *     honoured, and can be overridden explicitly.
 *  2. **Transitions are unobservable.** There is no way to await the end of a reflow, so callers
 *     cannot sequence "undo -> then screenshot" or "apply plan -> then focus". This module
 *     returns a promise that settles when the last item lands.
 *  3. **No direction-aware easing.** A single speed for every move. Here items that travel
 *     further take proportionally longer, capped, which reads as one coordinated gesture
 *     instead of everything snapping at once.
 *
 * Implementation is FLIP (First, Last, Invert, Play) on the *actual* pixel rects, so it works
 * regardless of the grid's CSS units and does not depend on `opts.animate`.
 */
export interface MorphOptions {
  duration?: number;
  /** honour prefers-reduced-motion (default true) */
  respectReducedMotion?: boolean;
  /** override: force motion on/off, ignoring the media query */
  force?: boolean;
  easing?: string;
}

/** True when the OS/browser asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Animate every element from its current rect to the rect it has after `mutate()` runs.
 *
 * The elements must already be in the DOM. Layout is read once before and once after the
 * mutation; the mutation itself is expected to be synchronous.
 *
 * @param els    elements to animate
 * @param mutate synchronous function that performs the layout change
 * @param opts   duration / easing / reduced-motion handling
 * @returns resolves once every element finished (or immediately when motion is suppressed)
 */
export function morph(els: HTMLElement[], mutate: () => void, opts: MorphOptions = {}): Promise<void> {
  const reduce = opts.respectReducedMotion !== false;
  const motionOff = opts.force === false || (reduce && prefersReducedMotion());

  // FIRST: record where everything is right now
  const first = els.map(el => el.getBoundingClientRect());

  mutate();

  if (motionOff || typeof requestAnimationFrame !== 'function') return Promise.resolve();

  // LAST + INVERT: compute the delta and apply it as an instant transform
  const baseDuration = Math.max(0, opts.duration ?? 260);
  const easing = opts.easing ?? 'cubic-bezier(.22,.61,.36,1)';

  const jobs: { el: HTMLElement; dx: number; dy: number; sx: number; sy: number; duration: number }[] = [];
  els.forEach((el, i) => {
    const a = first[i];
    const b = el.getBoundingClientRect();
    if (!a || !b || (!a.width && !b.width)) return;
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    const sx = b.width ? a.width / b.width : 1;
    const sy = b.height ? a.height / b.height : 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) return;
    // distance-proportional duration, capped so a far item never drags the whole gesture out.
    // The cap is deliberately tight (1.15x the base, not 1.6x): a reflow is a single coordinated
    // gesture, and letting the furthest tile run to ~400ms made a 60-tile align feel sluggish.
    const travel = Math.hypot(dx, dy) + Math.abs(1 - sx) * 120 + Math.abs(1 - sy) * 120;
    const duration = Math.min(baseDuration * 1.15, baseDuration * (0.55 + travel / 620));
    jobs.push({ el, dx, dy, sx, sy, duration });
  });

  if (!jobs.length) return Promise.resolve();

  // Put them back where they came from, with transitions disabled.
  jobs.forEach(j => {
    j.el.style.transition = 'none';
    j.el.style.transformOrigin = 'top left';
    j.el.style.transform = `translate(${j.dx}px, ${j.dy}px) scale(${j.sx}, ${j.sy})`;
  });

  // Force a style flush so the inverted transform is committed before we play.
  void document.body.offsetHeight;

  return new Promise<void>(resolve => {
    let remaining = jobs.length;
    const timers: number[] = [];
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      timers.forEach(t => clearTimeout(t));
      jobs.forEach(j => {
        j.el.style.transition = '';
        j.el.style.transform = '';
        j.el.style.transformOrigin = '';
      });
      resolve();
    };

    // A single deadline for the whole gesture. Per-element timers were the bug: elements whose
    // transition never fired `transitionend` (a zero-distance move, a backgrounded tab, an
    // element detached by the caller) each sat out their own full timeout, so the promise
    // resolved hundreds of ms late even though nothing was animating.
    const deadline = Math.max(...jobs.map(j => j.duration)) + 90;
    timers.push(window.setTimeout(finish, deadline));

    const settleOne = () => { if (--remaining <= 0) finish(); };

    jobs.forEach(j => {
      const handler = (e: Event) => {
        if (e.target !== j.el) return; // ignore transitions bubbling from children
        j.el.removeEventListener('transitionend', handler);
        settleOne();
      };
      j.el.addEventListener('transitionend', handler);
      // rAF so the browser has painted the inverted state first
      requestAnimationFrame(() => {
        j.el.style.transition = `transform ${j.duration}ms ${easing}`;
        j.el.style.transform = '';
      });
    });
  });
}
