# GridStack Studio — technical notes

Everything below was measured on this machine, with the commands shown. Numbers are copied
from actual output, not estimated.

## 1. Environment

| | |
|---|---|
| OS | Windows 10.0.26300 |
| Node | v22.22.2 |
| npm | 10.9.7 (dependencies installed with `yarn 1.22.22 --frozen-lockfile`) |
| Browser (verification) | Chromium 156.0.8078.4, Playwright 1.54.2, headless |
| Viewport for perf numbers | 1440×1000, `deviceScaleFactor: 1` |

## 2. Test results

### Unit + integration (jsdom)

```
$ npx vitest run
Test Files  15 passed (15)
     Tests  508 passed (508)
```

Breakdown:

| Suite | Tests | Origin |
|---|---|---|
| Upstream suites (`gridstack-spec`, `regression-spec`, `dd-*`, `utils-spec`, `gridstack-engine-spec`) | 444 | **unmodified upstream** |
| `spec/studio-layout-solver-spec.ts` | 25 | new |
| `spec/studio-history-spec.ts` | 14 | new |
| `spec/studio-integration-spec.ts` | 27 | new |

The 444 upstream tests passing without edits is the main regression guarantee: the studio layer
does not alter engine behaviour.

### Real-browser acceptance

```
$ node tools/verify.mjs
35/35 checks passed
```

Covered behaviours (each is a separate assertion):

| Area | What is actually verified |
|---|---|
| Boot | 8 tiles render; `role="application"` on the container; `role="group"` + `aria-roledescription="tile"` per tile; label contains the 1-based row/column |
| Text layout | no tile figure is geometrically clipped out of its content box, at 1440 / 1024 / 768 / 390 px |
| Movement | a moved tile's **pixel** rect changes (not just the model), `dx=-685 dy=296` in the observed run |
| Undo | restores both the model coordinates and the pixels |
| Coalescing | a burst of 3 same-kind edits produces exactly **one** undo step, and one undo reverts all 3 |
| Redo | re-applies the burst |
| Align | no tiles lost, row count never increases, **no two tiles overlap** afterwards |
| DOM hygiene | no duplicate `gs-id` elements (a real bug found during development: `removeAll(false)` left orphan nodes) |
| Keyboard | `ArrowRight` moves one cell; `Ctrl+ArrowRight` widens by one; focus ring computed as `solid 3px` |
| Live region | receives a human-readable announcement after a keyboard edit |
| Responsive | no horizontal overflow at 1024/768/390; grid collapses to 1 column at 390; **desktop layout restored exactly** after a 1440→390→1440 round-trip |
| Reduced motion | `matchMedia` preference detected; alignment still completes (178 ms wall clock) |
| Errors | zero uncaught page errors across the whole run |

## 3. Performance

### Solver and apply, 60 tiles

Board: 60 tiles of 3×1 on 12 columns, laid out with one empty row between bands (30 rows of
content) so the solver has real work to do. Measured with morph disabled, to isolate solver +
DOM writes.

| Metric | Result |
|---|---|
| `plan('seam')` | **1.3 – 2.4 ms** (observed range over runs) |
| `applyPlan()` (no morph) | **9.0 – 23.4 ms** |
| Tiles moved | 56 of 60 |
| Rows before → after | 30 → 15 |

### Frame timing during the morph

Measured with a `requestAnimationFrame` gap sampler across the whole apply, then sorted.

| Run | Samples | avg | p50 | p95 | max | long tasks (>50 ms) |
|---|---|---|---|---|---|---|
| 1 | 73 | 6.9 ms | 7.0 ms | 7.4 ms | 16.7 ms | 0 |
| 2 | 71 | 7.1 ms | 7.0 ms | 7.8 ms | 20.9 ms | 0 |
| 3 | 74 | 6.9 ms | 7.0 ms | 7.4 ms | 7.9 ms | 0 |

At 60 fps the frame budget is 16.7 ms. p95 of ~7.5 ms leaves roughly half the budget free, so
the animation is not the bottleneck; the remaining cost is the browser's own compositing of 60
transformed layers.

### A performance bug that was found and fixed

The first `morph()` implementation attached a per-element `setTimeout(duration + 120)` as a
safety net for elements whose `transitionend` never fires. On a 60-tile board only 40 of 56
transitions fired the event, so 16 elements each waited out their own timeout and the returned
promise resolved ~430 ms late. Replaced with a **single deadline** for the whole gesture
(`max(duration) + 90 ms`) plus a settled flag. Result: 430 ms → 326 ms, and `transitionend`
now arrives for 56/56 elements.

The duration cap was also tightened from `1.6×` to `1.15×` the base: a far-travelling tile was
running ~416 ms, which made a 60-tile align feel sluggish.

## 4. The layout solver: what was tried and rejected

The `seam` strategy went through six implementations. Each was measured against the demo board
before being discarded; the rejected ones are documented in the source so they are not
re-attempted.

| # | Approach | Result on a scrambled 8-tile board | Verdict |
|---|---|---|---|
| a | gravity only | 9 rows → 9 rows | too weak |
| b | free left-slide | collapses to the left edge, right half empty | visually broken |
| c | slide to nearest left neighbour | same collapse on sparse boards | rejected |
| d | slide into right-bounded pocket | creeps left one pocket at a time, unpredictable | rejected |
| e | pack tiles sharing a *final* row | never fires: gravity leaves every tile on its own row (9 → 9) | rejected |
| f | **shelf reflow in reading order** | **9 rows → 4 rows, occupancy 33 % → 75 %** | **shipped** |

Strategy (f) sorts tiles by `(y, x)` — the order a human reads them — then packs left-to-right,
wrapping only when the current shelf is full. Locked tiles are placed first and act as
obstacles. The guarantee it provides over upstream `compact()` is *order preservation*: tile
*n* is always after tile *n-1* in reading order, which `compact()` does not promise.

## 5. Accessibility decisions

Upstream `TODO.md` proposes `role="grid"` / `role="gridcell"`. This fork deliberately does
**not** do that, and the reason is in the source: a dashboard of free-form 2D tiles is not a
data grid. In an ARIA grid, cells are addressed by (row, column) and must fill the table; a
tile that spans 4 columns and 2 rows and can be dragged anywhere violates that contract, and
screen readers announce misleading structure.

What is implemented instead:

- `role="application"` on the container with `aria-roledescription="dashboard grid"`, so the
  screen reader hands arrow keys to the widget rather than staying in browse mode.
- Each tile is `role="group"` + `aria-roledescription="tile"`, with an `aria-label` that
  carries the human position, e.g.
  `Revenue: row 1 column 1, 4 wide by 2 tall, last row 2`.
- **Roving tabindex**: exactly one tile has `tabindex="0"` at any time, the rest `-1`. Without
  this the grid is a keyboard dead end — nothing is reachable with Tab. (This was a real bug
  caught by a test: the first implementation set every tile to `-1`.)
- A visually hidden `role="status" aria-live="polite"` region announces every change.
- `aria-grabbed` while the tile is in grab mode (Enter/Space), removed on release.

Key map:

| Key | Action |
|---|---|
| Arrow keys | move one cell |
| Shift + arrows | move 4 cells |
| Ctrl/Cmd + arrows | resize one cell |
| Home / End | snap to first / last column |
| PageUp / PageDown | jump to top / bottom row |
| Enter / Space | toggle grab mode |
| Escape | release |
| `R` | rotate (swap w/h) when geometry allows |
| Delete / Backspace | remove, **only** when `allowRemove` is explicitly enabled |
| Tab / Shift+Tab | move between tiles in visual order |
| Ctrl+Z / Ctrl+Shift+Z | undo / redo |

Destructive keys are opt-in on purpose: a stray Delete must not delete a dashboard.

## 6. Known limitations

- Undo is **layout-only**. It restores positions, sizes and membership, but not the HTML content
  of a tile that was removed and re-added — the element is recreated empty unless the caller
  supplies a `renderCB`. This is stated here rather than papered over.
- `history` keeps the last 60 steps by default; a very large dashboard (hundreds of tiles) will
  hold a few hundred KB of snapshots. The limit is configurable.
- The morph uses `transform`, so it does not play well with tiles that already have a transform
  of their own (upstream's `grid-stack-animate` class does the same thing via `left/top`, so
  they are alternatives, not complements).
- The a11y layer reads `grid.engine.nodes`, which is public in practice (upstream's own demos
  use it) but is not part of the documented API surface.
- `pack` can produce a different arrangement on ties; it is deterministic for a given input, but
  not stable across versions if the sort keys change.

## 7. Reproducing

```bash
yarn install --frozen-lockfile    # or: npm install --legacy-peer-deps
npx vitest run                    # 508 tests
npx grunt && npx webpack          # rebuild dist/
node tools/verify.mjs             # 35 browser checks + screenshots in shots/
```

`tools/verify.mjs` launches Chromium via Playwright. On a machine where the bundled browser
revision is missing, set `PW_CHROME` to an existing `chrome.exe` path.
