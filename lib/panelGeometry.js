import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {findAppIndicator} from './indicatorDiscovery.js';

/**
 * Returns the screen edge the GNOME Shell panel is attached to. Extensions
 * such as Dash to Panel move the panel, so the actual position is measured
 * instead of assuming a top panel.
 *
 * @returns {'top'|'bottom'|'left'|'right'}
 */
export function getPanelSide() {
    const monitor = Main.layoutManager.primaryMonitor ??
        Main.layoutManager.monitors[0];
    if (!monitor)
        return 'top';

    const [panelX, panelY] = Main.panel.get_transformed_position();
    const [panelWidth, panelHeight] = Main.panel.get_transformed_size();
    if (!Number.isFinite(panelX) || !Number.isFinite(panelY))
        return 'top';

    const offsetX = panelX + panelWidth / 2 - (monitor.x + monitor.width / 2);
    const offsetY = panelY + panelHeight / 2 - (monitor.y + monitor.height / 2);

    if (Math.abs(offsetY) >= Math.abs(offsetX))
        return offsetY < 0 ? 'top' : 'bottom';
    return offsetX < 0 ? 'left' : 'right';
}

export function positionToggleButton(rightBox, button) {
    const children = rightBox.get_children()
        .filter(actor => actor !== button.container);
    let position = -1;

    for (const [index, actor] of children.entries()) {
        if (findAppIndicator(actor))
            position = index + 1;
    }

    if (position < 0 ||
        rightBox.get_children().indexOf(button.container) === position)
        return;

    rightBox.remove_child(button.container);
    rightBox.insert_child_at_index(button.container, position);
}

export function getDropIndex(rightBox) {
    const [pointerX] = global.get_pointer();
    const index = rightBox.get_children().findIndex(actor => {
        const [actorX] = actor.get_transformed_position();
        return actorX + actor.get_width() / 2 > pointerX;
    });
    return index < 0 ? rightBox.get_n_children() : index;
}

export function isNearButton(button, x, y) {
    const [panelX, panelY] = Main.panel.get_transformed_position();
    const [panelWidth] = Main.panel.get_transformed_size();
    const [buttonX, buttonY] = button.get_transformed_position();
    const [buttonWidth, buttonHeight] = button.get_transformed_size();
    const scale = panelWidth / Main.panel.width;
    if (!Number.isFinite(scale) || scale <= 0)
        return false;

    const centerX = (buttonX - panelX + buttonWidth / 2) / scale;
    const centerY = (buttonY - panelY + buttonHeight / 2) / scale;
    const halfWidth = Math.max(buttonWidth / scale / 2, 64);
    const halfHeight = Math.max(buttonHeight / scale / 2, 24);
    return Math.abs(x - centerX) <= halfWidth &&
        Math.abs(y - centerY) <= halfHeight;
}
