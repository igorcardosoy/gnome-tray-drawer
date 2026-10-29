import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {IndicatorDrag} from './indicatorDrag.js';

/**
 * State and signal wiring for a single AppIndicator icon.
 */
export class TrayIndicator {
    constructor(id, actor, indicator, index) {
        this.id = id;
        this.actor = actor;
        this.indicator = indicator;
        this.index = index;
        this.hidden = false;
        this.tooltipText = actor.tooltip_text;
        this.menu = indicator.menu ?? null;
        this.menuSourceActor = indicator.menu?.sourceActor ?? null;

        this._connections = [];
        this._drag = null;
    }

    connectSignals({onDestroy, onMiddleClick, onDragBegin, onDragEnd}) {
        this._connect(this.actor, 'destroy', () => onDestroy());
        this._connect(this.indicator, 'button-press-event',
            (_indicator, event) => this._onMiddlePress(event, onMiddleClick));

        this._drag = new IndicatorDrag(this, {onBegin: onDragBegin, onEnd: onDragEnd});

        if (this.indicator._indicator && this.indicator !== this.actor) {
            this._connect(this.indicator, 'button-press-event',
                (_indicator, event) => this._onPrimaryPress(event));
            this._connect(this.indicator, 'button-release-event',
                (_indicator, event) => this._onPrimaryRelease(event));
        }
    }

    disconnectSignals() {
        this._drag?.disconnect();
        this._drag = null;

        for (const {target, id} of this._connections)
            target.disconnect(id);
        this._connections = [];
    }

    closeMenu() {
        if (this.menu?.isOpen)
            this.menu.close();
    }

    setMenuSource(sourceActor) {
        if (this.menu)
            this.menu.sourceActor = sourceActor;
    }

    clearPressedState() {
        for (const actor of new Set([this.indicator, this.actor])) {
            if (actor instanceof St.Button)
                actor.fake_release();
            actor.remove_style_pseudo_class?.('active');
        }
    }

    _connect(target, signal, handler) {
        this._connections.push({target, id: target.connect(signal, handler)});
    }

    _onMiddlePress(event, onMiddleClick) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
            event.get_button() !== Clutter.BUTTON_MIDDLE)
            return Clutter.EVENT_PROPAGATE;

        GObject.signal_stop_emission_by_name(this.indicator, 'button-press-event');
        GLib.idle_add_once(GLib.PRIORITY_DEFAULT, () => onMiddleClick());
        return Clutter.EVENT_STOP;
    }

    _onPrimaryPress(event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
            event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        this.indicator._waitForDoubleClickPromise?.cancel();
        GObject.signal_stop_emission_by_name(this.indicator, 'button-press-event');
        return Clutter.EVENT_PROPAGATE;
    }

    _onPrimaryRelease(event) {
        if (event.type() !== Clutter.EventType.BUTTON_RELEASE ||
            event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        GObject.signal_stop_emission_by_name(this.indicator, 'button-release-event');
        if (this.menu?.numMenuItems)
            this.menu.toggle();
        return Clutter.EVENT_STOP;
    }
}
