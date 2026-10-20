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
export declare function prefersReducedMotion(): boolean;
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
export declare function morph(els: HTMLElement[], mutate: () => void, opts?: MorphOptions): Promise<void>;
