/**
 * dd-droppable.ts 14.0.0
 * Copyright (c) 2021-2025  Alain Dumesny - see GridStack root license
 */
import { DDDraggable } from './dd-draggable';
import { DDBaseImplement, HTMLElementExtendOpt } from './dd-base-impl';
import { DDUIData } from './types';
export interface DDDroppableOpt {
    accept?: string | ((el: HTMLElement) => boolean);
    drop?: (event: DragEvent, ui: DDUIData) => void;
    over?: (event: DragEvent, ui: DDUIData) => void;
    out?: (event: DragEvent, ui: DDUIData) => void;
}
export declare class DDDroppable extends DDBaseImplement implements HTMLElementExtendOpt<DDDroppableOpt> {
    el: HTMLElement;
    option: DDDroppableOpt;
    accept: (el: HTMLElement) => boolean;
    protected eventEl: HTMLElement;
    constructor(el: HTMLElement, option?: DDDroppableOpt);
    on(event: 'drop' | 'dropover' | 'dropout', callback: (event: DragEvent) => void): void;
    off(event: 'drop' | 'dropover' | 'dropout'): void;
    enable(): void;
    disable(forDestroy?: boolean): void;
    destroy(): void;
    updateOption(opts: DDDroppableOpt): DDDroppable;
    /** @internal called when the cursor enters our area - prepare for a possible drop and track leaving */
    protected _mouseEnter(e: MouseEvent): void;
    /** @internal called when the item is leaving our area, stop tracking if we had moving item */
    protected _mouseLeave(e: MouseEvent, calledByEnter?: boolean): void;
    /** item is being dropped on us - called by the drag mouseup handler - this calls the client drop event */
    drop(e: MouseEvent): void;
    /** @internal true if element matches the string/method accept option */
    protected _canDrop(el: HTMLElement): boolean;
    /** @internal */
    protected _setupAccept(): DDDroppable;
    /** @internal */
    protected _ui(drag: DDDraggable): DDUIData;
}
