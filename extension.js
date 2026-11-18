import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {initTranslations} from './lib/translations.js';
import {TrayToggleButton} from './lib/trayToggleButton.js';

export default class TrayToggleExtension extends Extension {
    enable() {
        const settings = this.getSettings();
        initTranslations({
            domain: this.metadata['gettext-domain'] ?? this.uuid,
            dir: this.dir.get_path(),
            settings,
            onLoaded: () => this._button?.updateTexts(),
        });
        this._button = new TrayToggleButton(settings);
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
