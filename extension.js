import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {TrayToggleButton} from './lib/trayToggleButton.js';

export default class TrayToggleExtension extends Extension {
    constructor() {
        super();
        this._button = null;
    }

    enable() {
        this._button = new TrayToggleButton(this.getSettings());
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
