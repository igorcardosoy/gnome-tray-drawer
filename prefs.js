import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    gettext as _,
    initTranslations,
    pgettext,
    reloadTranslations,
} from './lib/translations.js';

const ICON_DIRECTIONS = ['auto', 'down', 'up', 'left', 'right'];

function getDirectionLabels() {
    return [
        _('Automatic (follow panel)'),
        pgettext('arrow direction', 'Down'),
        pgettext('arrow direction', 'Up'),
        pgettext('arrow direction', 'Left'),
        pgettext('arrow direction', 'Right'),
    ];
}

function getLanguageOptions() {
    // Language names are shown in their own language and stay untranslated.
    return [
        {value: 'system', label: _('Automatic (system)')},
        {value: 'en', label: 'English'},
        {value: 'pt_BR', label: 'Português (Brasil)'},
    ];
}

export default class TrayDrawerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Keep the settings object alive for the lifetime of the window.
        this._settings = window._settings = this.getSettings();
        const settings = this._settings;

        initTranslations({
            domain: this.metadata['gettext-domain'] ?? this.uuid,
            dir: this.dir.get_path(),
            settings,
        });

        if (!this._uiLanguageId) {
            this._uiLanguageId = settings.connect('changed::ui-language', () => {
                reloadTranslations(settings);
                this._scheduleTextUpdate();
            });
        }
        if (!this._directionChangedId) {
            this._directionChangedId = settings.connect('changed::icon-direction',
                () => this._updateDirectionSelection());
        }
        window.connect('destroy', () => this._disconnectSettings(settings));

        this._fillPage(window, settings);
    }

    _disconnectSettings(settings) {
        if (this._textUpdateId) {
            GLib.Source.remove(this._textUpdateId);
            this._textUpdateId = 0;
        }
        this._page = null;
        this._directionRow = null;
        this._rotateRow = null;
        this._animateRow = null;
        this._languageRow = null;
        if (this._uiLanguageId) {
            settings.disconnect(this._uiLanguageId);
            this._uiLanguageId = null;
        }
        if (this._directionChangedId) {
            settings.disconnect(this._directionChangedId);
            this._directionChangedId = null;
        }
    }

    _fillPage(window, settings) {
        if (this._page)
            window.remove(this._page);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: _('Drawer button'),
            description: _('By default the arrow points away from the panel edge, so it follows panels placed at the top, bottom, left or right.'),
        });
        page.add(group);

        const directionRow = new Adw.ComboRow({
            title: _('Arrow direction'),
            subtitle: _('Choose where the arrow points when the drawer is closed.'),
            model: Gtk.StringList.new(getDirectionLabels()),
        });
        this._updateDirectionSelection(directionRow);
        group.add(directionRow);

        const rotateRow = new Adw.SwitchRow({
            title: _('Rotate the arrow when opening'),
            subtitle: _('Flip the arrow when the drawer is open, so it points back towards the panel edge.'),
        });
        settings.bind('rotate-icon', rotateRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(rotateRow);

        const animateRow = new Adw.SwitchRow({
            title: _('Animate the arrow'),
            subtitle: _('Rotate the arrow smoothly when the drawer opens or closes.'),
        });
        settings.bind('animate-icon', animateRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        // There is nothing to animate when the arrow does not rotate.
        settings.bind('rotate-icon', animateRow, 'sensitive', Gio.SettingsBindFlags.GET);
        group.add(animateRow);

        const languageOptions = getLanguageOptions();
        const languageRow = new Adw.ComboRow({
            title: _('Interface language'),
            subtitle: _('Choose the language used by the extension.'),
            model: Gtk.StringList.new(languageOptions.map(option => option.label)),
        });
        languageRow.selected = Math.max(0, languageOptions
            .findIndex(option => option.value === settings.get_string('ui-language')));
        group.add(languageRow);

        languageRow.connect('notify::selected', () => {
            if (this._updatingTexts)
                return;
            settings.set_string('ui-language',
                languageOptions[languageRow.selected].value);
        });

        directionRow.connect('notify::selected', () => {
            if (this._updatingTexts)
                return;
            settings.set_string('icon-direction',
                ICON_DIRECTIONS[directionRow.selected]);
        });

        window.add(page);
        this._page = page;
        this._group = group;
        this._directionRow = directionRow;
        this._rotateRow = rotateRow;
        this._animateRow = animateRow;
        this._languageRow = languageRow;
    }

    _scheduleTextUpdate() {
        // GTK may still be dispatching the row activation that changed the
        // setting; mutating the ComboRow models inside that signal emission
        // crashes the list view, so the texts are refreshed on the next idle.
        if (this._textUpdateId)
            GLib.Source.remove(this._textUpdateId);
        this._textUpdateId = GLib.idle_add_once(GLib.PRIORITY_DEFAULT, () => {
            this._textUpdateId = 0;
            this._updateTexts();
        });
    }

    _updateDirectionSelection() {
        if (!this._directionRow)
            return;
        this._directionRow.selected = Math.max(0, ICON_DIRECTIONS
            .indexOf(this._settings.get_string('icon-direction')));
    }

    _updateTexts() {
        if (!this._page)
            return;

        this._updatingTexts = true;

        this._group.title = _('Drawer button');
        this._group.description = _('By default the arrow points away from the panel edge, so it follows panels placed at the top, bottom, left or right.');

        this._directionRow.title = _('Arrow direction');
        this._directionRow.subtitle = _('Choose where the arrow points when the drawer is closed.');
        this._directionRow.model = Gtk.StringList.new(getDirectionLabels());
        this._updateDirectionSelection();

        this._rotateRow.title = _('Rotate the arrow when opening');
        this._rotateRow.subtitle = _('Flip the arrow when the drawer is open, so it points back towards the panel edge.');

        this._animateRow.title = _('Animate the arrow');
        this._animateRow.subtitle = _('Rotate the arrow smoothly when the drawer opens or closes.');

        this._languageRow.title = _('Interface language');
        this._languageRow.subtitle = _('Choose the language used by the extension.');
        const languageOptions = getLanguageOptions();
        this._languageRow.model = Gtk.StringList.new(languageOptions.map(option => option.label));
        this._languageRow.selected = Math.max(0, languageOptions
            .findIndex(option => option.value === this._settings.get_string('ui-language')));

        this._updatingTexts = false;
    }
}
