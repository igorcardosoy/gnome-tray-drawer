import Clutter from 'gi://Clutter';
import St from 'gi://St';

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
            text: 'No hidden icons - middle-click or drag an app here',
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
        const children = this.widget.get_children();
        const columns = Math.min(children.length, MAX_COLUMNS);

        children.forEach((actor, index) => {
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
        const hasIndicators = this.widget.get_n_children() > 0;
        this.widget.visible = hasIndicators;
        this.emptyLabel.visible = !hasIndicators;
    }
}
