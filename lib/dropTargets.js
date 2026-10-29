import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

/**
 * Wraps the drag-and-drop delegate of actors so that a drop can be
 * handled by this extension and everything else is forwarded to the
 * delegate that was installed before.
 */
export class DropTargetRegistry {
    constructor() {
        this._targets = [];
    }

    /**
     * @param {Clutter.Actor} actor
     * @param {{accepts: Function, drop: Function}} handlers
     *   accepts(source, x, y) -> boolean, drop(source, x, y) performs the drop.
     */
    install(actor, {accepts, drop}) {
        const previousDelegate = actor._delegate ?? null;
        const delegate = Object.create(previousDelegate);

        delegate.handleDragOver = (source, dragActor, x, y, time) => {
            if (accepts(source, x, y))
                return DND.DragMotionResult.MOVE_DROP;

            return previousDelegate?.handleDragOver?.call(
                previousDelegate, source, dragActor, x, y, time) ??
                DND.DragMotionResult.CONTINUE;
        };

        delegate.acceptDrop = (source, dragActor, x, y, time) => {
            if (accepts(source, x, y)) {
                drop(source, x, y);
                return true;
            }

            return previousDelegate?.acceptDrop?.call(
                previousDelegate, source, dragActor, x, y, time) ?? false;
        };

        actor._delegate = delegate;
        this._targets.push({actor, previousDelegate});
    }

    restoreAll() {
        for (const {actor, previousDelegate} of this._targets)
            actor._delegate = previousDelegate;
        this._targets = [];
    }
}
