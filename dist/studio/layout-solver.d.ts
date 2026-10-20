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
import { LayoutMetrics, LayoutPlan, LayoutStrategy, PlanItem } from './types';
/** Quality figures for a layout. */
export declare function measure(items: PlanItem[], column: number): LayoutMetrics;
/**
 * Compute a plan for the given snapshot. Pure: `items` is never mutated.
 *
 * @param items   snapshot of the current layout
 * @param column  column count of the grid
 * @param strategy which solver to run
 */
export declare function planLayout(items: PlanItem[], column: number, strategy: LayoutStrategy): LayoutPlan;
