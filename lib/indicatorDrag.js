import Clutter from 'gi://Clutter';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

/**
 * Makes a tray indicator draggable and exposes the drag delegate that the
 * drop targets use to identify the dragged entry.
 */
export class IndicatorDrag {
    constructor(entry, {onBegin, onEnd}) {
        const {actor, indicator} = entry;
        this._indicator = indicator;
        this._previousDelegate = indicator._delegate ?? null;

        this._delegate = Object.create(this._previousDelegate);
        this._delegate.entry = entry;
        this._delegate.getDragActor = () => {
            const dragActor = new Clutter.Clone({source: actor, reactive: false});
            dragActor.set_size(...actor.get_size());
            return dragActor;
        };
        this._delegate.getDragActorSource = () => actor;
        indicator._delegate = this._delegate;

        this._draggable = DND.makeDraggable(indicator, {restoreOnSuccess: false});
        this._beginId = this._draggable.connect('drag-begin', () => onBegin());
        this._endId = this._draggable.connect('drag-end', () => onEnd());
    }

    disconnect() {
        this._draggable.disconnect(this._beginId);
        this._draggable.disconnect(this._endId);
        if (this._indicator._delegate === this._delegate)
            this._indicator._delegate = this._previousDelegate;
    }
}
