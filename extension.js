import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const MAX_GRID_COLUMNS = 4;

const TrayToggleButton = GObject.registerClass(
class TrayToggleButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'Tray Toggle', false);
        this.can_focus = false;

        this._rightBox = Main.panel._rightBox;
        if (!this._rightBox)
            throw new Error('GNOME Shell panel right box is unavailable');

        this._entries = new Map();
        this._visibility = new Map();
        this._preferencesPath = GLib.build_filenamev([
            GLib.get_user_config_dir(),
            'tray-drawer',
            'visibility.json',
        ]);
        this._loadPreferences();
        this._destroying = false;
        this._indicatorMenuManager = new PopupMenu.PopupMenuManager(this);

        this._gridLayout = new Clutter.GridLayout();
        this._gridLayout.set_column_spacing(4);
        this._gridLayout.set_row_spacing(4);
        this._grid = new St.Widget({
            style_class: 'tray-toggle-overflow-grid',
            layout_manager: this._gridLayout,
        });
        this.menu.box.add_child(this._grid);

        this._emptyLabel = new St.Label({
            text: 'No hidden icons - middle-click an app to add it',
            style_class: 'tray-toggle-empty',
        });
        this.menu.box.add_child(this._emptyLabel);
        this.menu.box.add_style_class_name('tray-toggle-popup-content');
        this.menu.actor.add_style_class_name('tray-toggle-popup');
        this._menuStateId = this.menu.connect('open-state-changed', (_menu, open) => {
            if (!open) {
                GLib.idle_add_once(GLib.PRIORITY_DEFAULT,
                    () => this._clearMenuButtonFocus());
            }
        });

        this._icon = new St.Icon({
            icon_name: 'pan-down-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this._monitorId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            1,
            () => {
                if (!this._destroying)
                    this.captureIndicators();
                return GLib.SOURCE_CONTINUE;
            });
        this._updateEmptyState();
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
    }

    _getAppIndicator(actor) {
        return Object.entries(Main.panel.statusArea).find(([key, item]) =>
            key.startsWith('appindicator-') &&
            !key.toLowerCase().includes('clipboard') &&
            item?.container === actor) ?? null;
    }

    _getIndicatorName(actor, indicator) {
        if (indicator.accessibleName)
            return indicator.accessibleName;
        if (actor.accessible_name)
            return actor.accessible_name;

        const role = Object.entries(Main.panel.statusArea)
            .find(([, item]) => item === indicator)?.[0];
        return role?.replace(/^appindicator-/, '') ?? 'Application';
    }

    _loadPreferences() {
        try {
            const [success, contents] = GLib.file_get_contents(this._preferencesPath);
            if (!success)
                throw new Error(`Unable to read ${this._preferencesPath}`);

            const preferences = JSON.parse(new TextDecoder().decode(contents));
            if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences))
                throw new Error('Tray drawer preferences must be a JSON object');

            for (const [id, hidden] of Object.entries(preferences)) {
                if (typeof hidden === 'boolean')
                    this._visibility.set(id, hidden);
            }
        } catch (error) {
            if (error.matches?.(GLib.FileError, GLib.FileError.NOENT))
                return;
            logError(error, 'Unable to load tray drawer preferences');
        }
    }

    _savePreferences() {
        try {
            const directory = GLib.path_get_dirname(this._preferencesPath);
            if (GLib.mkdir_with_parents(directory, 0o755) !== 0)
                throw new Error(`Unable to create ${directory}`);

            const contents = JSON.stringify(Object.fromEntries(this._visibility));
            if (!GLib.file_set_contents(this._preferencesPath, contents))
                throw new Error(`Unable to write ${this._preferencesPath}`);
        } catch (error) {
            logError(error, 'Unable to save tray drawer preferences');
        }
    }

    _clearMenuButtonFocus() {
        this.remove_style_pseudo_class('active');
        this.remove_style_pseudo_class('focus');
        const focusedActor = global.stage.get_key_focus();
        if (focusedActor === this ||
            focusedActor === this.menu.actor ||
            (focusedActor && this.menu.actor.contains(focusedActor)))
            global.stage.set_key_focus(null);
    }

    _addIndicator(actor, originalIndex) {
        const [id, indicator] = this._getAppIndicator(actor) ?? [];
        if (this._entries.has(actor) || !indicator || originalIndex < 0)
            return;

        const entry = {
            id,
            index: originalIndex,
            actor,
            indicator,
            destroyId: actor.connect('destroy', () => this._onIndicatorDestroyed(actor)),
            menu: indicator.menu ?? null,
            menuSourceActor: indicator.menu?.sourceActor ?? null,
            tooltipText: actor.tooltip_text,
            hidden: false,
            indicatorReleaseId: 0,
            indicatorPressId: 0,
            middlePressId: 0,
        };
        this._entries.set(actor, entry);

        entry.middlePressId = indicator.connect('button-press-event',
            (_indicator, event) => this._onIndicatorMiddlePress(entry, event));

        if (this._visibility.get(id) !== false)
            this._setIndicatorHidden(entry, true, false);
    }

    _setMenuSource(entry, sourceActor) {
        if (entry.menu)
            entry.menu.sourceActor = sourceActor;
    }

    _setIndicatorHidden(entry, hidden, save = true) {
        if (entry.hidden === hidden)
            return;

        const {actor} = entry;
        actor.get_parent()?.remove_child(actor);

        if (hidden) {
            actor.tooltip_text = this._getIndicatorName(actor, entry.indicator);
            actor.add_style_class_name('tray-toggle-overflow-icon');
            this._grid.add_child(actor);

            if (entry.menu) {
                Main.panel.menuManager.removeMenu(entry.menu);
                entry.menu.sourceActor = actor;
                this._indicatorMenuManager.addMenu(entry.menu);
            }

            if (entry.indicator._indicator) {
                if (entry.indicator !== actor) {
                    entry.indicatorPressId = entry.indicator.connect(
                        'button-press-event',
                        (_indicator, event) =>
                            this._onIndicatorPrimaryPress(entry, event));
                    entry.indicatorReleaseId = entry.indicator.connect(
                        'button-release-event',
                        (_indicator, event) =>
                            this._onIndicatorPrimaryRelease(entry, event));
                }
            }
        } else {
            if (entry.indicatorPressId) {
                entry.indicator.disconnect(entry.indicatorPressId);
                entry.indicatorPressId = 0;
            }
            if (entry.indicatorReleaseId) {
                entry.indicator.disconnect(entry.indicatorReleaseId);
                entry.indicatorReleaseId = 0;
            }

            actor.remove_style_class_name('tray-toggle-overflow-icon');
            actor.tooltip_text = entry.tooltipText;
            if (entry.menu) {
                entry.menu.close();
                this._indicatorMenuManager.removeMenu(entry.menu);
                this._setMenuSource(entry, entry.menuSourceActor);
                Main.panel.menuManager.addMenu(entry.menu);
            }

            const restoreIndex = Math.min(entry.index, this._rightBox.get_n_children());
            this._rightBox.insert_child_at_index(actor, restoreIndex);
        }

        entry.hidden = hidden;
        if (save) {
            this._visibility.set(entry.id, hidden);
            this._savePreferences();
        }
        this._layoutIndicators();
    }

    _onIndicatorPrimaryPress(entry, event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
            event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        entry.indicator._waitForDoubleClickPromise?.cancel();
        GObject.signal_stop_emission_by_name(entry.indicator, 'button-press-event');
        return Clutter.EVENT_PROPAGATE;
    }

    _onIndicatorMiddlePress(entry, event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
            event.get_button() !== Clutter.BUTTON_MIDDLE)
            return Clutter.EVENT_PROPAGATE;

        GObject.signal_stop_emission_by_name(entry.indicator, 'button-press-event');
        GLib.idle_add_once(GLib.PRIORITY_DEFAULT, () => {
            if (this._entries.get(entry.actor) === entry)
                this._setIndicatorHidden(entry, !entry.hidden);
        });
        return Clutter.EVENT_STOP;
    }

    _onIndicatorPrimaryRelease(entry, event) {
        if (event.type() !== Clutter.EventType.BUTTON_RELEASE ||
            event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        GObject.signal_stop_emission_by_name(entry.indicator, 'button-release-event');
        if (entry.menu?.numMenuItems)
            entry.menu.toggle();
        return Clutter.EVENT_STOP;
    }

    _onIndicatorDestroyed(actor) {
        const entry = this._entries.get(actor);
        if (!entry)
            return;

        if (entry.indicatorPressId)
            entry.indicator.disconnect(entry.indicatorPressId);
        if (entry.indicatorReleaseId)
            entry.indicator.disconnect(entry.indicatorReleaseId);
        if (entry.middlePressId)
            entry.indicator.disconnect(entry.middlePressId);
        if (entry.hidden && entry.menu)
            this._indicatorMenuManager.removeMenu(entry.menu);
        if (entry.hidden && entry.menu)
            this._setMenuSource(entry, entry.menuSourceActor);

        this._entries.delete(actor);
        if (actor.get_parent() === this._grid)
            this._grid.remove_child(actor);
        this._layoutIndicators();
    }

    _layoutIndicators() {
        const children = this._grid.get_children();
        const columns = Math.min(children.length, MAX_GRID_COLUMNS);
        let index = 0;
        for (const actor of children) {
            this._gridLayout.attach(
                actor,
                index % columns,
                Math.floor(index / columns),
                1,
                1);
            index++;
        }
        this._updateEmptyState();
    }

    _updateEmptyState() {
        const hasIndicators = this._grid.get_n_children() > 0;
        this._grid.visible = hasIndicators;
        this._emptyLabel.visible = !hasIndicators;
    }

    _restoreIndicators() {
        const indicators = [...this._entries.values()]
            .filter(entry => entry.hidden)
            .sort((first, second) => first.index - second.index);

        for (const entry of indicators) {
            const {actor, menu} = entry;
            actor.remove_style_class_name('tray-toggle-overflow-icon');
            actor.tooltip_text = entry.tooltipText;
            if (menu) {
                menu.close();
                this._indicatorMenuManager.removeMenu(menu);
                this._setMenuSource(entry, entry.menuSourceActor);
                Main.panel.menuManager.addMenu(menu);
            }

            actor.get_parent()?.remove_child(actor);
            const restoreIndex = Math.min(entry.index, this._rightBox.get_n_children());
            this._rightBox.insert_child_at_index(actor, restoreIndex);
        }

        for (const entry of this._entries.values()) {
            const {actor, indicator, destroyId} = entry;
            actor.disconnect(destroyId);
            if (entry.indicatorPressId)
                indicator.disconnect(entry.indicatorPressId);
            if (entry.indicatorReleaseId)
                indicator.disconnect(entry.indicatorReleaseId);
            if (entry.middlePressId)
                indicator.disconnect(entry.middlePressId);
        }
        this._entries.clear();
    }

    destroy() {
        this._destroying = true;
        GLib.Source.remove(this._monitorId);
        this.menu.disconnect(this._menuStateId);

        this._restoreIndicators();
        super.destroy();
    }
});

export default class TrayToggleExtension {
    constructor() {
        this._button = null;
    }

    enable() {
        this._button = new TrayToggleButton();
        Main.panel.addToStatusArea('tray-toggle', this._button, 1, 'right');
        this._button.captureIndicators();
    }

    disable() {
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
    }
}
