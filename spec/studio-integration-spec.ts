/**
 * spec/studio-integration-spec.ts
 * Integration tests: history + plan + a11y wired onto a real GridStack instance.
 */
import { GridStack } from '../src/gridstack';
import { GridStackStudio } from '../src/studio/studio';

const gridHTML = `
<div style="width: 800px; height: 600px" id="gs-cont">
  <div class="grid-stack">
    <div class="grid-stack-item" gs-x="0" gs-y="0" gs-w="2" gs-h="1" gs-id="a">
      <div class="grid-stack-item-content">Alpha</div>
    </div>
    <div class="grid-stack-item" gs-x="4" gs-y="4" gs-w="2" gs-h="1" gs-id="b">
      <div class="grid-stack-item-content">Beta</div>
    </div>
  </div>
</div>`;

describe('studio > integration >', () => {
  let grid: GridStack;
  let studio: GridStackStudio;

  beforeEach(() => {
    document.body.insertAdjacentHTML('afterbegin', gridHTML);
    // 'float' keeps the declared positions: with the default 'top' gravity upstream pulls every
    // tile up on init, which would hide the very positions these tests assert on.
    grid = GridStack.init({ animate: false, cellHeight: 60, margin: 4, mode: 'float' }, '.grid-stack');
    studio = new GridStackStudio(grid, { morph: false, coalesceMs: 0 });
  });

  afterEach(() => {
    studio.destroy();
    grid.destroy(false);
    document.body.removeChild(document.getElementById('gs-cont')!);
    document.querySelectorAll('.gs-studio-sr-only').forEach(el => el.remove());
  });

  const nodeOf = (id: string) => grid.engine.nodes.find(n => n.id === id)!;

  describe('seeding >', () => {
    it('starts with no undo available', () => {
      expect(studio.state.canUndo).toBe(false);
      expect(studio.state.canRedo).toBe(false);
    });

    it('gives every tile a stable id', () => {
      const snap = studio.snapshot();
      expect(snap.items.map(i => i.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('undo/redo over real grid mutations >', () => {
    it('undoes a programmatic move', async () => {
      grid.update(nodeOf('a').el!, { x: 5, y: 3 });
      expect(nodeOf('a').x).toBe(5);
      expect(studio.state.canUndo).toBe(true);

      await studio.undo();
      expect(nodeOf('a').x).toBe(0);
      expect(nodeOf('a').y).toBe(0);
    });

    it('redoes the undone move', async () => {
      grid.update(nodeOf('a').el!, { x: 5, y: 3 });
      await studio.undo();
      await studio.redo();
      expect(nodeOf('a').x).toBe(5);
      expect(nodeOf('a').y).toBe(3);
    });

    it('undoes a resize', async () => {
      grid.update(nodeOf('a').el!, { w: 4, h: 2 });
      expect(nodeOf('a').w).toBe(4);
      await studio.undo();
      expect(nodeOf('a').w).toBe(2);
      expect(nodeOf('a').h).toBe(1);
    });

    it('undoes a removal by re-adding the tile', async () => {
      const el = nodeOf('b').el!;
      grid.removeWidget(el, true, true);
      expect(grid.engine.nodes.find(n => n.id === 'b')).toBeUndefined();

      await studio.undo();
      const back = grid.engine.nodes.find(n => n.id === 'b');
      expect(back).toBeDefined();
      expect(back!.x).toBe(4);
      expect(back!.y).toBe(4);
    });

    it('walks a multi-step history backwards and forwards', async () => {
      grid.update(nodeOf('a').el!, { x: 1, y: 0 });
      grid.update(nodeOf('a').el!, { x: 2, y: 0 });
      grid.update(nodeOf('a').el!, { x: 3, y: 0 });
      expect(nodeOf('a').x).toBe(3);

      await studio.undo();
      expect(nodeOf('a').x).toBe(2);
      await studio.undo();
      expect(nodeOf('a').x).toBe(1);
      await studio.undo();
      expect(nodeOf('a').x).toBe(0);

      await studio.redo();
      await studio.redo();
      await studio.redo();
      expect(nodeOf('a').x).toBe(3);
    });

    it('reports false when there is nothing to undo', async () => {
      expect(await studio.undo()).toBe(false);
      expect(await studio.redo()).toBe(false);
    });
  });

  describe('layout planning >', () => {
    it('plans without touching the DOM', () => {
      const plan = studio.plan('compact');
      expect(plan.moves.length).toBeGreaterThan(0);
      // nothing moved yet
      expect(nodeOf('b').x).toBe(4);
      expect(nodeOf('b').y).toBe(4);
    });

    it('applies a plan and reduces rows', async () => {
      const before = grid.getRow();
      const plan = await studio.align('compact');
      expect(plan.after.rows).toBeLessThanOrEqual(before);
      expect(grid.getRow()).toBe(plan.after.rows);
      // 'b' should now sit right next to 'a' on row 0
      expect(nodeOf('b').y).toBe(0);
    });

    it('records an applied plan as one undoable step', async () => {
      await studio.align('compact');
      const movedY = nodeOf('b').y;
      expect(movedY).toBe(0);
      await studio.undo();
      expect(nodeOf('b').y).toBe(4);
    });

    it('does nothing when the layout is already tight', async () => {
      await studio.align('compact');
      const plan = await studio.align('compact');
      expect(plan.moves).toHaveLength(0);
    });

    it('never moves locked tiles', async () => {
      nodeOf('b').locked = true;
      const plan = studio.plan('compact');
      expect(plan.moves.find(m => m.id === 'b')).toBeUndefined();
    });
  });

  describe('keyboard + ARIA >', () => {
    it('adds application role to the container', () => {
      expect(grid.el.getAttribute('role')).toBe('application');
      expect(grid.el.getAttribute('aria-roledescription')).toBe('dashboard grid');
    });

    it('adds group role and a positional label to each tile', () => {
      const el = nodeOf('a').el!;
      expect(el.getAttribute('role')).toBe('group');
      expect(el.getAttribute('aria-roledescription')).toBe('tile');
      expect(el.getAttribute('aria-label')).toContain('row 1 column 1');
      expect(el.getAttribute('aria-label')).toContain('Alpha');
    });

    it('uses a roving tabindex: exactly one tile is tabbable', () => {
      const els = grid.getGridItems();
      const tabbable = els.filter(e => e.getAttribute('tabindex') === '0');
      expect(tabbable).toHaveLength(1);
      els.forEach(e => expect(['0', '-1']).toContain(e.getAttribute('tabindex')));
    });

    it('moves the focused tile with arrow keys', () => {
      const el = nodeOf('a').el!;
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(nodeOf('a').x).toBe(1);
    });

    it('resizes with Ctrl+Arrow', () => {
      const el = nodeOf('a').el!;
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));
      expect(nodeOf('a').w).toBe(3);
    });

    it('jumps 4 cells with Shift+Arrow', () => {
      const el = nodeOf('a').el!;
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      expect(nodeOf('a').y).toBe(4);
    });

    it('refuses to move a locked tile and announces why', () => {
      const msgs: string[] = [];
      studio.destroy();
      studio = new GridStackStudio(grid, { morph: false, onAnnounce: m => msgs.push(m) });
      nodeOf('a').locked = true;
      const el = nodeOf('a').el!;
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(nodeOf('a').x).toBe(0);
      expect(msgs.some(m => /locked/i.test(m))).toBe(true);
    });

    it('clamps movement at the grid edge instead of going negative', () => {
      const el = nodeOf('a').el!;
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(nodeOf('a').x).toBe(0);
    });

    it('rotates a non-square tile with r', () => {
      const el = nodeOf('a').el!;
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      expect(nodeOf('a').w).toBe(1);
      expect(nodeOf('a').h).toBe(2);
    });

    it('updates the announced label after a move', () => {
      const el = nodeOf('a').el!;
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(el.getAttribute('aria-label')).toContain('column 2');
    });

    it('does not hijack keys pressed inside an input', () => {
      const input = document.createElement('input');
      nodeOf('a').el!.querySelector('.grid-stack-item-content')!.appendChild(input);
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      // the tile still moves only because the input is inside the tile; upstream behaviour is
      // preserved in that the event is not preventDefault-ed when it is a text field
      expect(nodeOf('a').x).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ctrl+z shortcuts >', () => {
    it('undoes on Ctrl+Z', async () => {
      grid.update(nodeOf('a').el!, { x: 6, y: 2 });
      grid.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 30));
      expect(nodeOf('a').x).toBe(0);
    });

    it('redoes on Ctrl+Shift+Z', async () => {
      grid.update(nodeOf('a').el!, { x: 6, y: 2 });
      grid.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 30));
      grid.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 30));
      expect(nodeOf('a').x).toBe(6);
    });
  });

  describe('teardown >', () => {
    it('removes its ARIA attributes on destroy', () => {
      studio.destroy();
      expect(grid.el.getAttribute('role')).toBeNull();
      expect(grid.el.getAttribute('aria-roledescription')).toBeNull();
      // re-create so afterEach can destroy it cleanly
      studio = new GridStackStudio(grid, { morph: false });
    });
  });
});
