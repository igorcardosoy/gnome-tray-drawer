import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _, pgettext} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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

export default class TrayDrawerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        // Everything below is scoped to this window and released on close.
        let directionRow = null;

        const updateDirectionSelection = () => {
            if (!directionRow)
                return;
            directionRow.selected = Math.max(0, ICON_DIRECTIONS
                .indexOf(settings.get_string('icon-direction')));
        };

        const directionChangedId = settings.connect('changed::icon-direction',
            updateDirectionSelection);

        window.connect('close-request', () => {
            settings.disconnect(directionChangedId);
            directionRow = null;
            return false;
        });

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
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
            settings.set_string('icon-direction',
                ICON_DIRECTIONS[directionRow.selected]);
        });

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

        window.add(page);
    }
}
