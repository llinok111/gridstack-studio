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
import { GridItemHTMLElement, GridStackNode } from '../types';
import { attachA11y } from './a11y';
import { History, Snapshot, SnapshotItem } from './history';
import { planLayout } from './layout-solver';
import { morph, prefersReducedMotion } from './morph';
import { LayoutPlan, LayoutStrategy, StudioOptions } from './types';

export class GridStackStudio {
  public readonly grid: GridStack;
  public readonly history: History;
  private _opts: Required<Omit<StudioOptions, 'onAnnounce'>> & { onAnnounce?: (m: string) => void };
  private _disposers: (() => void)[] = [];
  /** true while applying a snapshot, so change events do not re-record */
  private _applying = false;
  private _live?: HTMLElement;

  constructor(grid: GridStack, opts: StudioOptions = {}) {
    this.grid = grid;
    this._opts = {
      historyLimit: opts.historyLimit ?? 60,
      coalesceMs: opts.coalesceMs ?? 400,
      keyboard: opts.keyboard !== false,
      morph: opts.morph !== false,
      morphDuration: opts.morphDuration ?? 260,
      onAnnounce: opts.onAnnounce,
    };
    this.history = new History({ limit: this._opts.historyLimit, coalesceMs: this._opts.coalesceMs });

    this._seed();
    this._wireHistory();
    if (this._opts.keyboard) this._wireKeyboard();
    this._wireShortcuts();
  }

  // ---------------------------------------------------------------- snapshot

  /** Current layout as a snapshot (sorted, ids guaranteed). */
  public snapshot(reason = 'current', kind = 'manual'): Snapshot {
    const items: SnapshotItem[] = this.grid.engine.nodes
      .filter(n => !!n.el)
      .map(n => ({
        id: this._idOf(n),
        x: n.x ?? 0,
        y: n.y ?? 0,
        w: n.w ?? 1,
        h: n.h ?? 1,
        locked: !!n.locked,
      }));
    return { items, reason, kind, at: Date.now() };
  }

  /** Stable id for a node; assigns one if the widget had none. */
  private _idOf(n: GridStackNode): string {
    if (!n.id) {
      n.id = `tile-${n._id ?? Math.random().toString(36).slice(2, 8)}`;
      n.el?.setAttribute('gs-id', n.id);
    }
    return n.id;
  }

  private _seed(): void {
    this.history.seed(this.snapshot().items, 'initial');
  }

  /**
   * Record the layout after an upstream event.
   * The *kind* decides coalescing: repeated `update()` calls from a keyboard nudge collapse
   * into one undo step, while a drag is its own step.
   */
  private _wireHistory(): void {
    const onChanged = (e: Event) => {
      if (this._applying) return;
      const detail = (e as CustomEvent).detail as GridStackNode[] | undefined;
      const kind = this._kindFromNodes(detail);
      const reason = this._reasonFromNodes(detail);
      this.history.push(this.snapshot().items, reason, kind);
      this._announceChange();
    };
    this.grid.on('change', onChanged);
    this.grid.on('added', (e: Event) => {
      if (this._applying) return;
      const n = (e as CustomEvent).detail as GridStackNode[];
      this.history.push(this.snapshot().items, `add ${n.length}`, 'structure');
      this._announceChange();
    });
    this.grid.on('removed', (e: Event) => {
      if (this._applying) return;
      const n = (e as CustomEvent).detail as GridStackNode[];
      this.history.push(this.snapshot().items, `remove ${n.length}`, 'structure');
      this._announceChange();
    });
  }

  private _kindFromNodes(nodes?: GridStackNode[]): string {
    if (!nodes?.length) return 'layout';
    if (nodes.some(n => n._resizing)) return 'resize';
    if (nodes.some(n => n._moving)) return 'drag';
    return 'layout';
  }

  private _reasonFromNodes(nodes?: GridStackNode[]): string {
    if (!nodes?.length) return 'layout';
    const first = nodes[0];
    if (nodes.some(n => n._resizing)) return 'resize';
    if (nodes.some(n => n._moving)) return 'drag';
    if (first.id) return `move ${first.id}`;
    return 'layout';
  }

  private _announceChange(): void {
    const s = this.history;
    this._emit(`${s.canUndo ? 'Layout changed' : 'Layout'}. Undo available: ${s.undoLabel ?? 'none'}`);
  }

  private _emit(msg: string): void {
    this._opts.onAnnounce?.(msg);
    if (this._live) this._live.textContent = msg;
  }

  // ----------------------------------------------------------------- history

  /** Apply a snapshot to the grid, animating the difference. */
  private async _apply(snap: Snapshot, verb: string): Promise<void> {
    this._applying = true;
    const items = snap.items;
    const els = this.grid.getGridItems();

    const run = () => {
      // one batch => one change event, no intermediate layouts
      this.grid.batchUpdate();
      try {
        // remove tiles that no longer exist in the snapshot
        const wanted = new Set(items.map(i => i.id));
        this.grid.getGridItems().forEach(el => {
          const n = el.gridstackNode;
          if (n && !wanted.has(this._idOf(n))) this.grid.removeWidget(el, true, false);
        });
        // add back any tile the snapshot needs but the DOM lost (e.g. undo of a delete)
        items.forEach(it => {
          if (!this.grid.getGridItems().some(el => el.gridstackNode?.id === it.id)) {
            this.grid.addWidget({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h, content: '' });
          }
        });
        // apply positions
        items.forEach(it => {
          const el = this.grid.getGridItems().find(e => e.gridstackNode?.id === it.id);
          if (el) this.grid.update(el, { x: it.x, y: it.y, w: it.w, h: it.h });
        });
      } finally {
        this.grid.batchUpdate(false);
      }
    };

    if (this._opts.morph) {
      await morph(els, run, { duration: this._opts.morphDuration, respectReducedMotion: true });
    } else {
      run();
    }
    this._applying = false;
    this._emit(`${verb}. ${this.history.undoLabel ? 'Undo: ' + this.history.undoLabel : 'Nothing left to undo'}`);
  }

  public async undo(): Promise<boolean> {
    const snap = this.history.undo();
    if (!snap) { this._emit('Nothing to undo'); return false; }
    await this._apply(snap, 'Undone');
    return true;
  }

  public async redo(): Promise<boolean> {
    const snap = this.history.redo();
    if (!snap) { this._emit('Nothing to redo'); return false; }
    await this._apply(snap, 'Redone');
    return true;
  }

  // ------------------------------------------------------------------ layout

  /** Compute a plan without touching the DOM. */
  public plan(strategy: LayoutStrategy = 'seam'): LayoutPlan {
    const items = this.grid.engine.nodes
      .filter(n => !!n.el)
      .map(n => ({ id: this._idOf(n), x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? 1, h: n.h ?? 1, locked: !!n.locked }));
    return planLayout(items, this.grid.getColumn(), strategy);
  }

  /** Apply a previously computed plan, as a single undoable, animated step. */
  public async applyPlan(plan: LayoutPlan): Promise<void> {
    if (!plan.moves.length) { this._emit('Layout is already tight'); return; }
    this._applying = true;
    const els = this.grid.getGridItems();
    const run = () => {
      this.grid.batchUpdate();
      try {
        plan.moves.forEach(m => {
          const el = this.grid.getGridItems().find(e => e.gridstackNode?.id === m.id);
          if (el) this.grid.update(el, { x: m.to.x, y: m.to.y, w: m.to.w, h: m.to.h });
        });
      } finally {
        this.grid.batchUpdate(false);
      }
    };
    if (this._opts.morph) {
      await morph(els, run, { duration: this._opts.morphDuration });
    } else run();
    this._applying = false;
    // record as its own step
    this.history.push(this.snapshot().items, `align (${plan.strategy})`, 'align');
    this._emit(`Aligned with ${plan.strategy}: ${plan.before.rows} to ${plan.after.rows} rows`);
  }

  /** Plan + apply in one call. */
  public async align(strategy: LayoutStrategy = 'seam'): Promise<LayoutPlan> {
    const p = this.plan(strategy);
    await this.applyPlan(p);
    return p;
  }

  // -------------------------------------------------------------- a11y/shortcuts

  private _wireKeyboard(): void {
    if (!this._live) {
      // polite live region: screen readers read layout changes without stealing focus
      const live = document.createElement('div');
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      live.className = 'gs-studio-sr-only';
      document.body.appendChild(live);
      this._live = live;
    }
    this._disposers.push(attachA11y(this.grid, {
      announce: msg => { this._emit(msg); },
      allowRotate: true,
    }));
  }

  private _wireShortcuts(): void {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        // let a focused text field keep native undo
        const t = e.target as HTMLElement;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        void this.undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        const t = e.target as HTMLElement;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        void this.redo();
      }
    };
    this.grid.el.addEventListener('keydown', onKey);
    this._disposers.push(() => this.grid.el.removeEventListener('keydown', onKey));
  }

  /** Whether motion is currently suppressed by the OS. */
  public get reducedMotion(): boolean { return prefersReducedMotion(); }

  /** Undo/redo availability, for wiring toolbar buttons. */
  public get state(): { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string; depth: number } {
    return {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      undoLabel: this.history.undoLabel,
      redoLabel: this.history.redoLabel,
      depth: this.history.depth,
    };
  }

  public destroy(): void {
    this._disposers.forEach(d => d());
    this._disposers = [];
    this._live?.remove();
    this._live = undefined;
  }
}

/** Convenience: attach a studio to every grid on the page. */
export function initStudio(grid: GridStack, opts?: StudioOptions): GridStackStudio {
  return new GridStackStudio(grid, opts);
}

export { planLayout, measure } from './layout-solver';
export { History } from './history';
export { morph, prefersReducedMotion } from './morph';
export { attachA11y } from './a11y';
export type { LayoutPlan, LayoutStrategy, LayoutMetrics, StudioOptions } from './types';
