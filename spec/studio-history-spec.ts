/**
 * spec/studio-history-spec.ts
 * Tests for the undo/redo stack (new in this fork).
 */
import { History, SnapshotItem } from '../src/studio/history';

const s = (x: number, y = 0): SnapshotItem[] => [{ id: 'a', x, y, w: 1, h: 1 }];

describe('studio > history >', () => {
  let h: History;

  beforeEach(() => {
    h = new History({ limit: 10, coalesceMs: 0 });
  });

  it('starts empty with nothing to undo or redo', () => {
    h.seed(s(0));
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it('records a change and allows undo', () => {
    h.seed(s(0));
    h.push(s(1), 'drag', 'drag');
    expect(h.canUndo).toBe(true);
    const prev = h.undo();
    expect(prev?.items[0].x).toBe(0);
  });

  it('redo restores the undone state', () => {
    h.seed(s(0));
    h.push(s(1), 'drag', 'drag');
    h.undo();
    expect(h.canRedo).toBe(true);
    const next = h.redo();
    expect(next?.items[0].x).toBe(1);
  });

  it('a new edit clears the redo branch', () => {
    h.seed(s(0));
    h.push(s(1), 'drag', 'drag');
    h.undo();
    h.push(s(5), 'drag', 'drag');
    expect(h.canRedo).toBe(false);
  });

  it('ignores a push that does not change anything', () => {
    h.seed(s(0));
    const stored = h.push(s(0), 'noop', 'drag');
    expect(stored).toBe(false);
    expect(h.canUndo).toBe(false);
  });

  it('caps the stack at the configured limit', () => {
    h.seed(s(0));
    for (let i = 1; i <= 25; i++) h.push(s(i), `move ${i}`, 'drag');
    expect(h.depth).toBe(10);
    // undoing 10 times lands on the oldest retained state, not the seed
    for (let i = 0; i < 10; i++) h.undo();
    expect(h.canUndo).toBe(false);
    expect(h.present?.items[0].x).toBe(15);
  });

  it('returns undefined when undoing past the beginning', () => {
    h.seed(s(0));
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toBeUndefined();
  });

  it('never merges into the baseline snapshot', () => {
    // coalesceMs is huge, but the first edit must still create a real undo step
    const hh = new History({ limit: 10, coalesceMs: 100000 });
    hh.seed(s(0));
    hh.push(s(1), 'nudge', 'keyboard');
    expect(hh.canUndo).toBe(true);
    hh.undo();
    expect(hh.present?.items[0].x).toBe(0);
  });

  describe('coalescing >', () => {
    it('merges consecutive same-kind edits inside the window', () => {
      const hh = new History({ limit: 10, coalesceMs: 100000 });
      hh.seed(s(0));
      hh.push(s(1), 'nudge', 'keyboard');
      hh.push(s(2), 'nudge', 'keyboard');
      hh.push(s(3), 'nudge', 'keyboard');
      // one undo step for the whole burst
      expect(hh.depth).toBe(1);
      hh.undo();
      expect(hh.present?.items[0].x).toBe(0);
    });

    it('does not merge different kinds', () => {
      const hh = new History({ limit: 10, coalesceMs: 100000 });
      hh.seed(s(0));
      hh.push(s(1), 'nudge', 'keyboard');
      hh.push(s(2), 'drag', 'drag');
      expect(hh.depth).toBe(2);
    });

    it('does not merge once the window has passed', () => {
      const hh = new History({ limit: 10, coalesceMs: 0 });
      hh.seed(s(0));
      hh.push(s(1), 'nudge', 'keyboard');
      hh.push(s(2), 'nudge', 'keyboard');
      expect(hh.depth).toBe(2);
    });
  });

  describe('applying guard >', () => {
    it('refuses to record while applying a snapshot', () => {
      h.seed(s(0));
      h.push(s(1), 'drag', 'drag');
      h.applying = true;
      const stored = h.push(s(2), 'echo', 'drag');
      h.applying = false;
      expect(stored).toBe(false);
      expect(h.present?.items[0].x).toBe(1);
    });
  });

  describe('labels >', () => {
    it('exposes the label of the step that undo would revert', () => {
      h.seed(s(0));
      h.push(s(1), 'resize tile-a', 'resize');
      expect(h.undoLabel).toBe('resize tile-a');
      h.undo();
      expect(h.redoLabel).toBe('resize tile-a');
    });
  });

  describe('listeners >', () => {
    it('notifies subscribers on every state change', () => {
      const seen: boolean[] = [];
      h.onChange(st => seen.push(st.canUndo));
      h.seed(s(0));
      h.push(s(1), 'drag', 'drag');
      h.undo();
      expect(seen).toEqual([false, true, false]);
    });
  });
});
