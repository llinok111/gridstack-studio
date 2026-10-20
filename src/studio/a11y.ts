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
import { GridItemHTMLElement, GridStackNode } from '../types';

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
function describe(node: GridStackNode, column: number): string {
  const x = (node.x ?? 0) + 1;
  const y = (node.y ?? 0) + 1;
  const w = node.w ?? 1;
  const h = node.h ?? 1;
  const lastRow = y + h - 1;
  return `row ${y} column ${x}, ${w} wide by ${h} tall, last row ${lastRow}`;
}

/**
 * Wire keyboard + ARIA onto a grid. Returns a disposer.
 * Safe to call once per grid; it does not wrap or replace any upstream method.
 */
export function attachA11y(grid: GridStack, opts: A11yOptions = {}): () => void {
  const el = grid.el;
  const jump = Math.max(1, opts.jump ?? 4);
  const announce = opts.announce ?? (() => { /* no-op */ });
  const allowRemove = !!opts.allowRemove;
  const allowRotate = opts.allowRotate !== false;

  let grabbed = false;
  /** the item that currently owns the roving tabindex */
  let active: GridItemHTMLElement | undefined;

  // ---- container semantics -------------------------------------------------
  const prevRole = el.getAttribute('role');
  const prevDesc = el.getAttribute('aria-roledescription');
  const prevLabel = el.getAttribute('aria-label');
  el.setAttribute('role', 'application');
  el.setAttribute('aria-roledescription', 'dashboard grid');
  if (!prevLabel) el.setAttribute('aria-label', 'Dashboard layout. Use arrow keys to move the focused tile.');

  // ---- per-item semantics --------------------------------------------------
  const decorate = (itemEl: GridItemHTMLElement) => {
    const node = itemEl.gridstackNode;
    if (!node) return;
    if (!itemEl.hasAttribute('role')) itemEl.setAttribute('role', 'group');
    if (!itemEl.hasAttribute('aria-roledescription')) itemEl.setAttribute('aria-roledescription', 'tile');
    // Roving tabindex: exactly one tile must be reachable with Tab, otherwise the whole grid is
    // a keyboard dead end (nothing has tabindex=0 and Tab skips it entirely).
    if (!itemEl.hasAttribute('tabindex')) itemEl.setAttribute('tabindex', '-1');
    const label = itemEl.getAttribute('aria-label')
      || (itemEl.textContent || '').trim().slice(0, 60)
      || node.id
      || 'tile';
    if (!itemEl.dataset.studioLabel) itemEl.dataset.studioLabel = label;
    itemEl.setAttribute('aria-label', `${itemEl.dataset.studioLabel}: ${describe(node, grid.getColumn())}`);
    itemEl.setAttribute('aria-disabled', node.noMove && node.noResize ? 'true' : 'false');
  };

  const decorateAll = () => {
    const items = grid.getGridItems();
    items.forEach(decorate);
    // Guarantee a single tab stop. Prefer the remembered one, else the first tile in visual order.
    if (!active || !items.includes(active)) {
      const remembered = items.find(i => i.getAttribute('tabindex') === '0');
      active = remembered ?? items[0];
    }
    items.forEach(i => i.setAttribute('tabindex', i === active ? '0' : '-1'));
  };

  /** Re-run decoration after any layout change (labels embed positions). */
  const refresh = () => decorateAll();

  const focusItem = (target?: GridItemHTMLElement) => {
    if (!target) return;
    if (active && active !== target) active.setAttribute('tabindex', '-1');
    active = target;
    target.setAttribute('tabindex', '0');
    target.focus({ preventScroll: false });
  };

  /** nearest item in a direction, by grid coordinates (not DOM order) */
  const neighbour = (from: GridStackNode, dx: number, dy: number): GridStackNode | undefined => {
    const fx = from.x ?? 0, fy = from.y ?? 0;
    const candidates = grid.engine.nodes.filter(n => n.el && n._id !== from._id);
    let best: GridStackNode | undefined;
    let bestScore = Infinity;
    for (const n of candidates) {
      const nx = n.x ?? 0, ny = n.y ?? 0;
      const ddx = nx - fx, ddy = ny - fy;
      // must be strictly in the requested direction
      if (dx > 0 && ddx <= 0) continue;
      if (dx < 0 && ddx >= 0) continue;
      if (dy > 0 && ddy <= 0) continue;
      if (dy < 0 && ddy >= 0) continue;
      // prefer aligned, then close
      const cross = dx !== 0 ? Math.abs(ddy) : Math.abs(ddx);
      const along = dx !== 0 ? Math.abs(ddx) : Math.abs(ddy);
      const score = along + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    return best;
  };

  const move = (node: GridStackNode, dx: number, dy: number): boolean => {
    if (node.noMove || node.locked) {
      announce('Tile is locked and cannot be moved');
      return false;
    }
    const column = grid.getColumn();
    const nx = Math.min(column - (node.w ?? 1), Math.max(0, (node.x ?? 0) + dx));
    const ny = Math.max(0, (node.y ?? 0) + dy);
    if (nx === node.x && ny === node.y) return false;
    grid.update(node.el!, { x: nx, y: ny });
    decorate(node.el!);
    announce(`Moved to ${describe(node, column)}`);
    return true;
  };

  const resize = (node: GridStackNode, dw: number, dh: number): boolean => {
    if (node.noResize || node.locked) {
      announce('Tile is locked and cannot be resized');
      return false;
    }
    const column = grid.getColumn();
    const maxW = node.maxW ?? column;
    const nw = Math.min(maxW, Math.max(node.minW ?? 1, (node.w ?? 1) + dw));
    const nh = Math.max(node.minH ?? 1, (node.h ?? 1) + dh);
    if (nw === node.w && nh === node.h) return false;
    grid.update(node.el!, { w: nw, h: nh });
    decorate(node.el!);
    announce(`Resized to ${describe(node, column)}`);
    return true;
  };

  const rotate = (node: GridStackNode): boolean => {
    if (node.noResize || node.locked) { announce('Tile is locked and cannot be rotated'); return false; }
    const w = node.w ?? 1, h = node.h ?? 1;
    if (w === h) { announce('Tile is already square'); return false; }
    const column = grid.getColumn();
    if ((node.x ?? 0) + h > column) { announce('Not enough room to rotate here'); return false; }
    grid.update(node.el!, { w: h, h: w });
    decorate(node.el!);
    announce(`Rotated to ${describe(node, column)}`);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const target = (e.target as HTMLElement)?.closest?.('.grid-stack-item') as GridItemHTMLElement | null;
    const node = target?.gridstackNode;
    if (!node || !target) return;

    const mod = e.ctrlKey || e.metaKey;
    const step = e.shiftKey ? jump : 1;
    const resizeStep = e.shiftKey ? 2 : 1;
    let handled = true;

    switch (e.key) {
      case 'ArrowLeft':  mod ? resize(node, -resizeStep, 0) : move(node, -step, 0); break;
      case 'ArrowRight': mod ? resize(node, resizeStep, 0)  : move(node, step, 0);  break;
      case 'ArrowUp':    mod ? resize(node, 0, -resizeStep) : move(node, 0, -step); break;
      case 'ArrowDown':  mod ? resize(node, 0, resizeStep)  : move(node, 0, step);  break;
      case 'Home':
        if (mod) { resize(node, -(node.w ?? 1) + 1, 0); }
        else { move(node, -((node.x ?? 0)), 0); }
        break;
      case 'End': {
        const column = grid.getColumn();
        if (mod) { resize(node, column - (node.x ?? 0) - (node.w ?? 1), 0); }
        else { move(node, column - (node.x ?? 0) - (node.w ?? 1), 0); }
        break;
      }
      case 'PageUp':   move(node, 0, -((node.y ?? 0))); break;
      case 'PageDown': move(node, 0, grid.getRow()); break;
      case 'Enter':
      case ' ':
        grabbed = !grabbed;
        target.setAttribute('aria-grabbed', String(grabbed));
        announce(grabbed ? 'Grabbed. Use arrow keys to move, Escape to release.' : 'Released.');
        break;
      case 'Escape':
        if (grabbed) { grabbed = false; target.removeAttribute('aria-grabbed'); announce('Released.'); }
        else handled = false;
        break;
      case 'Delete':
      case 'Backspace':
        if (allowRemove) {
          announce('Tile removed');
          opts.onRemove?.(node);
        } else handled = false;
        break;
      case 'r':
      case 'R':
        if (allowRotate) rotate(node); else handled = false;
        break;
      case 'Tab': {
        // roving tabindex: move focus between tiles in visual order
        const items = grid.getGridItems();
        const i = items.indexOf(target);
        const next = items[e.shiftKey ? i - 1 : i + 1];
        if (next) { focusItem(next); handled = true; } else handled = false;
        break;
      }
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onFocusIn = (e: FocusEvent) => {
    const target = (e.target as HTMLElement)?.closest?.('.grid-stack-item') as GridItemHTMLElement | null;
    if (target) focusItem(target);
  };

  /** click selects the tile so the next arrow key acts on it */
  const onPointerDown = (e: Event) => {
    const target = (e.target as HTMLElement)?.closest?.('.grid-stack-item') as GridItemHTMLElement | null;
    if (target && target !== active) {
      if (active) active.setAttribute('tabindex', '-1');
      active = target;
      target.setAttribute('tabindex', '0');
    }
  };

  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('focusin', onFocusIn);
  el.addEventListener('pointerdown', onPointerDown, true);

  // keep labels in sync with layout changes and newly added items
  const onChanged = () => refresh();
  grid.on('change added removed', onChanged);
  decorateAll();

  return () => {
    el.removeEventListener('keydown', onKeyDown);
    el.removeEventListener('focusin', onFocusIn);
    el.removeEventListener('pointerdown', onPointerDown, true);
    grid.off('change added removed');
    prevRole === null ? el.removeAttribute('role') : el.setAttribute('role', prevRole);
    prevDesc === null ? el.removeAttribute('aria-roledescription') : el.setAttribute('aria-roledescription', prevDesc);
    prevLabel === null ? el.removeAttribute('aria-label') : el.setAttribute('aria-label', prevLabel);
  };
}

/** Exported for tests: the announcement text for a node. */
export const __describe = describe;
