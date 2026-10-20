/**
 * studio/studio.ts
 * The public entry point: one object that adds history, layout planning, morphing and
 * keyboard/ARIA to an existing GridStack instance without patching it.
 *
 * NEW IN THIS FORK.
 *
 * Design constraint: **do not fork GridStack's engine.** Everything here is layered on the
 * public API (`save`/`load`/`update`/`on`/`getGridItems`) so that upstream merges stay cheap
 * and upstream tests keep passing untouched. The one place a private member is read is
 * `grid.engine.nodes`, which is public in practice and used by upstream's own demos.
 */
import { GridStack } from '../gridstack';
import { History, Snapshot } from './history';
import { LayoutPlan, LayoutStrategy, StudioOptions } from './types';
export declare class GridStackStudio {
    readonly grid: GridStack;
    readonly history: History;
    private _opts;
    private _disposers;
    /** true while applying a snapshot, so change events do not re-record */
    private _applying;
    private _live?;
    constructor(grid: GridStack, opts?: StudioOptions);
    /** Current layout as a snapshot (sorted, ids guaranteed). */
    snapshot(reason?: string, kind?: string): Snapshot;
    /** Stable id for a node; assigns one if the widget had none. */
    private _idOf;
    private _seed;
    /**
     * Record the layout after an upstream event.
     * The *kind* decides coalescing: repeated `update()` calls from a keyboard nudge collapse
     * into one undo step, while a drag is its own step.
     */
    private _wireHistory;
    private _kindFromNodes;
    private _reasonFromNodes;
    private _announceChange;
    private _emit;
    /** Apply a snapshot to the grid, animating the difference. */
    private _apply;
    undo(): Promise<boolean>;
    redo(): Promise<boolean>;
    /** Compute a plan without touching the DOM. */
    plan(strategy?: LayoutStrategy): LayoutPlan;
    /** Apply a previously computed plan, as a single undoable, animated step. */
    applyPlan(plan: LayoutPlan): Promise<void>;
    /** Plan + apply in one call. */
    align(strategy?: LayoutStrategy): Promise<LayoutPlan>;
    private _wireKeyboard;
    private _wireShortcuts;
    /** Whether motion is currently suppressed by the OS. */
    get reducedMotion(): boolean;
    /** Undo/redo availability, for wiring toolbar buttons. */
    get state(): {
        canUndo: boolean;
        canRedo: boolean;
        undoLabel?: string;
        redoLabel?: string;
        depth: number;
    };
    destroy(): void;
}
/** Convenience: attach a studio to every grid on the page. */
export declare function initStudio(grid: GridStack, opts?: StudioOptions): GridStackStudio;
export { planLayout, measure } from './layout-solver';
export { History } from './history';
export { morph, prefersReducedMotion } from './morph';
export { attachA11y } from './a11y';
export type { LayoutPlan, LayoutStrategy, LayoutMetrics, StudioOptions } from './types';
