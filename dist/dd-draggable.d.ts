/**
 * dd-draggable.ts 14.0.0
 * Copyright (c) 2021-2025  Alain Dumesny - see GridStack root license
 */
import { DragTransform } from './utils';
import { DDBaseImplement, HTMLElementExtendOpt } from './dd-base-impl';
import { GridItemHTMLElement, DDUIData, DDDragOpt } from './types';
interface DragOffset {
    x: number;
    top: number;
    width: number;
    height: number;
    offsetX: number;
    offsetTop: number;
}
type DDDragEvent = 'drag' | 'dragstart' | 'dragstop';
export declare class DDDraggable extends DDBaseImplement implements HTMLElementExtendOpt<DDDragOpt> {
    el: GridItemHTMLElement;
    option: DDDragOpt;
    /** @internal set during drag start, cleared on drag stop; also used by GridStackDDNative */
    helper?: HTMLElement;
    /** @internal set during mousedown, cleared on mouseup */
    protected mouseDownEvent?: MouseEvent;
    /** @internal */
    protected dragOffset: DragOffset;
    /** @internal set during drag start, cleared on drag stop */
    protected dragElementOriginStyle?: Array<string>;
    /** @internal */
    protected dragEls: HTMLElement[];
    /** @internal true while we are dragging an item around */
    dragging?: boolean;
    /** @internal last drag event */
    lastDrag: MouseEvent;
    /** @internal */
    protected parentOriginStylePosition: string;
    /** @internal */
    protected helperContainment: HTMLElement;
    /** @internal properties we change during dragging, and restore back */
    protected static originStyleProp: string[];
    /** @internal pause before we call the actual drag hit collision code */
    protected dragTimeout?: number;
    /** @internal */
    protected dragTransform: DragTransform;
    /** @internal element we bound the touch handlers to in _mouseDown(), so _mouseUp() can un-bind the same one */
    protected _touchTarget?: HTMLElement;
    /** @internal how far the helper's containing block has slid since dragstart.
     * A transform on an ancestor makes IT - not the viewport - the containing block for our
     * position:fixed helper, so the left/top we write are relative to that element, and it scrolls
     * away from where we measured it at dragstart, drifting the helper off the cursor (#2728).
     * With no transform the probe below always reads (0,0) so this stays zero and nothing changes. */
    protected _cbDrift: {
        dx: number;
        dy: number;
    };
    /** @internal auto-scroll animation variables */
    protected _autoScrollAnimId?: number;
    protected _autoScrollContainer?: HTMLElement;
    protected _autoScrollMaxSpeed?: number;
    /** @internal auto-scroll trigger band: cursor within this fraction of the visible scroll height from an
     * edge starts scrolling, with a px floor so short containers still trigger. See _getScrollAmount() #3356 */
    protected static autoScrollBand: number;
    protected static autoScrollBandMin: number;
    /** @internal min fraction of max speed when the cursor just enters the band, ramping to full at the edge #3356 */
    protected static autoScrollMinRatio: number;
    /** @internal px the cursor must have moved toward an edge (from where the drag started) before auto-scroll
     * STARTS - unless it's already this close to the edge (or past it). So sitting in the band, or sliding
     * sideways along it, with a clipped item doesn't scroll - only heading for that edge does #3356 */
    protected static autoScrollStartMove: number;
    constructor(el: GridItemHTMLElement, option?: DDDragOpt);
    /** return all handles omitting other nested `.grid-stack-item` children (in case node.subGrid isn't set for some reason) */
    protected getAllHandles(): HTMLElement[];
    on(event: DDDragEvent, callback: (event: MouseEvent) => void): void;
    off(event: DDDragEvent): void;
    enable(): void;
    disable(forDestroy?: boolean): void;
    destroy(): void;
    updateOption(opts: DDDragOpt): DDDraggable;
    /**
     * Re-scans the item element for drag-handle elements after delayed content (React portal,
     * Angular component, etc.) has been rendered into the item.  Removes listeners from the
     * previous handle set, re-queries, then re-attaches.
     * Not needed for the default `.grid-stack-item-content` handle which is always present.
     */
    refreshHandles(): void;
    /** @internal does any element on the event's path match the selector?
     * Same walk as `e.target.closest(sel)` but through shadow DOM: for a listener outside the shadow
     * tree the browser retargets `e.target` to the *host*, and `closest()` won't cross the boundary
     * either, so a `cancel` selector living inside a web component could never match (#2729). */
    protected _matchInPath(e: Event, selector: string): HTMLElement | undefined;
    /** @internal call when mouse goes down before a dragstart happens */
    protected _mouseDown(e: MouseEvent): boolean;
    /** @internal method to call actual drag event */
    _callDrag(e: MouseEvent): void;
    /** @internal called when the main page (after successful mousedown) receives a move event to drag the item around the screen */
    protected _mouseMove(e: MouseEvent): boolean;
    /** @internal call when the mouse gets released to drop the item at current location */
    protected _mouseUp(e: MouseEvent): void;
    /** @internal call when keys are being pressed - use Esc to cancel, R to rotate */
    protected _keyEvent(e: KeyboardEvent): void;
    /** @internal create a clone copy (or user defined method) of the original drag item if set */
    protected _createHelper(): HTMLElement;
    /** @internal set the fix position of the dragged item */
    protected _setupHelperStyle(e: MouseEvent): DDDraggable;
    /** @internal restore back the original style before dragging */
    protected _removeHelperStyle(): DDDraggable;
    /** @internal re-probe where our containing block now sits and record how far it moved since dragstart,
     * then re-place the helper right away rather than waiting for the next mouse move. */
    protected _updateCBDrift: () => void;
    /** @internal updates the top/left position to follow the mouse */
    _dragFollow(e: MouseEvent): void;
    /** @internal */
    protected _setupHelperContainmentStyle(): DDDraggable;
    /** @internal */
    protected _getDragOffset(event: MouseEvent, el: HTMLElement, parent: HTMLElement): DragOffset;
    /** @internal starts or continues auto-scroll when the cursor nears a scroll edge during a drag.
     * Takes the grid's own element to find the scroll container so external/sidebar drags work too (#2074). */
    updateScrollPosition(gridEl: HTMLElement): void;
    /** @internal start/stop auto-scroll of _autoScrollContainer for the current cursor position */
    protected _checkAutoScroll(): void;
    /** @internal V edges (viewport coords) of the scroll container that are actually on screen - what's really
     * visible, NOT window.innerHeight which sits under iOS's overlaying tool bars (#2666) */
    protected _scrollEdges(scrollEl: HTMLElement): {
        top: number;
        bottom: number;
    };
    /** @internal how many px to scroll this frame based on the CURSOR: negative = up, positive = down, 0 = don't scroll.
     * We trigger off the cursor nearing an edge (intentional - the user is driving toward it) rather than the dragged
     * box touching it: an item taller than the view overhangs both edges for the whole drag and would scroll non-stop
     * (#3356). We still require the item to be clipped on that side so we don't scroll when nothing of it is left to
     * reveal that way. Speed ramps up the closer the cursor gets to the edge, capped at `_autoScrollMaxSpeed`. */
    protected _getScrollAmount(el: HTMLElement, scrollEl: HTMLElement, clientY: number): number;
    /** @internal single tick of the auto-scroll animation loop */
    protected _autoScrollTick: () => void;
    /** @internal stop any active auto-scroll animation */
    _stopScrolling(): void;
    /** @internal TODO: set to public as called by DDDroppable! */
    ui(): DDUIData;
}
export {};
