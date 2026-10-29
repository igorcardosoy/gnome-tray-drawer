import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {findAppIndicator, getIndicatorName, getIndicatorPreferenceId} from './indicatorDiscovery.js';
import {PreferenceStore} from './preferenceStore.js';
import {TrayIndicator} from './trayIndicator.js';

const OVERFLOW_STYLE_CLASS = 'tray-toggle-overflow-icon';

/**
 * Tracks the panel's AppIndicator icons and moves them between the panel
 * and the overflow drawer, persisting the user's choices.
 */
export class IndicatorManager {
    constructor({rightBox, overflow, drawerMenu, indicatorMenuManager, onPlacementChanged}) {
        this._rightBox = rightBox;
        this._overflow = overflow;
        this._drawerMenu = drawerMenu;
        this._indicatorMenuManager = indicatorMenuManager;
        this._onPlacementChanged = onPlacementChanged;

        this._entries = new Map();
        this._disposed = false;
        this._preferences = new PreferenceStore();
        this._preferences.load();
    }

    captureIndicators() {
        for (const [index, actor] of this._rightBox.get_children().entries()) {
            const entry = this._entries.get(actor);
            if (entry) {
                if (!entry.hidden)
                    entry.index = index;
                continue;
            }
            this._addIndicator(actor, index);
        }
        this._onPlacementChanged();
    }

    getDraggedEntry(source) {
        const entry = source?.entry;
        return entry && this._entries.get(entry.actor) === entry ? entry : null;
    }

    setHidden(entry, hidden, save = true) {
        if (entry.hidden === hidden)
            return;

        if (hidden)
            this._moveToDrawer(entry);
        else
            this._moveToPanel(entry);

        entry.hidden = hidden;
        if (save) {
            this._preferences.set(entry.id, hidden);
            this._preferences.save();
        }
        this._overflow.layout();
        this._onPlacementChanged();
    }

    dispose() {
        this._disposed = true;
        this._preferences.dispose();
        this._restoreAll();
    }

    _addIndicator(actor, originalIndex) {
        const [legacyId, indicator] = findAppIndicator(actor) ?? [];
        if (this._entries.has(actor) ||
            !indicator ||
            legacyId.toLowerCase().includes('clipboard') ||
            originalIndex < 0)
            return;

        const id = getIndicatorPreferenceId(legacyId, indicator);
        if (!this._preferences.has(id) && this._preferences.has(legacyId))
            this._preferences.set(id, this._preferences.get(legacyId));

        const entry = new TrayIndicator(id, actor, indicator, originalIndex);
        this._entries.set(actor, entry);
        entry.connectSignals({
            onDestroy: () => this._onIndicatorDestroyed(actor),
            onMiddleClick: () => this._toggleFromMiddleClick(entry),
            onDragBegin: () => entry.closeMenu(),
            onDragEnd: () => {
                entry.clearPressedState();
                GLib.idle_add_once(GLib.PRIORITY_DEFAULT, () => this._resetPopupState(entry));
            },
        });

        if (this._preferences.get(id) !== false)
            this.setHidden(entry, true, false);
    }

    _moveToDrawer(entry) {
        const {actor, indicator, menu} = entry;
        actor.get_parent()?.remove_child(actor);
        actor.tooltip_text = getIndicatorName(actor, indicator);
        actor.add_style_class_name(OVERFLOW_STYLE_CLASS);
        this._overflow.add(actor);

        if (menu) {
            Main.panel.menuManager.removeMenu(menu);
            entry.setMenuSource(actor);
            this._indicatorMenuManager.addMenu(menu);
        }
    }

    _moveToPanel(entry) {
        const {actor, menu} = entry;
        actor.remove_style_class_name(OVERFLOW_STYLE_CLASS);
        actor.tooltip_text = entry.tooltipText;

        if (menu) {
            menu.close();
            this._indicatorMenuManager.removeMenu(menu);
            entry.setMenuSource(entry.menuSourceActor);
            Main.panel.menuManager.addMenu(menu);
        }

        actor.get_parent()?.remove_child(actor);
        const restoreIndex = Math.min(entry.index, this._rightBox.get_n_children());
        this._rightBox.insert_child_at_index(actor, restoreIndex);
    }

    _restoreAll() {
        const hiddenEntries = [...this._entries.values()]
            .filter(entry => entry.hidden)
            .sort((first, second) => first.index - second.index);

        for (const entry of hiddenEntries)
            this._moveToPanel(entry);

        for (const entry of this._entries.values())
            entry.disconnectSignals();
        this._entries.clear();
    }

    _onIndicatorDestroyed(actor) {
        const entry = this._entries.get(actor);
        if (!entry)
            return;

        entry.disconnectSignals();
        if (entry.hidden && entry.menu) {
            this._indicatorMenuManager.removeMenu(entry.menu);
            entry.setMenuSource(entry.menuSourceActor);
        }

        this._entries.delete(actor);
        this._overflow.remove(actor);
        this._overflow.layout();
    }

    _toggleFromMiddleClick(entry) {
        if (this._entries.get(entry.actor) === entry)
            this.setHidden(entry, !entry.hidden);
    }

    _resetPopupState(entry) {
        if (this._disposed || this._entries.get(entry.actor) !== entry)
            return;

        entry.closeMenu();
        if (this._drawerMenu.isOpen)
            this._drawerMenu.close();
    }
}
