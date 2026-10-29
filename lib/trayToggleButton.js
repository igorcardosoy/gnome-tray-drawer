import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {DropTargetRegistry} from './dropTargets.js';
import {IndicatorManager} from './indicatorManager.js';
import {OverflowGrid} from './overflowGrid.js';
import {getDropIndex, isNearButton, positionToggleButton} from './panelGeometry.js';

const CAPTURE_INTERVAL_SECONDS = 1;

export const TrayToggleButton = GObject.registerClass(
class TrayToggleButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'Tray Toggle', false);
        this.can_focus = false;

        this._rightBox = Main.panel._rightBox;
        if (!this._rightBox)
            throw new Error('GNOME Shell panel right box is unavailable');

        this._destroying = false;
        this._overflow = new OverflowGrid();
        this._overflow.addTo(this.menu.box);

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

        this._indicators = new IndicatorManager({
            rightBox: this._rightBox,
            overflow: this._overflow,
            drawerMenu: this.menu,
            indicatorMenuManager: new PopupMenu.PopupMenuManager(this),
            onPlacementChanged: () => positionToggleButton(this._rightBox, this),
        });

        this._dropTargets = new DropTargetRegistry();
        this._installDrawerDropTarget(this._overflow.widget);
        this._installDrawerDropTarget(this._overflow.emptyLabel);
        this._installDrawerDropTarget(this);
        this._installPanelDropTarget();

        this._monitorId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            CAPTURE_INTERVAL_SECONDS,
            () => {
                if (!this._destroying)
                    this.captureIndicators();
                return GLib.SOURCE_CONTINUE;
            });
    }

    captureIndicators() {
        this._indicators.captureIndicators();
    }

    _installDrawerDropTarget(actor) {
        this._dropTargets.install(actor, {
            accepts: source => {
                const entry = this._indicators.getDraggedEntry(source);
                return !!entry && !entry.hidden;
            },
            drop: source => this._indicators.setHidden(
                this._indicators.getDraggedEntry(source), true),
        });
    }

    _installPanelDropTarget() {
        this._dropTargets.install(Main.panel, {
            accepts: (source, x, y) => {
                const entry = this._indicators.getDraggedEntry(source);
                return !!entry && (entry.hidden || isNearButton(this, x, y));
            },
            drop: source => {
                const entry = this._indicators.getDraggedEntry(source);
                const restore = entry.hidden;
                if (restore)
                    entry.index = getDropIndex(this._rightBox);
                this._indicators.setHidden(entry, !restore);
            },
        });
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

    destroy() {
        this._destroying = true;
        GLib.Source.remove(this._monitorId);
        this.menu.disconnect(this._menuStateId);

        this._indicators.dispose();
        this._dropTargets.restoreAll();
        super.destroy();
    }
});
