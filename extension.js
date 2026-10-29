import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

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
        this._dropDelegates = [];
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
            text: 'No hidden icons - middle-click or drag an app here',
            style_class: 'tray-toggle-empty',
        });
        this.menu.box.add_child(this._emptyLabel);
        this._installDropDelegate(this._grid);
        this._installDropDelegate(this._emptyLabel);
        this._installDropDelegate(this);
        this._installPanelDropDelegate();
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
        this._positionToggleButton();
    }

    _getAppIndicator(actor) {
        return Object.entries(Main.panel.statusArea).find(([key, item]) =>
            key.startsWith('appindicator-') &&
            item?.container === actor) ?? null;
    }

    _positionToggleButton() {
        const children = this._rightBox.get_children()
            .filter(actor => actor !== this);
        let position = -1;

        for (const [index, actor] of children.entries()) {
            if (this._getAppIndicator(actor))
                position = index + 1;
        }

        if (position < 0 ||
            this._rightBox.get_children().indexOf(this) === position)
            return;

        this._rightBox.remove_child(this);
        this._rightBox.insert_child_at_index(this, position);
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

    _getIndicatorPreferenceId(id, indicator) {
        const appId = indicator._indicator?.id?.trim();
        if (appId)
            return `app:${appId}`;

        const wmClass = indicator._icon?.wm_class?.trim();
        if (wmClass)
            return `wm-class:${wmClass}`;

        return id;
    }

    _loadPreferences() {
        const file = Gio.File.new_for_path(this._preferencesPath);
        file.load_contents_async(null, (source, result) => {
            if (this._destroying)
                return;

            try {
                const [, contents] = source.load_contents_finish(result);
                const preferences = JSON.parse(new TextDecoder().decode(contents));
                if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences))
                    throw new Error('Tray drawer preferences must be a JSON object');

                // Keep any choice the user made before this asynchronous load finished.
                for (const [id, hidden] of Object.entries(preferences)) {
                    if (typeof hidden === 'boolean' && !this._visibility.has(id))
                        this._visibility.set(id, hidden);
                }
            } catch (error) {
                if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                    return;
                logError(error, 'Unable to load tray drawer preferences');
            }
        });
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
        const [legacyId, indicator] = this._getAppIndicator(actor) ?? [];
        if (this._entries.has(actor) ||
            !indicator ||
            legacyId.toLowerCase().includes('clipboard') ||
            originalIndex < 0)
            return;

        const id = this._getIndicatorPreferenceId(legacyId, indicator);
        if (!this._visibility.has(id) && this._visibility.has(legacyId))
            this._visibility.set(id, this._visibility.get(legacyId));

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
            dragBeginId: 0,
            dragEndId: 0,
            draggable: null,
            dragDelegate: null,
            previousDelegate: null,
        };
        this._entries.set(actor, entry);

        entry.middlePressId = indicator.connect('button-press-event',
            (_indicator, event) => this._onIndicatorMiddlePress(entry, event));

        entry.previousDelegate = indicator._delegate ?? null;
        entry.dragDelegate = Object.create(entry.previousDelegate);
        entry.dragDelegate.entry = entry;
        entry.dragDelegate.getDragActor = () => {
            const dragActor = new Clutter.Clone({source: actor, reactive: false});
            dragActor.set_size(...actor.get_size());
            return dragActor;
        };
        entry.dragDelegate.getDragActorSource = () => actor;
        indicator._delegate = entry.dragDelegate;
        entry.draggable = DND.makeDraggable(indicator, {restoreOnSuccess: false});
        entry.dragBeginId = entry.draggable.connect('drag-begin', () => this._closeEntryMenu(entry));
        entry.dragEndId = entry.draggable.connect('drag-end', () => {
            this._clearPressedState(entry);
            GLib.idle_add_once(GLib.PRIORITY_DEFAULT, () => this._resetPopupState(entry));
        });
        if (indicator._indicator && indicator !== actor) {
            entry.indicatorPressId = indicator.connect('button-press-event',
                (_indicator, event) => this._onIndicatorPrimaryPress(entry, event));
            entry.indicatorReleaseId = indicator.connect('button-release-event',
                (_indicator, event) => this._onIndicatorPrimaryRelease(entry, event));
        }

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
        } else {
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
        this._positionToggleButton();
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

    _resetPopupState(entry) {
        if (this._destroying || this._entries.get(entry.actor) !== entry)
            return;

        this._closeEntryMenu(entry);
        if (this.menu.isOpen)
            this.menu.close();
    }

    _closeEntryMenu(entry) {
        if (entry.menu?.isOpen)
            entry.menu.close();
    }

    _clearPressedState(entry) {
        for (const actor of new Set([entry.indicator, entry.actor])) {
            if (actor instanceof St.Button)
                actor.fake_release();
            actor.remove_style_pseudo_class?.('active');
        }
    }

    _getDraggedEntry(source) {
        const entry = source?.entry;
        return entry && this._entries.get(entry.actor) === entry ? entry : null;
    }

    _installDropDelegate(actor) {
        const previousDelegate = actor._delegate ?? null;
        const delegate = Object.create(previousDelegate);
        delegate.handleDragOver = (source, ...args) => {
            const entry = this._getDraggedEntry(source);
            if (entry && !entry.hidden)
                return DND.DragMotionResult.MOVE_DROP;

            return previousDelegate?.handleDragOver?.call(previousDelegate, source, ...args) ??
                DND.DragMotionResult.CONTINUE;
        };
        delegate.acceptDrop = (source, dragActor, ...args) => {
            const entry = this._getDraggedEntry(source);
            if (entry && !entry.hidden) {
                this._setIndicatorHidden(entry, true);
                return true;
            }

            return previousDelegate?.acceptDrop?.call(
                previousDelegate, source, dragActor, ...args) ?? false;
        };
        actor._delegate = delegate;
        this._dropDelegates.push({actor, previousDelegate});
    }

    _installPanelDropDelegate() {
        const actor = Main.panel;
        const previousDelegate = actor._delegate ?? null;
        const delegate = Object.create(previousDelegate);
        const canDrop = (source, x, y) => {
            const entry = this._getDraggedEntry(source);
            return !!entry && (entry.hidden || this._isNearDrawerButton(x, y));
        };
        delegate.handleDragOver = (source, dragActor, x, y, time) => {
            if (canDrop(source, x, y))
                return DND.DragMotionResult.MOVE_DROP;

            return previousDelegate?.handleDragOver?.call(
                previousDelegate, source, dragActor, x, y, time) ??
                DND.DragMotionResult.CONTINUE;
        };
        delegate.acceptDrop = (source, dragActor, x, y, time) => {
            if (canDrop(source, x, y)) {
                const entry = this._getDraggedEntry(source);
                const restore = entry.hidden;
                if (restore)
                    entry.index = this._getDropIndex();
                this._setIndicatorHidden(entry, !restore);
                return true;
            }

            return previousDelegate?.acceptDrop?.call(
                previousDelegate, source, dragActor, x, y, time) ?? false;
        };
        actor._delegate = delegate;
        this._dropDelegates.push({actor, previousDelegate});
    }

    _restoreDropDelegates() {
        for (const {actor, previousDelegate} of this._dropDelegates)
            actor._delegate = previousDelegate;
        this._dropDelegates = [];
    }

    _isNearDrawerButton(x, y) {
        const [panelX, panelY] = Main.panel.get_transformed_position();
        const [panelWidth] = Main.panel.get_transformed_size();
        const [buttonX, buttonY] = this.get_transformed_position();
        const [buttonWidth, buttonHeight] = this.get_transformed_size();
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

    _getDropIndex() {
        const [pointerX] = global.get_pointer();
        const index = this._rightBox.get_children().findIndex(actor => {
            const [actorX] = actor.get_transformed_position();
            return actorX + actor.get_width() / 2 > pointerX;
        });
        return index < 0 ? this._rightBox.get_n_children() : index;
    }

    _disconnectEntryDrag(entry) {
        if (entry.dragBeginId) {
            entry.draggable.disconnect(entry.dragBeginId);
            entry.dragBeginId = 0;
        }
        if (entry.dragEndId) {
            entry.draggable.disconnect(entry.dragEndId);
            entry.dragEndId = 0;
        }
        if (entry.indicator._delegate === entry.dragDelegate)
            entry.indicator._delegate = entry.previousDelegate;
    }

    _onIndicatorDestroyed(actor) {
        const entry = this._entries.get(actor);
        if (!entry)
            return;

        this._disconnectEntryDrag(entry);
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
            this._disconnectEntryDrag(entry);
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
        this._restoreDropDelegates();
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
