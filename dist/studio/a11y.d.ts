/**
 * studio/a11y.ts
 * Keyboard interaction + ARIA semantics for GridStack items.
 *
 * NEW IN THIS FORK. Upstream's own TODO.md, section 4, says:
 *
 *   "Grid items are plain <div> elements with no ARIA roles or keyboard interaction, making
 *    the library unusable for accessibility-sensitive dashboards."
 *
 * and proposes exactly this feature. It is not implemented upstream (`grep -rn "aria-" src/`
 * returns nothing). This module is that implementation, with two deliberate differences from
 * the sketch in TODO.md:
 *
 *  - TODO.md suggests `role="gridcell"`. A dashboard where every tile is a free-form 2D box is
 *    not a data grid: cells there are addressed by (row, column) and must fill the table. The
 *    ARIA Authoring Practices pattern that actually matches this widget model is
 *    `role="application"` + roving tabindex + `aria-roledescription`, with each tile as a
 *    `role="group"` that owns its own label. Screen readers then announce "tile, Sales chart,
 *    2 columns by 1 row, row 1 column 3" instead of pretending it is a spreadsheet.
 *  - Positions are announced in human terms (row/column, 1-based) rather than raw x/y.
 *
 * Keys:
 *   Arrow keys        move by one cell          (Shift: jump 4 cells)
 *   Ctrl/Cmd + Arrow  resize by one cell        (Shift: 2 cells)
 *   Home / End        jump to first column / last column
 *   PageUp / PageDown move to the top / bottom row
 *   Enter / Space     toggle "grab" mode (arrows then move continuously)
 *   Escape            leave grab mode / cancel
 *   Delete            remove the tile (only when `allowRemove`)
 *   r                 rotate (swap w/h) when allowed
 *
 * Every mutation goes through the caller-supplied callbacks so this module never touches
 * grid internals directly.
 */
import { GridStack } from '../gridstack';
import { GridStackNode } from '../types';
export interface A11yOptions {
    /** allow Delete/Backspace to remove the focused tile (default false: destructive) */
    allowRemove?: boolean;
    /** allow `r` to rotate (default true) */
    allowRotate?: boolean;
    /** cells skipped by Shift+Arrow (default 4) */
    jump?: number;
    /** called with a message for the live region */
    announce?: (msg: string) => void;
    /** called when the user asks to remove a tile */
    onRemove?: (node: GridStackNode) => void;
}
/** 1-based human position string used in announcements. */
declare function describe(node: GridStackNode, column: number): string;
/**
 * Wire keyboard + ARIA onto a grid. Returns a disposer.
 * Safe to call once per grid; it does not wrap or replace any upstream method.
 */
export declare function attachA11y(grid: GridStack, opts?: A11yOptions): () => void;
/** Exported for tests: the announcement text for a node. */
export declare const __describe: typeof describe;
export {};
