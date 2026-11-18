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
        const settings = this.getSettings();
        window._settings = settings;

        // Everything below is scoped to this window and released on close.
        let updatingTexts = false;
        let textUpdateId = 0;
        let group = null;
        let directionRow = null;
        let rotateRow = null;
        let animateRow = null;
        let languageRow = null;

        const updateDirectionSelection = () => {
            if (!directionRow)
                return;
            directionRow.selected = Math.max(0, ICON_DIRECTIONS
                .indexOf(settings.get_string('icon-direction')));
        };

        const updateTexts = () => {
            if (!group)
                return;

            updatingTexts = true;

            group.title = _('Drawer button');
            group.description = _('By default the arrow points away from the panel edge, so it follows panels placed at the top, bottom, left or right.');

            directionRow.title = _('Arrow direction');
            directionRow.subtitle = _('Choose where the arrow points when the drawer is closed.');
            directionRow.model = Gtk.StringList.new(getDirectionLabels());
            updateDirectionSelection();

            rotateRow.title = _('Rotate the arrow when opening');
            rotateRow.subtitle = _('Flip the arrow when the drawer is open, so it points back towards the panel edge.');

            animateRow.title = _('Animate the arrow');
            animateRow.subtitle = _('Rotate the arrow smoothly when the drawer opens or closes.');

            languageRow.title = _('Interface language');
            languageRow.subtitle = _('Choose the language used by the extension.');
            const languageOptions = getLanguageOptions();
            languageRow.model = Gtk.StringList.new(languageOptions.map(option => option.label));
            languageRow.selected = Math.max(0, languageOptions
                .findIndex(option => option.value === settings.get_string('ui-language')));

            updatingTexts = false;
        };

        const scheduleTextUpdate = () => {
            // GTK may still be dispatching the row activation that changed the
            // setting; mutating the ComboRow models inside that signal emission
            // crashes the list view, so the texts are refreshed on the next idle.
            if (textUpdateId)
                GLib.Source.remove(textUpdateId);
            textUpdateId = GLib.idle_add_once(GLib.PRIORITY_DEFAULT, () => {
                textUpdateId = 0;
                updateTexts();
            });
        };

        const uiLanguageId = settings.connect('changed::ui-language', () => {
            reloadTranslations(settings, () => scheduleTextUpdate());
        });
        const directionChangedId = settings.connect('changed::icon-direction',
            updateDirectionSelection);

        window.connect('close-request', () => {
            if (textUpdateId) {
                GLib.Source.remove(textUpdateId);
                textUpdateId = 0;
            }
            settings.disconnect(uiLanguageId);
            settings.disconnect(directionChangedId);
            group = null;
            directionRow = null;
            rotateRow = null;
            animateRow = null;
            languageRow = null;
            return false;
        });

        initTranslations({
            domain: this.metadata['gettext-domain'] ?? this.uuid,
            dir: this.dir.get_path(),
            settings,
            onLoaded: () => scheduleTextUpdate(),
        });

        const page = new Adw.PreferencesPage();
        group = new Adw.PreferencesGroup({
            title: _('Drawer button'),
            description: _('By default the arrow points away from the panel edge, so it follows panels placed at the top, bottom, left or right.'),
        });
        page.add(group);

        directionRow = new Adw.ComboRow({
            title: _('Arrow direction'),
            subtitle: _('Choose where the arrow points when the drawer is closed.'),
            model: Gtk.StringList.new(getDirectionLabels()),
        });
        updateDirectionSelection();
        group.add(directionRow);

        directionRow.connect('notify::selected', () => {
            if (updatingTexts)
                return;
            settings.set_string('icon-direction',
                ICON_DIRECTIONS[directionRow.selected]);
        });

        rotateRow = new Adw.SwitchRow({
            title: _('Rotate the arrow when opening'),
            subtitle: _('Flip the arrow when the drawer is open, so it points back towards the panel edge.'),
        });
        settings.bind('rotate-icon', rotateRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(rotateRow);

        animateRow = new Adw.SwitchRow({
            title: _('Animate the arrow'),
            subtitle: _('Rotate the arrow smoothly when the drawer opens or closes.'),
        });
        settings.bind('animate-icon', animateRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        // There is nothing to animate when the arrow does not rotate.
        settings.bind('rotate-icon', animateRow, 'sensitive', Gio.SettingsBindFlags.GET);
        group.add(animateRow);

        languageRow = new Adw.ComboRow({
            title: _('Interface language'),
            subtitle: _('Choose the language used by the extension.'),
            model: Gtk.StringList.new(getLanguageOptions().map(option => option.label)),
        });
        languageRow.selected = Math.max(0, getLanguageOptions()
            .findIndex(option => option.value === settings.get_string('ui-language')));
        group.add(languageRow);

        languageRow.connect('notify::selected', () => {
            if (updatingTexts)
                return;
            const option = getLanguageOptions()[languageRow.selected];
            settings.set_string('ui-language', option.value);
        });

        window.add(page);
    }
}
