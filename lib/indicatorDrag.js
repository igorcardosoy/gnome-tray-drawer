import Clutter from 'gi://Clutter';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

const DRAG_STATE_KEY = '_trayDrawerDragState';

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

        // A Draggable keeps handlers attached to the indicator actor for as
        // long as the actor lives, so it is created once and reused on every
        // enable cycle instead of accumulating handlers.
        let state = indicator[DRAG_STATE_KEY];
        if (!state) {
            const actionsBefore = new Set(indicator.get_actions());
            const draggable = DND.makeDraggable(indicator, {restoreOnSuccess: false});
            // GNOME Shell 49 and later add a DndStartGesture action that can be
            // detached while the extension is disabled. Older versions attach
            // event handlers directly and have no action to detach.
            state = {
                draggable,
                action: indicator.get_actions()
                    .find(action => !actionsBefore.has(action)) ?? null,
            };
            indicator[DRAG_STATE_KEY] = state;
        } else if (state.action) {
            indicator.add_action(state.action);
        }

        this._state = state;
        this._draggable = state.draggable;
        this._beginId = this._draggable.connect('drag-begin', () => onBegin());
        this._endId = this._draggable.connect('drag-end', () => onEnd());
    }

    disconnect() {
        this._draggable.disconnect(this._beginId);
        this._draggable.disconnect(this._endId);
        if (this._state.action)
            this._indicator.remove_action(this._state.action);
        if (this._indicator._delegate === this._delegate)
            this._indicator._delegate = this._previousDelegate;
    }
}
