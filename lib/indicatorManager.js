import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {findAppIndicator, getIndicatorName, getIndicatorPreferenceId} from './indicatorDiscovery.js';
import {PreferenceStore} from './preferenceStore.js';
import {TrayIndicator} from './trayIndicator.js';
import {TrayWindowActivator} from './windowActivation.js';

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
        this._preferencesLoaded = false;
        this._windowActivator = new TrayWindowActivator();
        this._preferences = new PreferenceStore();
        this._preferences.load(() => {
            this._preferencesLoaded = true;
            this.captureIndicators();
        });
    }

    captureIndicators() {
        // Without the saved choices every indicator would fall back to the drawer.
        if (!this._preferencesLoaded)
            return;

        for (const [index, actor] of this._rightBox.get_children().entries()) {
            const entry = this._entries.get(actor);
            if (entry) {
                if (!entry.hidden)
                    entry.index = index;
                continue;
            }
            this._addIndicator(actor, index);
        }
        this._applyPanelOrder();
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
            if (!hidden)
                this._rememberPanelOrder();
            this._preferences.set(entry.id, hidden);
            this._preferences.save();
        }
        this._overflow.layout();
        this._onPlacementChanged();
    }

    dispose() {
        this._windowActivator.dispose();
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

        // The application ID is only known once the indicator is ready. It is
        // not visible before that, so it can wait for a later capture.
        if (indicator._indicator && !indicator._indicator.isReady)
            return;

        const id = getIndicatorPreferenceId(legacyId, indicator);
        if (!this._preferences.has(id) && this._preferences.has(legacyId)) {
            this._preferences.set(id, this._preferences.get(legacyId));
            this._preferences.delete(legacyId);
            this._preferences.save();
        }

        const entry = new TrayIndicator(id, actor, indicator, originalIndex);
        this._entries.set(actor, entry);
        entry.connectSignals({
            onDestroy: () => this._onIndicatorDestroyed(actor),
            onVisibilityChanged: () => {
                if (entry.hidden)
                    this._overflow.layout();
            },
            onMiddleClick: () => this._toggleFromMiddleClick(entry),
            onInteraction: () => this._windowActivator.noteInteraction(),
            onDragBegin: () => entry.closeMenu(),
            onDragEnd: () => {
                entry.clearPressedState();
                GLib.idle_add_once(GLib.PRIORITY_DEFAULT, () => this._resetPopupState(entry));
            },
        });

        if (this._preferences.get(id) !== false)
            this.setHidden(entry, true, false);
    }

    _panelEntries() {
        return this._rightBox.get_children()
            .map(actor => this._entries.get(actor))
            .filter(entry => entry && !entry.hidden);
    }

    _applyPanelOrder() {
        const order = this._preferences.getOrder();
        const entries = this._panelEntries();
        if (order.length === 0 || entries.length === 0)
            return;

        // Other extensions can insert items between the indicators after an
        // unlock, so the indicators are kept together as one block.
        const rank = new Map(order.map((id, index) => [id, index]));
        const getRank = entry => rank.get(entry.id) ?? order.length;
        const start = this._rightBox.get_children().indexOf(entries[0].actor);

        [...entries]
            .sort((first, second) => getRank(first) - getRank(second))
            .forEach((entry, index) => {
                const target = start + index;
                if (this._rightBox.get_children().indexOf(entry.actor) !== target)
                    this._rightBox.set_child_at_index(entry.actor, target);
            });
    }

    _rememberPanelOrder() {
        // Indicators that are not running keep their place in the saved order.
        const ids = this._panelEntries().map(entry => entry.id);
        const present = new Set(ids);
        const remaining = [...ids];
        const order = this._preferences.getOrder()
            .map(id => (present.has(id) ? remaining.shift() : id));
        this._preferences.setOrder([...order, ...remaining]);
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
        actor.show();
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
        if (this._entries.get(entry.actor) !== entry)
            return;

        entry.closeMenu();
        if (this._drawerMenu.isOpen)
            this._drawerMenu.close();
    }
}
