import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {DropTargetRegistry} from './dropTargets.js';
import {IndicatorManager} from './indicatorManager.js';
import {OverflowGrid} from './overflowGrid.js';
import {getDropIndex, getPanelSide, isNearButton, positionToggleButton} from './panelGeometry.js';

const CAPTURE_INTERVAL_SECONDS = 1;
const ICON_ANIMATION_DURATION_MS = 200;

// The base arrow points down; rotating it makes it point in the configured
// direction.
const ICON_DIRECTION_ROTATIONS = {
    down: 0,
    up: 180,
    left: 90,
    right: -90,
};

// The arrow points away from the panel edge, towards the side where the popup
// opens.
const PANEL_SIDE_DIRECTIONS = {
    top: 'down',
    bottom: 'up',
    left: 'right',
    right: 'left',
};

export const TrayToggleButton = GObject.registerClass(
class TrayToggleButton extends PanelMenu.Button {
    constructor(settings) {
        super(0.5, _('Tray Toggle'), false);
        this.can_focus = false;
        this._settings = settings;
        this._focusIdleId = 0;

        this._rightBox = Main.panel._rightBox;
        if (!this._rightBox)
            throw new Error('GNOME Shell panel right box is unavailable');

        this._overflow = new OverflowGrid();
        this._overflow.addTo(this.menu.box);

        this.menu.box.add_style_class_name('tray-toggle-popup-content');
        this.menu.actor.add_style_class_name('tray-toggle-popup');
        this._menuStateId = this.menu.connect('open-state-changed', (_menu, open) => {
            this._syncIconRotation(true, open);

            if (this._focusIdleId) {
                GLib.Source.remove(this._focusIdleId);
                this._focusIdleId = 0;
            }
            if (open)
                return;

            this._focusIdleId = GLib.idle_add_once(GLib.PRIORITY_DEFAULT, () => {
                this._focusIdleId = 0;
                this._clearMenuButtonFocus();
            });
        });

        this._icon = new St.Icon({
            icon_name: 'pan-down-symbolic',
            style_class: 'system-status-icon',
        });
        this._icon.set_pivot_point(0.5, 0.5);
        this.add_child(this._icon);

        this._iconDirection = null;
        this._iconOpen = false;
        this._iconRotate = true;
        this._syncIconRotation(false);

        this._directionChangedId = this._settings.connect(
            'changed::icon-direction', () => this._syncIconRotation());
        this._rotateChangedId = this._settings.connect(
            'changed::rotate-icon', () => this._syncIconRotation());

        this._indicators = new IndicatorManager({
            rightBox: this._rightBox,
            overflow: this._overflow,
            drawerMenu: this.menu,
            indicatorMenuManager: new PopupMenu.PopupMenuManager(this),
            onPlacementChanged: () => {
                if (this._rightBox)
                    positionToggleButton(this._rightBox, this);
            },
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
                this.captureIndicators();
                // Dash to Panel and similar extensions move the panel at
                // runtime, so the arrow direction is re-checked periodically.
                this._syncIconRotation();
                return GLib.SOURCE_CONTINUE;
            });

        // On logout the panel is torn down before extensions are disabled, so
        // the timer must not touch the destroyed box any more.
        this._rightBoxDestroyId = this._rightBox.connect('destroy', () => {
            this._rightBoxDestroyId = 0;
            this._rightBox = null;
            this._stopMonitor();
        });
    }

    _stopMonitor() {
        if (this._monitorId) {
            GLib.Source.remove(this._monitorId);
            this._monitorId = 0;
        }
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

    _getIconDirection() {
        const direction = this._settings.get_string('icon-direction');
        if (direction !== 'auto' && Object.hasOwn(ICON_DIRECTION_ROTATIONS, direction))
            return direction;
        return PANEL_SIDE_DIRECTIONS[getPanelSide()] ?? 'down';
    }

    _syncIconRotation(animate = true, open = this.menu.isOpen) {
        if (!this._rightBox)
            return;

        const direction = this._getIconDirection();
        const rotate = this._settings.get_boolean('rotate-icon');
        if (direction === this._iconDirection &&
            open === this._iconOpen &&
            rotate === this._iconRotate)
            return;

        this._iconDirection = direction;
        this._iconOpen = open;
        this._iconRotate = rotate;

        const target = ICON_DIRECTION_ROTATIONS[direction] +
            (open && rotate ? 180 : 0);
        // The icon may be halfway through an animation. Continue from the
        // angle that is drawn and pick the closest equivalent target so it
        // never spins the long way around.
        const current = this._icon.rotation_angle_z;
        const rotation = target + 360 * Math.round((current - target) / 360);

        this._icon.remove_all_transitions();
        if (!animate ||
            !this._settings.get_boolean('animate-icon') ||
            !St.Settings.get().enable_animations) {
            this._icon.rotation_angle_z = rotation;
            return;
        }

        this._icon.ease({
            rotation_angle_z: rotation,
            duration: ICON_ANIMATION_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    _clearMenuButtonFocus() {
        if (!this._rightBox)
            return;

        this.remove_style_pseudo_class('active');
        this.remove_style_pseudo_class('focus');
        const focusedActor = global.stage.get_key_focus();
        if (focusedActor === this ||
            focusedActor === this.menu.actor ||
            (focusedActor && this.menu.actor.contains(focusedActor)))
            global.stage.set_key_focus(null);
    }

    destroy() {
        this._stopMonitor();
        if (this._focusIdleId) {
            GLib.Source.remove(this._focusIdleId);
            this._focusIdleId = 0;
        }
        if (this._directionChangedId)
            this._settings.disconnect(this._directionChangedId);
        if (this._rotateChangedId)
            this._settings.disconnect(this._rotateChangedId);

        const panelAlive = this._rightBox !== null;
        if (this._rightBox) {
            if (this._rightBoxDestroyId)
                this._rightBox.disconnect(this._rightBoxDestroyId);
            this._rightBox = null;
        }
        this.menu.disconnect(this._menuStateId);

        this._indicators.dispose(panelAlive);
        this._dropTargets.restoreAll();
        // At logout the panel is disposed before extensions are disabled; the
        // actor is already gone and calling into it again would only warn.
        if (panelAlive)
            super.destroy();
    }
});
