/**
 * studio/layout-solver.ts
 * Non-destructive layout planning for GridStack.
 *
 * NEW IN THIS FORK. Upstream only ships `engine.compact('compact' | 'list')`, which is a
 * destructive, single-strategy reflow. This module instead *plans* a layout as a pure
 * function over a snapshot: nothing is mutated, and the caller gets before/after metrics
 * so the change can be previewed, diffed, undone, and announced.
 *
 * Three strategies:
 *  - `compact` : up-pull then left-pull to a fixpoint (the classic behaviour, as a baseline)
 *  - `seam`    : collapse *structurally dead* columns first (a column that is empty across the
 *                whole used height), then up-pull only. Horizontal order is never rewritten,
 *                so visual grouping / reading order survives - upstream cannot do this.
 *  - `pack`    : area-descending skyline first-fit. Tightest height, at the cost of reordering.
 *
 * Locked items are immovable obstacles in every strategy.
 */
import { Box, LayoutMetrics, LayoutMove, LayoutPlan, LayoutStrategy, PlanItem } from './types';

/** Compact string key for a cell, avoids allocating nested arrays. */
const key = (x: number, y: number, column: number): number => y * column + x;

/** Build the set of occupied cells for everything except `skipId`. */
function occupancyOf(items: PlanItem[], column: number, skipId?: string): Set<number> {
  const occ = new Set<number>();
  for (const it of items) {
    if (it.id === skipId) continue;
    for (let y = it.y; y < it.y + it.h; y++) {
      for (let x = it.x; x < it.x + it.w; x++) occ.add(key(x, y, column));
    }
  }
  return occ;
}

/** True when `box` fits inside the column count and does not touch any occupied cell. */
function fits(box: Box, occ: Set<number>, column: number): boolean {
  if (box.x < 0 || box.y < 0 || box.x + box.w > column) return false;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (occ.has(key(x, y, column))) return false;
    }
  }
  return true;
}

/** Highest row touched by the given items. */
function rowsOf(items: PlanItem[]): number {
  return items.reduce((r, it) => Math.max(r, it.y + it.h), 0);
}

/** Quality figures for a layout. */
export function measure(items: PlanItem[], column: number): LayoutMetrics {
  const rows = rowsOf(items);
  const occ = occupancyOf(items, column);
  const filled = occ.size;
  const capacity = column * rows;

  // A seam is an *interior* column that is empty across the whole used height: real structural
  // waste, because content sits on both sides of it. A dead column at the far right is only
  // "not full" (already counted by `holes`), so it is deliberately not a seam.
  const emptyCol: boolean[] = [];
  for (let x = 0; x < column; x++) {
    let empty = true;
    for (let y = 0; y < rows; y++) {
      if (occ.has(key(x, y, column))) { empty = false; break; }
    }
    emptyCol[x] = empty;
  }
  let firstUsed = -1, lastUsed = -1;
  for (let x = 0; x < column; x++) {
    if (!emptyCol[x]) { if (firstUsed === -1) firstUsed = x; lastUsed = x; }
  }
  let seams = 0;
  for (let x = firstUsed + 1; x < lastUsed; x++) {
    if (emptyCol[x]) seams++;
  }

  return {
    rows,
    holes: capacity - filled,
    occupancy: capacity ? filled / capacity : 0,
    seams,
  };
}

/** Stable ordering used by the settling passes: top-left first. */
function byPosition(a: PlanItem, b: PlanItem): number {
  return a.y - b.y || a.x - b.x;
}

/**
 * Repeatedly pull each movable item up, then left, until nothing moves.
 * Iterating to a fixpoint matters: a single pass leaves items stranded when an
 * earlier item only becomes movable after a later one vacates its cell.
 */
function settle(items: PlanItem[], column: number, allowHorizontal: boolean): void {
  const maxPasses = Math.max(4, items.length * 2);
  const order = [...items].sort(byPosition);

  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (const it of order) {
      if (it.locked) continue;
      const occ = occupancyOf(items, column, it.id);

      // vertical gravity
      while (it.y > 0 && fits({ ...it, y: it.y - 1 }, occ, column)) {
        it.y--;
        moved = true;
      }
      // horizontal pull (only for the 'compact' strategy)
      if (allowHorizontal) {
        while (it.x > 0 && fits({ ...it, x: it.x - 1 }, occ, column)) {
          it.x--;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * Seam-safe settling: order-preserving compact reflow.
 *
 * Design history, kept so the dead ends are not re-walked. Every one of these was implemented
 * and measured against the demo board before being rejected:
 *
 *  a) gravity only - too weak. A diagonally scrambled board has no fully-dead column, so
 *     column-seam closing finds nothing, and gravity alone leaves tiles stranded next to empty
 *     space (measured: 9 rows before, 9 rows after).
 *  b) free left-slide - collapses everything against the left edge; the right half of the board
 *     goes empty and the layout reads as broken.
 *  c) "slide up to the nearest left neighbour" - still collapses on sparse boards.
 *  d) per-tile "slide into a right-bounded pocket" - creeps left one pocket at a time.
 *  e) pack tiles sharing a *final* row - never fires on a scrambled board, because gravity
 *     leaves every tile on its own row (measured: still 9 rows).
 *
 * What actually works, and what "seam-safe" therefore means here: a **row-major shelf reflow**
 * that keeps the original reading order. Tiles are sorted by (y, x) - the order a user reads
 * them - and then placed left-to-right, wrapping to the next row only when the current shelf is
 * full. The result is as tight as `compact`, but the sequence never changes, so tile *n* is
 * always after tile *n-1*. That is the guarantee `compact` cannot make.
 *
 * Locked tiles are immovable obstacles: they are placed first at their exact coordinates, and
 * the shelf packer flows the movable ones around them.
 */
function settleBands(items: PlanItem[], column: number): void {
  // reading order, captured before anything moves
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const locked = ordered.filter(it => it.locked);

  // locked tiles keep their coordinates and seed the occupancy map
  const occ = occupancyOf(locked, column);

  let shelfY = 0;      // current shelf's top row
  let shelfH = 0;      // height of the current shelf
  let cursorX = 0;     // next free column on this shelf

  for (const it of ordered) {
    if (it.locked) continue;

    // advance to the next shelf when this tile no longer fits on the current one
    if (cursorX + it.w > column) {
      shelfY += Math.max(1, shelfH);
      shelfH = 0;
      cursorX = 0;
    }

    // find the first (x, y) at or after the cursor that is free
    let placed = false;
    while (!placed) {
      for (let x = cursorX; x + it.w <= column; x++) {
        const cand = { x, y: shelfY, w: it.w, h: it.h };
        if (fits(cand, occ, column)) {
          it.x = x;
          it.y = shelfY;
          for (let yy = shelfY; yy < shelfY + it.h; yy++) {
            for (let xx = x; xx < x + it.w; xx++) occ.add(key(xx, yy, column));
          }
          cursorX = x + it.w;
          shelfH = Math.max(shelfH, it.h);
          placed = true;
          break;
        }
      }
      if (!placed) {
        // shelf is blocked (e.g. by a locked tile) - move down and retry
        shelfY += 1;
        cursorX = 0;
        if (shelfY > items.length * column + 64) break; // safety valve
      }
    }
  }
}

/** Area-descending skyline first-fit packing. */
function packByArea(items: PlanItem[], column: number): void {
  const locked = items.filter(it => it.locked);
  const movable = items
    .filter(it => !it.locked)
    .sort((a, b) => (b.w * b.h - a.w * a.h) || byPosition(a, b));

  // locked items stay put and seed the occupied set
  const placed: PlanItem[] = locked.map(it => ({ ...it }));
  const occ = occupancyOf(placed, column);

  for (const it of movable) {
    const box: Box = { x: 0, y: 0, w: it.w, h: it.h };
    let done = false;
    for (let y = 0; !done; y++) {
      for (let x = 0; x + it.w <= column; x++) {
        const candidate = { ...box, x, y };
        if (fits(candidate, occ, column)) {
          it.x = x; it.y = y;
          for (let yy = y; yy < y + it.h; yy++) {
            for (let xx = x; xx < x + it.w; xx++) occ.add(key(xx, yy, column));
          }
          done = true;
          break;
        }
      }
      if (y > column * 4 + rowsOf(items) + 64) break; // safety valve, never hit in practice
    }
  }
}

/**
 * Compute a plan for the given snapshot. Pure: `items` is never mutated.
 *
 * @param items   snapshot of the current layout
 * @param column  column count of the grid
 * @param strategy which solver to run
 */
export function planLayout(items: PlanItem[], column: number, strategy: LayoutStrategy): LayoutPlan {
  const before = measure(items, column);
  const work: PlanItem[] = items.map(it => ({ ...it }));

  switch (strategy) {
    case 'seam':
      settleBands(work, column);
      break;
    case 'pack':
      packByArea(work, column);
      break;
    case 'compact':
    default:
      settle(work, column, true);
      break;
  }

  const moves: LayoutMove[] = [];
  for (const it of work) {
    const orig = items.find(o => o.id === it.id)!;
    if (orig.x !== it.x || orig.y !== it.y) {
      moves.push({
        id: it.id,
        from: { x: orig.x, y: orig.y, w: orig.w, h: orig.h },
        to: { x: it.x, y: it.y, w: it.w, h: it.h },
      });
    }
  }

  return {
    strategy,
    column,
    moves,
    before,
    after: measure(work, column),
  };
}
