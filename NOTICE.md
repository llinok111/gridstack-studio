# NOTICE

This repository is a **fork** of [gridstack.js](https://github.com/gridstack/gridstack.js).
It is not a rewrite: the upstream engine, drag & drop layer, CSS and framework wrappers are
unmodified, and the upstream test suite runs unchanged.

## Upstream

| | |
|---|---|
| Project | gridstack.js |
| Repository | https://github.com/gridstack/gridstack.js |
| Version forked from | **14.0.0** |
| Commit forked from | `7ce6c7d9363dabe8fb83b02556fd529c3c9e502b` (2026-10-13) |
| Author | Alain Dumesny, with earlier work by Pavel Reznikov and Dylan Weiss |
| License | MIT — see [`LICENSE`](LICENSE), reproduced verbatim |
| Copyright | Copyright (c) 2019-2025 Alain Dumesny. v0.4.0 and older (c) 2014-2018 Pavel Reznikov, Dylan Weiss |

The full upstream commit history (3 619 commits) is preserved on this branch. Upstream is
credited in every file header that was derived from it, and in the package metadata.

## What this fork adds

All additions live in **`src/studio/`** plus small, additive touch points listed below.
Nothing upstream was deleted or rewritten.

### New files (original work, MIT, © 2026 the contributors of this fork)

| File | Purpose |
|---|---|
| `src/studio/layout-solver.ts` | Pure layout planner: three strategies (`compact`, `seam`, `pack`) producing a *plan* (list of moves) plus before/after metrics, without mutating anything. |
| `src/studio/history.ts` | Snapshot-based undo/redo with coalescing of consecutive same-kind edits and a bounded stack. |
| `src/studio/morph.ts` | FLIP-based transition runner for programmatic layout changes; honours `prefers-reduced-motion` and resolves when the last tile lands. |
| `src/studio/a11y.ts` | Keyboard interaction (arrows / Ctrl+arrows / Home / End / PageUp / PageDown / Enter / Esc / R / Delete) and ARIA semantics (`role="application"` + roving tabindex + per-tile `role="group"` with positional labels) plus a polite live region. |
| `src/studio/studio.ts` | `GridStackStudio` facade wiring the four modules above onto a `GridStack` instance through its public API. |
| `src/studio/register.ts` | Attaches `GridStack.Studio` / `GridStack.planLayout` / `GridStack.measureLayout` so the UMD build is usable from a plain `<script>` tag. |
| `src/studio/types.ts` | Types for the studio layer. |
| `demo/studio.html` | Self-contained demo dashboard (no build step, no CDN). |
| `tools/verify.mjs` | Real-browser acceptance harness (Playwright/Chromium): 35 behavioural checks, frame timing, responsive round-trip, screenshots. |
| `spec/studio-*.ts` | 64 new unit/integration tests. |

### Modified upstream files (additive only)

| File | Change |
|---|---|
| `src/gridstack.ts` | Re-exports the studio layer, and calls `registerStudio()` once at the bottom of the module. No existing statement was changed. |
| `src/gridstack.scss` | Appends a clearly-marked block: a visually-hidden live-region class, `:focus-visible` styling for tiles, a `[aria-grabbed]` outline, a `prefers-reduced-motion` override for the upstream `grid-stack-animate` class, and `touch-action` for keyboard-operable tiles. No upstream selector is modified. |
| `.gitignore` | `dist/` is committed deliberately so the demo opens from a fresh clone. |
| `.gitattributes` | New; keeps line endings stable so byte-sensitive tests do not break per platform. |

### Rationale

Upstream's own `TODO.md` lists, as unfinished work:

- *"Accessibility (ARIA) support — Grid items are plain `<div>` elements with no ARIA roles or
  keyboard interaction, making the library unusable for accessibility-sensitive dashboards."*
- A history/undo layer (absent entirely: `grep -rn "undo\|redo\|history" src/` returns nothing).
- Motion handling that respects `prefers-reduced-motion` (never checked upstream).

This fork implements those three items and adds a fourth that upstream has no equivalent for:
non-destructive layout *planning* with a strategy that preserves reading order.

## Licence of the additions

The additions are released under the same MIT licence as upstream, so the whole repository is
MIT. See [`LICENSE`](LICENSE). The upstream copyright notice is retained in full; the new work
does not alter or remove it.
