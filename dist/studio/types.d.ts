/**
 * studio/types.ts
 * Shared types for the GridStack Studio layer.
 *
 * New in this fork (not present upstream) — see NOTICE.md.
 */
/** A plain rectangle in grid units (not pixels). */
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** A node as seen by the layout solver. */
export interface PlanItem extends Box {
    /** stable user id (required by the solver so moves can be addressed) */
    id: string;
    /** locked items never move and act as obstacles */
    locked?: boolean;
}
/** A single item relocation produced by the solver. */
export interface LayoutMove {
    id: string;
    from: Box;
    to: Box;
}
/** Aggregate quality figures for a layout, used to show before/after in the UI. */
export interface LayoutMetrics {
    /** total rows used (max y + h) */
    rows: number;
    /** number of empty cells inside the bounding box */
    holes: number;
    /** filled cells / (column * rows), 0..1 */
    occupancy: number;
    /** number of full-height empty columns (structural seams) */
    seams: number;
}
export type LayoutStrategy = 
/** gravity + left-pull each item individually (may scramble visual grouping) */
'compact'
/** shelf reflow in reading order (row, then column): as tight as compact, order preserved */
 | 'seam'
/** area-descending skyline packing: tightest possible height */
 | 'pack';
/** A non-destructive plan. Nothing is mutated until it is applied. */
export interface LayoutPlan {
    strategy: LayoutStrategy;
    column: number;
    moves: LayoutMove[];
    before: LayoutMetrics;
    after: LayoutMetrics;
}
/** Options for {@link GridStackStudio}. */
export interface StudioOptions {
    /** max undo depth (default 60) */
    historyLimit?: number;
    /** consecutive same-kind edits within this window merge into one undo step (default 400ms) */
    coalesceMs?: number;
    /** enable keyboard + ARIA support (default true) */
    keyboard?: boolean;
    /** enable morph transitions on undo/redo/plan-apply (default true) */
    morph?: boolean;
    /** morph duration in ms (default 260) */
    morphDuration?: number;
    /** called after any layout change, with a human readable reason */
    onAnnounce?: (message: string) => void;
}
