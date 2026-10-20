/**
 * studio/register.ts
 * Attaches the studio entry points to the GridStack class itself.
 *
 * NEW IN THIS FORK. Why this file exists:
 *  - The UMD bundle is built with `libraryExport: 'GridStack'`, so `window.GridStack` is the
 *    class, not a module namespace. Without this, a plain <script> tag could not reach the
 *    studio at all and every demo would need a bundler.
 *  - Import order matters: `studio/*` imports `GridStack` back, so this must run only after the
 *    class binding is initialised. `registerStudio()` is therefore called at the very bottom of
 *    gridstack.ts rather than on module evaluation here.
 */
import { GridStack } from '../gridstack';
import { GridStackStudio, measure, planLayout } from './studio';

let done = false;

/** Idempotent: safe to call more than once (register.ts may be pulled in from several paths). */
export function registerStudio(): void {
  if (done) return;
  done = true;
  Object.assign(GridStack, {
    Studio: GridStackStudio,
    planLayout,
    measureLayout: measure,
  });
}
