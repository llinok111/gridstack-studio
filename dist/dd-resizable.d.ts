/**
 * dd-resizable.ts 14.0.0
 * Copyright (c) 2021-2025  Alain Dumesny - see GridStack root license
 */
import { DDResizableHandle } from './dd-resizable-handle';
import { DDBaseImplement, HTMLElementExtendOpt } from './dd-base-impl';
import { DDResizeOpt, DDUIData, GridItemHTMLElement, Size } from './types';
export interface DDResizableOpt extends DDResizeOpt {
    maxHeight?: number;
    maxHeightMoveUp?: number;
    maxWidth?: number;
    maxWidthMoveLeft?: number;
    minHeight?: number;
    minWidth?: number;
    start?: (event: Event, ui: DDUIData) => void;
    stop?: (event: Event) => void;
    resize?: (event: Event, ui: DDUIData) => void;
    rtl?: boolean;
}
interface RectScaleReciprocal {
    x: number;
    y: number;
}
interface TemporalRect {
    width: number;
    height: number;
    left: number;
    right: number;
    top: number;
}
export declare class DDResizable extends DDBaseImplement implements HTMLElementExtendOpt<DDResizableOpt> {
    el: GridItemHTMLElement;
    option: DDResizableOpt;
    /** @internal */
    /** @internal set in _setupHandlers(), cleared in _removeHandlers() */
    protected handlers?: DDResizableHandle[];
    /** @internal set in _resizeStart, cleared in _resizeStop */
    protected originalRect?: DOMRectReadOnly;
    /** @internal */
    protected rectScale: RectScaleReciprocal;
    /** @internal set in _resizing, cleared in _resizeStop */
    protected temporalRect?: TemporalRect;
    /** @internal set in _resizeStart, cleared in _resizeStop */
    protected scrollY?: number;
    /** @internal set in _resizeStart, cleared in _resizeStop */
    protected scrolled?: number;
    /** @internal */
    protected scrollEl: HTMLElement;
    /** @internal set in _resizeStart, cleared in _resizeStop */
    protected startEvent?: MouseEvent;
    /** @internal value saved in the same order as _originStyleProp[] */
    protected elOriginStyleVal: string[];
    /** @internal */
    protected parentOriginStylePosition: string;
    /** @internal */
    protected static _originStyleProp: string[];
    /** @internal */
    protected sizeToContent: boolean;
    constructor(el: GridItemHTMLElement, option?: DDResizableOpt);
    on(event: 'resizestart' | 'resize' | 'resizestop', callback: (event: DragEvent) => void): void;
    off(event: 'resizestart' | 'resize' | 'resizestop'): void;
    enable(): void;
    disable(): void;
    destroy(): void;
    updateOption(opts: DDResizableOpt): DDResizable;
    /** @internal turns auto hide on/off */
    protected _setupAutoHide(auto: boolean): DDResizable;
    /** @internal */
    protected _mouseOver(e: Event): void;
    /** @internal */
    protected _mouseOut(e: Event): void;
    /** @internal */
    protected _setupHandlers(): DDResizable;
    /** @internal */
    protected _resizeStart(event: MouseEvent): DDResizable;
    /** @internal */
    protected _resizing(event: MouseEvent, dir: string): DDResizable;
    /** @internal */
    protected _resizeStop(event: MouseEvent): DDResizable;
    /** @internal */
    protected _setupHelper(): DDResizable;
    /** @internal */
    protected _cleanHelper(): DDResizable;
    /** @internal */
    protected _getChange(event: MouseEvent, dir: string): TemporalRect;
    /** @internal constrain the size to the set min/max values */
    protected _constrainSize(oWidth: number, oHeight: number, moveLeft: boolean, moveUp: boolean): Size;
    /** @internal */
    protected _applyChange(): DDResizable;
    /** @internal */
    protected _removeHandlers(): DDResizable;
    /** @internal */
    protected _ui: () => DDUIData;
}
export {};
