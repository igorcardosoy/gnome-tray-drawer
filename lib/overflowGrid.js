import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {gettext as _} from './translations.js';

const MAX_COLUMNS = 4;
const GRID_SPACING = 4;

export class OverflowGrid {
    constructor() {
        this._layout = new Clutter.GridLayout();
        this._layout.set_column_spacing(GRID_SPACING);
        this._layout.set_row_spacing(GRID_SPACING);

        this.widget = new St.Widget({
            style_class: 'tray-toggle-overflow-grid',
            layout_manager: this._layout,
        });
        this.emptyLabel = new St.Label({
            text: _('No hidden icons - middle-click or drag an app here'),
            style_class: 'tray-toggle-empty',
        });
        this.updateEmptyState();
    }

    addTo(container) {
        container.add_child(this.widget);
        container.add_child(this.emptyLabel);
    }

    add(actor) {
        this.widget.add_child(actor);
    }

    remove(actor) {
        if (actor.get_parent() === this.widget)
            this.widget.remove_child(actor);
    }

    layout() {
        // Passive indicators hide their button but not its container, which
        // would otherwise take up an empty grid cell.
        const children = this.widget.get_children();
        children.forEach(actor => (actor.visible = !!actor.child?.visible));
        const visibleChildren = children.filter(actor => actor.visible);
        const columns = Math.min(visibleChildren.length, MAX_COLUMNS);

        visibleChildren.forEach((actor, index) => {
            this._layout.attach(
                actor,
                index % columns,
                Math.floor(index / columns),
                1,
                1);
        });
        this.updateEmptyState();
    }

    updateEmptyState() {
        const hasIndicators = this.widget.get_children().some(actor => actor.visible);
        this.widget.visible = hasIndicators;
        this.emptyLabel.visible = !hasIndicators;
    }

    setEmptyText(text) {
        this.emptyLabel.text = text;
        this.updateEmptyState();
    }
}
