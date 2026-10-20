/**
 * studio/history.ts
 * Snapshot-based undo / redo for grid layouts.
 *
 * NEW IN THIS FORK. Upstream has no history of any kind (grep for `undo|redo` in src/ returns
 * nothing). Design notes:
 *
 *  - Snapshots, not inverse operations. A layout is tiny (id + 4 ints per item), so storing a
 *    full snapshot per step is cheaper than maintaining correct inverse patches, and it is
 *    impossible to desync. Cost: ~40 bytes/item/step; 60 steps x 30 items = ~72KB worst case.
 *  - Coalescing. A drag fires one 'change' event, but resize handles and keyboard nudges can
 *    fire many in a row. Consecutive edits of the same *kind* within `coalesceMs` collapse into
 *    one undo step, so one Ctrl+Z undoes one user gesture rather than one event.
 *  - The stack never stores DOM references, so undo after a widget is removed still works.
 */
import { Box } from './types';
/** One item's position inside a snapshot. */
export interface SnapshotItem extends Box {
    id: string;
    locked?: boolean;
}
/** An immutable layout state plus a label describing how we got here. */
export interface Snapshot {
    items: SnapshotItem[];
    /** human readable reason, e.g. "drag", "resize", "align", "remove:chart-1" */
    reason: string;
    /** coarse bucket used for coalescing; consecutive same-kind edits merge */
    kind: string;
    /** monotonic clock used to decide whether to merge */
    at: number;
}
export interface HistoryOptions {
    limit?: number;
    coalesceMs?: number;
}
/** Callback fired whenever the undo/redo availability changes. */
export type HistoryStateCB = (state: {
    canUndo: boolean;
    canRedo: boolean;
    undoLabel?: string;
    redoLabel?: string;
}) => void;
export declare class History {
    private _past;
    private _future;
    private _present?;
    private _limit;
    private _coalesceMs;
    private _listeners;
    /** true while an undo/redo is being applied, so recording does not fight itself */
    applying: boolean;
    constructor(opts?: HistoryOptions);
    /** current state (undefined until the first `seed`/`push`) */
    get present(): Snapshot | undefined;
    get canUndo(): boolean;
    get canRedo(): boolean;
    get depth(): number;
    /** label of the step that Ctrl+Z would revert */
    get undoLabel(): string | undefined;
    /** label of the step that Ctrl+Shift+Z would re-apply */
    get redoLabel(): string | undefined;
    onChange(cb: HistoryStateCB): void;
    private _emit;
    /** Establish the baseline without creating an undo step. */
    seed(items: SnapshotItem[], reason?: string): void;
    /**
     * Record a new state.
     * @param items the new layout
     * @param reason human readable label
     * @param kind coalescing bucket; same kind within the window merges
     * @returns true if the state was actually stored (false when unchanged)
     */
    push(items: SnapshotItem[], reason: string, kind: string): boolean;
    /** Step back. Returns the state to apply, or undefined when there is nothing to undo. */
    undo(): Snapshot | undefined;
    /** Step forward. Returns the state to apply, or undefined when there is nothing to redo. */
    redo(): Snapshot | undefined;
    clear(): void;
}
