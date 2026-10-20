/**
 * dd-resizable-handle.ts 14.0.0
 * Copyright (c) 2021-2025  Alain Dumesny - see GridStack root license
 */
import { GridItemHTMLElement } from './gridstack';
export interface DDResizableHandleOpt {
    element?: string | HTMLElement;
    start?: (event: MouseEvent) => void;
    move?: (event: MouseEvent) => void;
    stop?: (event: MouseEvent) => void;
}
export declare class DDResizableHandle {
    protected host: GridItemHTMLElement;
    protected dir: string;
    protected option: DDResizableHandleOpt;
    /** @internal */
    protected el: HTMLElement;
    /** @internal true after we've moved enough pixels to start a resize */
    protected moving?: boolean;
    /** @internal set on mousedown, cleared on mouseup */
    protected mouseDownEvent?: MouseEvent;
    /** @internal */
    protected static prefix: string;
    constructor(host: GridItemHTMLElement, dir: string, option: DDResizableHandleOpt);
    /** @internal */
    protected _init(): DDResizableHandle;
    /** call this when resize handle needs to be removed and cleaned up */
    destroy(): DDResizableHandle;
    /** @internal called on mouse down on us: capture move on the entire document (mouse might not stay on us) until we release the mouse */
    protected _mouseDown(e: MouseEvent): void;
    /** @internal */
    protected _mouseMove(e: MouseEvent): void;
    /** @internal */
    protected _mouseUp(e: MouseEvent): void;
    /** @internal call when keys are being pressed - use Esc to cancel */
    protected _keyEvent(e: KeyboardEvent): void;
    /** @internal */
    protected _triggerEvent(name: string, event: MouseEvent): DDResizableHandle;
}
