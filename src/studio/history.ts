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
export type HistoryStateCB = (state: { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string }) => void;

export class History {
  private _past: Snapshot[] = [];
  private _future: Snapshot[] = [];
  private _present?: Snapshot;
  private _limit: number;
  private _coalesceMs: number;
  private _listeners: HistoryStateCB[] = [];
  /** true while an undo/redo is being applied, so recording does not fight itself */
  public applying = false;

  constructor(opts: HistoryOptions = {}) {
    this._limit = Math.max(2, opts.limit ?? 60);
    this._coalesceMs = Math.max(0, opts.coalesceMs ?? 400);
  }

  /** current state (undefined until the first `seed`/`push`) */
  public get present(): Snapshot | undefined { return this._present; }
  public get canUndo(): boolean { return this._past.length > 0; }
  public get canRedo(): boolean { return this._future.length > 0; }
  public get depth(): number { return this._past.length; }
  /** label of the step that Ctrl+Z would revert */
  public get undoLabel(): string | undefined { return this._present?.reason; }
  /** label of the step that Ctrl+Shift+Z would re-apply */
  public get redoLabel(): string | undefined { return this._future[this._future.length - 1]?.reason; }

  public onChange(cb: HistoryStateCB): void { this._listeners.push(cb); }
  private _emit(): void {
    const s = { canUndo: this.canUndo, canRedo: this.canRedo, undoLabel: this.undoLabel, redoLabel: this.redoLabel };
    this._listeners.forEach(cb => cb(s));
  }

  /** Establish the baseline without creating an undo step. */
  public seed(items: SnapshotItem[], reason = 'initial'): void {
    this._present = { items, reason, kind: 'seed', at: Date.now() };
    this._past = [];
    this._future = [];
    this._emit();
  }

  /**
   * Record a new state.
   * @param items the new layout
   * @param reason human readable label
   * @param kind coalescing bucket; same kind within the window merges
   * @returns true if the state was actually stored (false when unchanged)
   */
  public push(items: SnapshotItem[], reason: string, kind: string): boolean {
    if (this.applying) return false;
    const now = Date.now();
    const prev = this._present;
    if (prev && sameItems(prev.items, items)) return false;

    // Coalescing requires a positive window: with `coalesceMs: 0` every edit must be its own
    // step (otherwise two edits in the same millisecond would silently merge).
    const mergeable = !!prev
      && prev.kind === kind
      && kind !== 'seed'
      && this._coalesceMs > 0
      && (now - prev.at) < this._coalesceMs
      && this._past.length > 0; // never merge into the baseline: the baseline must stay reachable

    if (mergeable) {
      // replace the present, keep the older past entry as the undo target
      this._present = { items, reason, kind, at: now };
    } else {
      if (prev) this._past.push(prev);
      if (this._past.length > this._limit) this._past.shift();
      this._present = { items, reason, kind, at: now };
    }
    this._future = []; // a new edit invalidates the redo branch
    this._emit();
    return true;
  }

  /** Step back. Returns the state to apply, or undefined when there is nothing to undo. */
  public undo(): Snapshot | undefined {
    const prev = this._past.pop();
    if (!prev || !this._present) return undefined;
    this._future.push(this._present);
    this._present = prev;
    this._emit();
    return prev;
  }

  /** Step forward. Returns the state to apply, or undefined when there is nothing to redo. */
  public redo(): Snapshot | undefined {
    const next = this._future.pop();
    if (!next || !this._present) return undefined;
    this._past.push(this._present);
    this._present = next;
    this._emit();
    return next;
  }

  public clear(): void {
    this._past = [];
    this._future = [];
    this._emit();
  }
}

/** Structural equality over the fields we snapshot. */
function sameItems(a: SnapshotItem[], b: SnapshotItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = b[i];
    if (p.id !== q.id || p.x !== q.x || p.y !== q.y || p.w !== q.w || p.h !== q.h) return false;
  }
  return true;
}
