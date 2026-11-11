import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// How long after a tray click a window may still claim the focus.
const ACTIVATION_TIMEOUT_US = 3 * GLib.USEC_PER_SEC;

/**
 * Tray icons talk to their application over D-Bus, so the application gets
 * no activation token from the click. On Wayland GNOME Shell then refuses to
 * focus the window and shows an "is ready" notification instead. A window
 * that asks for attention right after a tray click is focused here.
 */
export class TrayWindowActivator {
    constructor() {
        this._lastInteraction = 0;
        this._signalIds = ['window-demands-attention', 'window-marked-urgent']
            .map(signal => global.display.connect(signal,
                (_display, window) => this._onWindowAttention(window)));
    }

    noteInteraction() {
        this._lastInteraction = GLib.get_monotonic_time();
    }

    dispose() {
        for (const id of this._signalIds)
            global.display.disconnect(id);
        this._signalIds = [];
    }

    _onWindowAttention(window) {
        if (!window || window.has_focus() || window.is_skip_taskbar())
            return;
        if (GLib.get_monotonic_time() - this._lastInteraction > ACTIVATION_TIMEOUT_US)
            return;

        this._lastInteraction = 0;
        Main.activateWindow(window);
    }
}
