/**
 * spec/studio-layout-solver-spec.ts
 * Tests for the layout planner (new in this fork).
 */
import { measure, planLayout } from '../src/studio/layout-solver';
import { PlanItem } from '../src/studio/types';

const item = (id: string, x: number, y: number, w = 1, h = 1, locked = false): PlanItem => ({ id, x, y, w, h, locked });

describe('studio > layout-solver >', () => {
  describe('measure() >', () => {
    it('reports rows, holes, occupancy and seams for a simple layout', () => {
      // 4 columns, two 2x1 items side by side => 1 row, 0 holes
      const items = [item('a', 0, 0, 2, 1), item('b', 2, 0, 2, 1)];
      const m = measure(items, 4);
      expect(m.rows).toBe(1);
      expect(m.holes).toBe(0);
      expect(m.occupancy).toBe(1);
      expect(m.seams).toBe(0);
    });

    it('counts holes inside the bounding box', () => {
      const items = [item('a', 0, 0, 1, 1), item('b', 3, 0, 1, 1)];
      const m = measure(items, 4);
      expect(m.rows).toBe(1);
      expect(m.holes).toBe(2);
      expect(m.occupancy).toBeCloseTo(0.5);
    });

    it('detects a fully empty column as a seam', () => {
      // column 1 is empty across the only row
      const items = [item('a', 0, 0, 1, 1), item('b', 2, 0, 2, 1)];
      const m = measure(items, 4);
      expect(m.seams).toBe(1);
    });

    it('returns zero metrics for an empty layout', () => {
      const m = measure([], 12);
      expect(m.rows).toBe(0);
      expect(m.holes).toBe(0);
      expect(m.occupancy).toBe(0);
    });
  });

  describe('planLayout() is pure >', () => {
    it('never mutates the input snapshot', () => {
      const items = [item('a', 2, 3, 2, 1), item('b', 0, 5, 2, 1)];
      const copy = JSON.parse(JSON.stringify(items));
      planLayout(items, 4, 'compact');
      expect(items).toEqual(copy);
    });

    it('produces no moves when the layout is already tight', () => {
      const items = [item('a', 0, 0, 2, 1), item('b', 2, 0, 2, 1)];
      const plan = planLayout(items, 4, 'compact');
      expect(plan.moves).toHaveLength(0);
    });
  });

  describe('compact strategy >', () => {
    it('pulls items up and left', () => {
      const items = [item('a', 2, 4, 2, 1)];
      const plan = planLayout(items, 4, 'compact');
      expect(plan.moves).toHaveLength(1);
      expect(plan.moves[0].to).toMatchObject({ x: 0, y: 0 });
      expect(plan.after.rows).toBe(1);
    });

    it('never moves a locked item', () => {
      const items = [item('a', 2, 4, 1, 1, true)];
      const plan = planLayout(items, 4, 'compact');
      expect(plan.moves).toHaveLength(0);
    });

    it('lays items out around a locked obstacle', () => {
      const items = [item('lock', 0, 0, 4, 1, true), item('a', 0, 5, 2, 1)];
      const plan = planLayout(items, 4, 'compact');
      const moved = plan.moves.find(m => m.id === 'a')!;
      expect(moved.to.y).toBe(1); // directly under the locked band, not on top of it
    });

    it('reduces total rows for a sparse layout', () => {
      const items = [
        item('a', 0, 0, 2, 1), item('b', 0, 3, 2, 1), item('c', 2, 5, 2, 1), item('d', 2, 9, 2, 1),
      ];
      const plan = planLayout(items, 4, 'compact');
      expect(plan.after.rows).toBeLessThan(plan.before.rows);
      expect(plan.after.rows).toBe(2);
    });
  });

  describe('seam strategy >', () => {
    it('closes a structural empty column and reduces seam count', () => {
      // col 1 dead, content on both sides, two rows
      const items = [
        item('a', 0, 0, 1, 1), item('b', 2, 0, 2, 1),
        item('c', 0, 1, 1, 1), item('d', 2, 1, 2, 1),
      ];
      const plan = planLayout(items, 4, 'seam');
      expect(plan.before.seams).toBe(1);
      expect(plan.after.seams).toBe(0);
      expect(plan.after.rows).toBe(2);
    });

    it('preserves horizontal order (does not scramble grouping)', () => {
      // 'a' could slide left past nothing, 'b' must stay right of 'a'
      const items = [item('a', 0, 0, 1, 1), item('b', 2, 0, 1, 1)];
      const plan = planLayout(items, 4, 'seam');
      const movedB = plan.moves.find(m => m.id === 'b')!;
      expect(movedB.to.x).toBe(1); // shifted exactly one left, not more
      expect(plan.moves.find(m => m.id === 'a')).toBeUndefined();
    });

    it('leaves an unclosable seam alone rather than overlapping', () => {
      // a locked item at x=1 blocks the shift of 'b'
      const items = [item('lock', 1, 1, 1, 1, true), item('a', 0, 0, 1, 1), item('b', 2, 0, 1, 1)];
      const plan = planLayout(items, 4, 'seam');
      // must not produce an overlapping result
      const final = [...items].map(it => ({ ...it }));
      plan.moves.forEach(m => { const t = final.find(f => f.id === m.id)!; t.x = m.to.x; t.y = m.to.y; });
      for (let i = 0; i < final.length; i++) {
        for (let j = i + 1; j < final.length; j++) {
          const a = final[i], b = final[j];
          const overlap = !(a.y >= b.y + b.h || a.y + a.h <= b.y || a.x >= b.x + b.w || a.x + a.w <= b.x);
          expect(overlap).toBe(false);
        }
      }
    });

    it('compacts a diagonally scrambled board (no fully-dead column exists)', () => {
      // This is the realistic "tidy up my dashboard" case: every tile is offset by one column,
      // so no column is empty across the full height. A column-only solver finds nothing here
      // and leaves the board untouched - which is exactly the bug this test guards.
      const items = [
        item('a', 0, 0, 2, 1),
        item('b', 2, 2, 2, 1),
        item('c', 4, 4, 2, 1),
        item('d', 6, 6, 2, 1),
      ];
      const plan = planLayout(items, 12, 'seam');
      expect(plan.moves.length).toBeGreaterThan(0);
      expect(plan.after.rows).toBeLessThan(plan.before.rows);
      // reading order must survive: a still left of b, b left of c, c left of d
      const final = [...items].map(it => ({ ...it }));
      plan.moves.forEach(m => { const t = final.find(f => f.id === m.id)!; t.x = m.to.x; t.y = m.to.y; });
      const xs = ['a', 'b', 'c', 'd'].map(id => final.find(f => f.id === id)!.x);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    });

    it('closes a structural seam by shifting whole columns, preserving relative order', () => {
      // x=2 is dead across the full height and has content on both sides
      const items = [
        item('a', 0, 0, 1, 2), item('b', 1, 0, 1, 2),
        item('c', 3, 0, 1, 2), item('d', 4, 0, 1, 2),
      ];
      const plan = planLayout(items, 6, 'seam');
      const final = [...items].map(it => ({ ...it }));
      plan.moves.forEach(m => { const t = final.find(f => f.id === m.id)!; t.x = m.to.x; t.y = m.to.y; });
      // the gap closed: nothing sits at x >= 2 while x=2 is empty
      const xs = final.map(f => f.x).sort((p, q) => p - q);
      expect(xs).toEqual([0, 1, 2, 3]);
      // relative left-to-right order preserved
      expect(final.find(f => f.id === 'c')!.x).toBeGreaterThan(final.find(f => f.id === 'b')!.x);
    });

    it('preserves reading order for every tile (the core seam guarantee)', () => {
      const items = [
        item('a', 6, 0, 2, 1), item('b', 8, 2, 2, 1), item('c', 1, 4, 2, 1),
      ];
      const order = [...items].sort((p, q) => p.y - q.y || p.x - q.x).map(i => i.id);
      const plan = planLayout(items, 12, 'seam');
      const final = [...items].map(it => ({ ...it }));
      plan.moves.forEach(m => { const t = final.find(f => f.id === m.id)!; t.x = m.to.x; t.y = m.to.y; });
      const after = [...final].sort((p, q) => p.y - q.y || p.x - q.x).map(i => i.id);
      expect(after).toEqual(order);
    });

    it('produces a tight layout from a scattered one', () => {
      const items = [item('a', 6, 0, 2, 1), item('b', 8, 2, 2, 1)];
      const plan = planLayout(items, 12, 'seam');
      // both 2-wide tiles on 12 columns fit on one shelf
      expect(plan.after.rows).toBe(1);
      const final = [...items].map(it => ({ ...it }));
      plan.moves.forEach(m => { const t = final.find(f => f.id === m.id)!; t.x = m.to.x; t.y = m.to.y; });
      expect(final.find(f => f.id === 'a')!.x).toBe(0);
      expect(final.find(f => f.id === 'b')!.x).toBe(2);
    });

    it('still never lets a tile jump ahead of one that started to its left', () => {
      const items = [item('left', 1, 2, 1, 1), item('right', 3, 2, 1, 1)];
      const plan = planLayout(items, 4, 'seam');
      const final = [...items].map(it => ({ ...it }));
      plan.moves.forEach(m => { const t = final.find(f => f.id === m.id)!; t.x = m.to.x; t.y = m.to.y; });
      const l = final.find(f => f.id === 'left')!;
      const r = final.find(f => f.id === 'right')!;
      expect(r.x).toBeGreaterThan(l.x); // relative order preserved
    });
  });

  describe('pack strategy >', () => {
    it('packs a mixed-size set into the fewest rows', () => {
      const items = [
        item('big', 0, 6, 4, 2), item('s1', 0, 0, 1, 1), item('s2', 1, 0, 1, 1),
        item('s3', 2, 0, 1, 1), item('s4', 3, 0, 1, 1),
      ];
      const plan = planLayout(items, 4, 'pack');
      // 4x2 + four 1x1 = 12 cells; 4 columns => minimum 3 rows
      expect(plan.after.rows).toBe(3);
      expect(plan.after.holes).toBe(0);
    });

    it('keeps locked items as obstacles', () => {
      const items = [item('lock', 0, 0, 2, 2, true), item('a', 2, 0, 2, 1)];
      const plan = planLayout(items, 4, 'pack');
      // the locked tile must never appear in the move list
      expect(plan.moves.find(m => m.id === 'lock')).toBeUndefined();
      // 'a' already sits in the only spot beside the locked block, so no move is needed
      expect(plan.moves).toHaveLength(0);
      expect(plan.after.rows).toBe(2);
    });
  });

  describe('safety >', () => {
    it('never places an item outside the column count', () => {
      const items = [item('a', 0, 0, 4, 1), item('b', 0, 1, 4, 1), item('c', 0, 2, 3, 1)];
      for (const strategy of ['compact', 'seam', 'pack'] as const) {
        const plan = planLayout(items, 4, strategy);
        plan.moves.forEach(m => {
          expect(m.to.x).toBeGreaterThanOrEqual(0);
          expect(m.to.x + m.to.w).toBeLessThanOrEqual(4);
          expect(m.to.y).toBeGreaterThanOrEqual(0);
        });
      }
    });

    it('handles a single-column grid without looping', () => {
      const items = [item('a', 0, 0, 1, 1), item('b', 0, 3, 1, 1)];
      const plan = planLayout(items, 1, 'seam');
      expect(plan.after.rows).toBe(2);
    });

    it('is deterministic across repeated calls', () => {
      const items = [item('a', 1, 4, 2, 1), item('b', 0, 2, 2, 1), item('c', 2, 7, 2, 1)];
      const p1 = planLayout(items, 4, 'pack');
      const p2 = planLayout(items, 4, 'pack');
      expect(p1.moves).toEqual(p2.moves);
    });
  });
});
